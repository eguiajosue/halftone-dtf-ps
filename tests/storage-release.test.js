'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),cp=require('node:child_process');
const {folder}=require('./support/storage');
test('cache recovery deletes only marked inactive plugin folders, preserving active and unrelated data',async()=>{
 const parent=folder('temp');
 for(const [name,marker]of [['halftone-1-1',{owner:'com.josueeguia.halftonedtf',schema:1}],['halftone-2-1',{owner:'other',schema:1}],['unrelated',{owner:'com.josueeguia.halftonedtf',schema:1}]]){const f=await parent.createFolder(name);await (await f.createFile('cache.json')).write(JSON.stringify(marker));}
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../plugin/tiles'),'utf8'),{module,require:name=>name==='uxp'?{storage:{localFileSystem:{getTemporaryFolder:async()=>parent},formats:{binary:'binary'}}}:require('../plugin/'+name.slice(2)),Uint8Array,Date});
 const active=await module.exports.createDiskStore(2,2);const result=await module.exports.cleanupAbandonedCaches();assert.equal(result.deleted,1);assert.deepEqual((await parent.getEntries()).map(f=>f.name).sort(),['halftone-2-1','unrelated',active.folder.name].sort());await active.dispose();assert.equal((await parent.getEntries()).length,2);
});
test('release evidence gate rejects missing evidence and accepts a fully documented fixture',()=>{
 const root=path.dirname(require.resolve('../package.json')),temp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'halftone-gate-'));
 try{
  fs.mkdirSync(path.join(temp,'scripts'));fs.mkdirSync(path.join(temp,'plugin'));
  fs.copyFileSync(path.join(root,'scripts/check-release.js'),path.join(temp,'scripts/check-release.js'));fs.copyFileSync(path.join(root,'plugin/manifest.json'),path.join(temp,'plugin/manifest.json'));
  const gate=JSON.parse(fs.readFileSync(path.join(root,'release-validation.json')));for(const check of Object.values(gate.required)){check.passed=false;check.evidence='';}
  const run=()=>cp.spawnSync(process.execPath,['scripts/check-release.js'],{cwd:temp,encoding:'utf8'});const file=path.join(temp,'release-validation.json');fs.writeFileSync(file,JSON.stringify(gate));let result=run();assert.equal(result.status,1);assert.match(result.stderr,/native_photoshop_validation/);
  for(const check of Object.values(gate.required)){check.passed=true;check.evidence='TEST FIXTURE ONLY';}fs.writeFileSync(file,JSON.stringify(gate));assert.equal(run().status,0);
  gate.required.native_photoshop_validation.evidence='  ';fs.writeFileSync(file,JSON.stringify(gate));assert.equal(run().status,1);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});

test('cache marker write failure removes the newly created incomplete cache',async()=>{
 const parent=folder('temp',{write:name=>name==='cache.json'}),module={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../plugin/tiles'),'utf8'),{module,require:name=>name==='uxp'?{storage:{localFileSystem:{getTemporaryFolder:async()=>parent},formats:{binary:'binary'}}}:require('../plugin/'+name.slice(2)),Uint8Array,Date});
 await assert.rejects(module.exports.createDiskStore(2,2),/write failure/);assert.equal((await parent.getEntries()).length,0);
});
