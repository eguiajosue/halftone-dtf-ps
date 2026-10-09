'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {folder}=require('./support/storage'),batch=require('../plugin/batch'),project=require('../plugin/project'),{MemoryStore}=require('../plugin/tiles'),sizing=require('../plugin/sizing');
function hostFixture(token={}){
 const calls=[];let id=1,saves=0;
 return {calls,host:{
  openBatchSource:async file=>{calls.push(['open',file.name]);return {documentID:id++,width:100,height:150,owned:true};},closeBatchSource:async()=>calls.push(['close']),
  beginSession:async(_,options,progress)=>{progress('resize',0);calls.push(['begin',options]);return {documentID:id++,size:sizing.plan(100,150,300,options),stats:{inkPixels:10}};},
  cancelSession:async()=>calls.push(['cancel']),exportPNG:async(_,file,check)=>{check();await file.write('VALID PNG');calls.push(['save',file.name]);saves++;if(token.after===saves)token.cancelled=true;},
  validateBatchOutput:async(file,size)=>{calls.push(['validate',file.name]);assert.ok(size.width>0);if(await file.read()!=='VALID PNG')throw Error('damaged PNG');}
 }};
}
test('A04 regression: failed CSV still returns PNG counts and writes JSON; journal is usable',async()=>{
 const root=folder('root',{write:name=>name==='reporte.csv'}),h=hostFixture();
 const r=await batch.runBatch({files:[{name:'a.png'}],folder:root,sizes:['S','XL','3XL'],options:{},host:h.host});assert.equal(r.done,3);assert.equal(r.warnings.length,1);assert.ok(r.folder.entries.has('ajustes-y-resultados.json'));
 const loaded=await batch.loadRun(r.folder);assert.equal(loaded.job.rows.filter(r=>r.status==='done').length,3);
});
test('stop, reload and resume validate completed PNGs and process only missing variants',async()=>{
 const token={after:1,cancelled:false},h=hostFixture(token),files=[{name:'a.png'},{name:'b.png'}],first=await batch.runBatch({files,folder:folder(),sizes:['S','XL','3XL'],options:{},host:h.host,token});
 assert.equal(first.done,1);assert.equal(first.cancelled,5);const loaded=await batch.loadRun(first.folder),next=hostFixture();
 const r=await batch.runBatch({files,resume:loaded,host:next.host});assert.equal(r.done,6);assert.equal(next.calls.filter(c=>c[0]==='save').length,5);assert.equal(next.calls.filter(c=>c[0]==='validate').length,1);
});
test('crash between PNG and final checkpoint recovers via pending plan; corrupt PNG gets a new filename',async()=>{
 const token={after:1,cancelled:false},files=[{name:'a.png'}],h=hostFixture(token),r=await batch.runBatch({files,folder:folder(),sizes:['M','L'],options:{},host:h.host,token});
 const state=r.folder.entries.get('avance');state.entries.delete('00000002.json');const run=await batch.loadRun(r.folder),next=hostFixture();const fixed=await batch.runBatch({files,resume:run,host:next.host});assert.equal(fixed.done,2);assert.equal(next.calls.filter(c=>c[0]==='save').length,1);
 const broken=(await r.folder.entries.get('M').getEntries())[0];await broken.write('damaged');const loaded=await batch.loadRun(r.folder),again=hostFixture();const result=await batch.runBatch({files,resume:loaded,host:again.host});assert.equal(result.done,2);assert.ok(result.rows[0].output.includes('_r2.png'));assert.equal(await broken.read(),'damaged');
});
test('resume rejects changed originals and malformed job paths without opening Photoshop',async()=>{
 const h=hostFixture(),r=await batch.runBatch({files:[{name:'a.png'}],folder:folder(),sizes:['M'],options:{},host:h.host}),next=hostFixture(),loaded=await batch.loadRun(r.folder);
 await assert.rejects(batch.runBatch({files:[{name:'changed.png'}],resume:loaded,host:next.host}),/original cambió/);assert.equal(next.calls.length,0);
 const file=r.folder.entries.get('trabajo.json'),job=JSON.parse(await file.read());job.rows[0].output='../escape.png';await file.write(JSON.stringify(job));await assert.rejects(batch.loadRun(r.folder),/Nombre de salida/);
});
test('per-image assignments support mixed sizes, positions, recipes and excluded images',async()=>{
 const h=hostFixture(),files=[{name:'a.png'},{name:'b.png'},{name:'skip.png'}],r=await batch.runBatch({files,folder:folder(),sizes:['M'],options:{key:'#000000'},assignments:[
  {sizes:['XS','L'],placements:['front','back'],overrides:{key:'#ffffff'}},{sizes:['3XL'],placements:['chest']},{sizes:[]}],host:h.host});
 assert.equal(r.done,5);assert.equal(h.calls.filter(c=>c[0]==='open').length,2);assert.equal(r.rows[0].recipe.key,'#ffffff');assert.ok(r.rows.some(row=>row.placement==='chest'));
});
test('preflight isolates errors before output folders exist and preserves per-image choices',async()=>{
 const h=hostFixture(),open=h.host.openBatchSource;h.host.openBatchSource=async(file,...args)=>{if(file.name==='bad.png')throw Error('CMYK');return open(file,...args);};
 const results=await batch.preflightBatch({files:[{name:'good.png'},{name:'bad.png'}],sizes:['S','XL'],placement:'front',options:{},host:h.host});assert.equal(results.filter(r=>r.status==='ready').length,2);assert.equal(results.filter(r=>r.status==='error').length,2);assert.equal(h.calls.filter(c=>c[0]==='close').length,1);
});
test('project round trip preserves pristine RGBA and selection; imported caches own separate copies',async()=>{
 const w=520,h=12,data=new Uint8Array(w*h*4);for(let i=0;i<data.length;i++)data[i]=i%256;
 const source=new MemoryStore(w,h,4,data),mask=new MemoryStore(w,h,1,new Uint8Array(w*h).fill(128)),session={size:sizing.plan(w,h,300),sourceStore:source,protectStore:mask};
 const saved=await project.save(folder(),session,{knockout:false,protection:'selection'},'binary'),stores=[];
 const loaded=await project.load(saved,'binary',()=>{},async(w,h,c=4)=>{const s=new MemoryStore(w,h,c);stores.push(s);return s;});
 assert.deepEqual(loaded.sourceStore.data,data);assert.deepEqual(loaded.protectStore.data,mask.data);assert.equal(loaded.options.protection,'selection');await loaded.sourceStore.dispose();assert.equal(saved.entries.get('origen').entries.size,2);
});
test('damaged project and path traversal are rejected; temporary loads are disposed',async()=>{
 const data=new Uint8Array(4*4*4).fill(255),session={size:sizing.plan(4,4,300),source:data},saved=await project.save(folder(),session,{knockout:false},'binary'),stores=[];
 const f=saved.entries.get('origen').entries.get('0-0.bin');f.data=new Uint8Array(64).buffer;
 await assert.rejects(project.load(saved,'binary',()=>{},async(w,h,c=4)=>{const s=new MemoryStore(w,h,c);stores.push(s);return s;}),/dañado/);assert.ok(stores.every(s=>s.data===null));
 const mf=saved.entries.get('proyecto.json'),m=JSON.parse(await mf.read());m.blocks[0].name='../escape';await mf.write(JSON.stringify(m));await assert.rejects(project.load(saved,'binary',()=>{},async(w,h,c=4)=>new MemoryStore(w,h,c)),/Coordenadas/);
});

test('failed project save deletes its own partial folder and keeps unrelated files',async()=>{
 const parent=folder('projects',{write:name=>name.endsWith('.bin')});await (await parent.createFile('keep.txt')).write('keep');
 const source=new MemoryStore(2,2,4,new Uint8Array(16));
 await assert.rejects(project.save(parent,{sourceStore:source,size:{width:2,height:2}},{},'binary'),/write failure/);
 assert.equal((await parent.getEntries()).filter(f=>f.isFolder).length,0);assert.equal(await (await parent.getEntry('keep.txt')).read(),'keep');
});
test('preflight cancellation is propagated even on the last variant',async()=>{
 const h=hostFixture();h.host.trimSourceBounds=async()=>{const e=Error('stopped');e.cancelled=true;throw e;};
 await assert.rejects(batch.preflightBatch({files:[{name:'a.png'}],sizes:['M'],placement:'front',options:{trimArt:true},host:h.host}),/stopped/);
});

test('resumed PNG validation cooperates with the stop token before opening another source',async()=>{
 const files=[{name:'a.png'}],h=hostFixture(),r=await batch.runBatch({files,folder:folder(),sizes:['M','L'],options:{},host:h.host});
 const token={cancelled:false},next=hostFixture();next.host.validateBatchOutput=async(file,size,check)=>{token.cancelled=true;check();};
 const result=await batch.runBatch({files,resume:await batch.loadRun(r.folder),host:next.host,token});assert.match(result.fatal,/detenido/);assert.equal(next.calls.filter(c=>c[0]==='open').length,0);
});
