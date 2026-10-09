'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('Photoshop self-test reads composite without an undefined native layerID',async()=>{
 const calls=[],module={exports:{}};
 const imaging={getPixels:async o=>{if('layerID'in o&&!Number.isSafeInteger(o.layerID))throw Error('Incorrect type for key: layerID. Expected: number');calls.push(o);return {level:0,sourceBounds:{left:0,top:0},imageData:{width:1,height:1,components:4,getData:async()=>new Uint8Array([200,70,30,255]),dispose(){}}};}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../plugin/native-validation'),'utf8')+'\nmodule.exports.read=read;',{module,Uint8Array,require:n=>n==='photoshop'?{imaging}:n==='./host'?{}:require('../plugin/'+n.slice(2))});
 assert.deepEqual(await module.exports.read(7,undefined,1,1),new Uint8Array([200,70,30,255]));assert.equal('layerID'in calls[0],false);
 await module.exports.read(7,11,1,1);assert.equal(calls[1].layerID,11);
 await assert.rejects(module.exports.read(7,'11',1,1),/inválido/);assert.equal(calls.length,2);
});
