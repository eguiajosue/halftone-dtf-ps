'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {folder}=require('./support/storage'),batch=require('../plugin/batch'),sizing=require('../plugin/sizing');
function hostFixture({failWhite=null,cancelWhite=null,token={}}={}){
 const calls=[];let id=1;
 return {calls,host:{
  openBatchSource:async()=>({documentID:id++,width:100,height:150,owned:true}),closeBatchSource:async()=>calls.push(['closeSource']),
  beginSession:async(_,o,progress)=>{progress('resize',0);calls.push(['begin',o]);return {documentID:id++,size:sizing.plan(100,150,300,o),stats:{inkPixels:10,coveragePercent:40}};},
  cancelSession:async()=>calls.push(['cancelSession']),
  exportPNG:async(_,file,check)=>{check();await file.write('VALID PNG');calls.push(['png',file.name]);},
  exportWhite:async(documentID,file,opts,check,progress,size)=>{
   check();calls.push(['white',file.name,opts,size.width]);await file.write('VALID WHITE');
   if(failWhite&&file.name.includes(failWhite))throw Error('sin memoria');
   if(cancelWhite&&file.name.includes(cancelWhite)){token.cancelled=true;check();}
   return {};
  },
  validateBatchOutput:async(file,size)=>{calls.push(['validate',file.name]);assert.ok(size.width>0);const text=await file.read();if(!text.startsWith('VALID'))throw Error('damaged');}
 }};
}
const files=[{name:'a.png'},{name:'b.png'}];
const names=async(root,size)=>(await root.entries.get(size).getEntries()).map(f=>f.name).sort();

test('batch writes a white channel next to every PNG, with the chosen choke and format',async()=>{
 const h=hostFixture(),r=await batch.runBatch({files,folder:folder(),sizes:['M','L'],options:{batchWhite:true,whiteChokeMM:.3,whiteFormat:'alpha'},host:h.host});
 assert.equal(r.done,4);assert.equal(r.errors,0);
 const png=h.calls.filter(c=>c[0]==='png'),white=h.calls.filter(c=>c[0]==='white');assert.equal(png.length,4);assert.equal(white.length,4);
 for(const [name,opts,width] of white.map(c=>[c[1],c[2],c[3]])){assert.match(name,/_blanco\.png$/);assert.deepEqual(opts,{chokeMM:.3,format:'alpha'});assert.ok(width>0);}
 // each white follows its PNG and both are written before the temporary document closes
 const order=h.calls.map(c=>c[0]);assert.deepEqual(order.filter(n=>['png','white','cancelSession'].includes(n)).slice(0,3),['png','white','cancelSession']);
 for(const size of ['M','L']){const list=await names(r.folder,size);assert.equal(list.length,4);assert.equal(list.filter(n=>n.endsWith('_blanco.png')).length,2);}
 for(const row of r.rows){assert.equal(row.whiteOutput,row.output.replace(/\.png$/,'_blanco.png'));}
 assert.ok(r.folder.entries.get('reporte.csv').data.includes('_blanco.png'));
 for(const c of h.calls.filter(c=>c[0]==='begin'))assert.equal(c[1].nativeMask,false,'batch exports a flat layer, never the live mask structure');
});
test('without the option no white file is written and the report has an empty white column',async()=>{
 const h=hostFixture(),r=await batch.runBatch({files:[files[0]],folder:folder(),sizes:['M'],options:{},host:h.host});
 assert.equal(h.calls.filter(c=>c[0]==='white').length,0);assert.equal(r.rows[0].whiteOutput,undefined);assert.equal((await names(r.folder,'M')).length,1);
});
test('a failed white channel marks only that variant as an error and removes its PNG too',async()=>{
 const h=hostFixture({failWhite:'_L_'}),r=await batch.runBatch({files:[files[0]],folder:folder(),sizes:['M','L'],options:{batchWhite:true},host:h.host});
 assert.equal(r.done,1);assert.equal(r.errors,1);const bad=r.rows.find(row=>row.status==='error');assert.match(bad.error,/^Canal blanco: sin memoria/);assert.equal(bad.whiteOutput,undefined);
 assert.equal((await names(r.folder,'L')).length,0,'neither the PNG nor the white file stay behind');assert.equal((await names(r.folder,'M')).length,2);
 assert.equal(h.calls.filter(c=>c[0]==='cancelSession').length,2,'temporary documents closed');
});
test('cancelling during a white export stops the queue and leaves no half-written pair',async()=>{
 const token={cancelled:false},h=hostFixture({cancelWhite:'_M_',token}),r=await batch.runBatch({files,folder:folder(),sizes:['M','L'],options:{batchWhite:true},host:h.host,token});
 assert.equal(r.done,0);assert.equal(r.errors,0);assert.ok(r.cancelled>=1);
 assert.equal((await names(r.folder,'M')).filter(n=>/_M_/.test(n)).length,0);
});
test('resume re-validates the white file and regenerates a variant whose white channel is missing or damaged',async()=>{
 const files1=[{name:'a.png'}],h=hostFixture(),r=await batch.runBatch({files:files1,folder:folder(),sizes:['M','L'],options:{batchWhite:true},host:h.host});assert.equal(r.done,2);
 const m=r.folder.entries.get('M'),white=Array.from(m.entries.values()).find(f=>f.name.endsWith('_blanco.png'));
 const loaded=await batch.loadRun(r.folder);assert.equal(loaded.job.rows.filter(row=>row.whiteOutput).length,2);
 white.delete();   // user lost the white file of size M
 const next=hostFixture(),again=await batch.runBatch({files:files1,resume:loaded,host:next.host});
 assert.equal(again.done,2);assert.equal(next.calls.filter(c=>c[0]==='white').length,1,'only the damaged variant is redone');
 assert.equal(next.calls.filter(c=>c[0]==='png').length,1);assert.equal(next.calls.filter(c=>c[0]==='validate').length,3);
 const list=(await m.getEntries()).map(f=>f.name);assert.ok(list.some(n=>/_r2_blanco\.png$/.test(n)),'new pair has a new name: '+list.join());
});
test('a tampered white path in the progress log is rejected',async()=>{
 const h=hostFixture(),r=await batch.runBatch({files:[files[0]],folder:folder(),sizes:['M'],options:{batchWhite:true},host:h.host});
 const log=Array.from(r.folder.entries.get('avance').entries.values()).pop(),data=JSON.parse(log.data);data.whiteOutput='M/otro.png';log.data=JSON.stringify(data);
 const loaded=await batch.loadRun(r.folder);assert.match(loaded.warning,/registro incompleto/);
});
