'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {runBatch,variantPlan,outputName}=require('../plugin/batch');
function folder(name='output'){
 const entries=new Map();return {name,entries,nativePath:'/fake/'+name,
  getEntries:async()=>Array.from(entries.values()),
  createFolder:async n=>{if(entries.has(n))throw Error('exists');const child=folder(n);entries.set(n,child);return child;},
  createFile:async(n,{overwrite}={})=>{if(entries.has(n)&&!overwrite)throw Error('exists');const file={name:n,data:null,write:async v=>{file.data=v;},delete:async()=>entries.delete(n)};entries.set(n,file);return file;}
 };
}
function hostFixture({token,failOpen,failSave,cancelAfter}={}){
 let id=1,activeSources=0,activeSessions=0,maxSources=0,maxSessions=0;const calls=[];
 const host={
  openBatchSource:async file=>{calls.push(['open',file.name]);if(file.name===failOpen)throw Error('CMYK');activeSources++;maxSources=Math.max(maxSources,activeSources);return {documentID:id++,width:1000,height:1500,owned:true};},
  closeBatchSource:async()=>{activeSources--;calls.push(['closeSource']);},
  beginSession:async(source,o,progress)=>{progress('resize',.5);activeSessions++;maxSessions=Math.max(maxSessions,activeSessions);calls.push(['begin',source,o]);return {documentID:id++,stats:{inkPixels:10}};},
  cancelSession:async()=>{activeSessions--;calls.push(['closeResult']);},
  exportPNG:async(id,file,check)=>{check();if(file.name.includes(failSave||'impossible-string'))throw Error('save failed');await file.write('PNG');calls.push(['saved',file.name]);if(cancelAfter&&calls.filter(c=>c[0]==='saved').length===cancelAfter)token.cancelled=true;}
 };
 return {host,calls,counts:()=>({activeSources,activeSessions,maxSources,maxSessions})};
}
test('50 images × M/L produce 100 distinct exports; each size is resampled BEFORE its own screen',async()=>{
 const files=Array.from({length:50},(_,i)=>({name:'image-'+i+'.png'})),f=hostFixture(),parent=folder();
 const r=await runBatch({files,folder:parent,options:{key:'#000000'},host:f.host});
 assert.equal(r.done,100);assert.equal(r.errors,0);assert.equal(new Set(r.rows.map(row=>row.output)).size,100);
 const jobs=f.calls.filter(c=>c[0]==='begin');assert.equal(jobs.length,100);
 assert.ok(jobs[0][2].widthCM<jobs[1][2].widthCM);assert.equal(jobs[0][2].documentID,jobs[1][2].documentID);
 assert.equal(jobs[0][1],'composite');assert.equal(jobs[0][2].lpi,undefined);assert.equal(r.rows[0].dpi,300);
 assert.equal(r.rows[0].widthPX,2598);assert.equal(r.rows[0].heightPX,3897);assert.equal(r.rows[1].heightPX,4134);
 assert.deepEqual(f.counts(),{activeSources:0,activeSessions:0,maxSources:1,maxSessions:1});
 assert.ok(r.folder.entries.get('reporte.csv').data.includes('"image-49.png"'));assert.equal(JSON.parse(r.folder.entries.get('ajustes-y-resultados.json').data).rows.length,100);
});
test('cancel retains completed PNGs, closes temporary documents and reports all remaining variants',async()=>{
 const token={cancelled:false},f=hostFixture({token,cancelAfter:1});
 const r=await runBatch({files:[{name:'a.png'},{name:'b.png'}],folder:folder(),options:{},token,host:f.host});
 assert.equal(r.done,1);assert.equal(r.cancelled,3);assert.equal(r.errors,0);assert.equal(f.calls.filter(c=>c[0]==='closeResult').length,1);assert.equal(f.calls.filter(c=>c[0]==='closeSource').length,1);
 assert.equal(f.counts().activeSessions,0);assert.ok(r.folder.entries.get('M').entries.values().next().value.data==='PNG');
});
test('bad source and export errors are isolated; other images/variants complete without overwriting',async()=>{
 const f=hostFixture({failOpen:'bad.psd',failSave:'_L_'}),parent=folder();
 const r=await runBatch({files:[{name:'bad.psd'},{name:'a.png'},{name:'a.jpg'}],folder:parent,options:{},host:f.host});
 assert.equal(r.done,2);assert.equal(r.errors,4);assert.equal(r.folder.entries.get('L').entries.size,0);
 assert.equal(f.counts().activeSources,0);assert.equal(f.counts().activeSessions,0);
 assert.notEqual(outputName({name:'a.png'},1,'M','front'),outputName({name:'a.jpg'},2,'M','front'));
});
test('custom print boxes preserve aspect; invalid size/area and manual selection are rejected before output creation',async()=>{
 const p=variantPlan(100,200,'back','M',{M:[20,30]});assert.ok(Math.abs(p.widthCM-15)<.01&&Math.abs(p.heightCM-30)<.01);
 const parent=folder(),f=hostFixture();
 for(const cfg of [{sizes:[]},{sizes:['bad']},{areas:{M:[0,30]}},{options:{protection:'selection'}}])await assert.rejects(runBatch({files:[{name:'a.png'}],folder:parent,options:{},host:f.host,...cfg}));
 assert.equal(parent.entries.size,0);
});
test('native Photoshop cancellation stops the whole queue and cache-cleanup failures stop accumulating files',async()=>{
 const f=hostFixture(),token={cancelled:false};f.host.openBatchSource=async()=>{const e=Error('cancelled in Photoshop');e.cancelled=true;throw e;};
 const r=await runBatch({files:[{name:'a.png'}],folder:folder(),options:{},host:f.host,token});assert.equal(r.cancelled,2);assert.equal(r.errors,0);assert.equal(token.cancelled,true);
 const g=hostFixture();const begin=g.host.beginSession;g.host.beginSession=async(...a)=>({...await begin(...a),cacheWarning:'cache cleanup failed'});
 const result=await runBatch({files:[{name:'a.png'},{name:'b.png'}],folder:folder(),options:{},host:g.host});assert.equal(result.done,1);assert.equal(result.errors,3);assert.match(result.fatal,/cache cleanup failed/);
});
