'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const engine=require('../plugin/engine'),reference=require('./fixtures/engine-062.json');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function source(){const data=new Uint8Array(64*48*4);for(let p=0;p<64*48;p++){const x=p%64,y=Math.floor(p/64);data.set([(x*17+y*3)%256,(x*5+y*11)%256,(x*7+y*19)%256,p%7===0?0:p%5===0?255:(x*13+y*23)%256],p*4);}return data;}
test('optimized renderer is byte-identical to 0.6.2 across shapes, levels, recovery, cleanup and protection',async()=>{
 const data=source();for(const c of reference.cases){
  const o={...c.options};if(c.feature==='selection')o.protectMask=Uint8Array.from({length:64*48},(_,p)=>p%9===0?255:0);
  const r=await engine.processRGBA(data,64,48,o),label=c.options.shape+'/'+c.feature;
  assert.equal(hash(r.data),c.rgba,label);assert.equal(hash(r.removedMask),c.removed,label);assert.equal(r.protectedMask?hash(r.protectedMask):null,c.protected,label);assert.deepEqual(r.stats,c.stats,label);
 }
});
test('optimized composites preserve exact checkerboard and garment blending for partial alpha',()=>{
 const data=source();assert.equal(hash(engine.composite(data,64,48,null)),reference.checker);assert.equal(hash(engine.composite(data,64,48,[18,52,86])),reference.garment);
});
