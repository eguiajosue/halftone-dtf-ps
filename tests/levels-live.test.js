'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate,adjustLevels,processRGBA}=require('../plugin/engine');
const {LiveController}=require('../plugin/live');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
test('Levels normalize input endpoints, gamma and output range in Photoshop order',()=>{
  const n=validate({inputBlack:20,inputMidtone:2,inputWhite:220,outputBlack:30,outputWhite:230});
  assert.equal(adjustLevels(0,n),0);
  assert.equal(adjustLevels(10/255,n),30/255);
  assert.equal(adjustLevels(20/255,n),30/255);
  assert.ok(Math.abs(adjustLevels(120/255,n)-(30+Math.sqrt(.5)*200)/255)<1e-12);
  assert.equal(adjustLevels(240/255,n),230/255);
  const identity=validate({});for(const x of [.1,.4,.75,1])assert.ok(Math.abs(adjustLevels(x,identity)-x)<1e-12);
});
test('output levels force dots in opaque areas without filling transparent or knockout holes',async()=>{
  const w=300,h=300,input=new Uint8Array(w*h*4);
  for(let p=0;p<w*h;p++)input.set(p%3===0?[220,20,50,255]:p%3===1?[0,0,0,255]:[220,20,50,0],p*4);
  const original=input.slice();
  const result=await processRGBA(input,w,h,{outputBlack:100,outputWhite:150,tolerance:0,softness:1,minDiameterMM:0,cleanup:'low'});
  let solid=0,holes=0;
  for(let p=0;p<w*h;p++){
    if(p%3!==0)assert.equal(result.data[p*4+3],0);
    else if(result.data[p*4+3]){solid++;assert.deepEqual(Array.from(result.data.subarray(p*4,p*4+4)),[220,20,50,255]);}else holes++;
  }
  assert.ok(solid>10000&&holes>7000);assert.deepEqual(input,original);
});
test('midtone and input levels change coverage; default levels preserve old output',async()=>{
  const w=150,h=150,input=new Uint8Array(w*h*4);for(let i=0;i<input.length;i+=4)input.set([250,80,20,90],i);
  const base={knockout:false,minDiameterMM:0,cleanup:'low'};
  const a=await processRGBA(input,w,h,base),b=await processRGBA(input,w,h,{...base,inputMidtone:2}),c=await processRGBA(input,w,h,{...base,inputBlack:100});
  assert.ok(b.stats.inkPixels>a.stats.inkPixels*1.5);assert.equal(c.stats.inkPixels,0);
  await assert.rejects(processRGBA(input,w,h,{...base,inputBlack:200,inputWhite:100}),/negro de entrada/);
  await assert.rejects(processRGBA(input,w,h,{...base,outputBlack:200,outputWhite:100}),/negro de salida/);
  await assert.rejects(processRGBA(input,w,h,{...base,inputMidtone:NaN}),/inputMidtone/);
});
test('rapid requests coalesce and flush applies only the latest options',async()=>{
  const writes=[];const ctrl=new LiveController(async(o,ctx)=>{ctx.check();writes.push(o.value);},{delay:10000});
  ctrl.request({value:1});ctrl.request({value:2});ctrl.request({value:3});await ctrl.flush();
  assert.deepEqual(writes,[3]);assert.equal(ctrl.applied,3);await ctrl.dispose();
});
test('in-flight work is superseded, writes serialize and flush waits for latest write',async()=>{
  const first=deferred(),last=deferred(),entered=deferred(),writes=[];let active=0,maxActive=0;
  const ctrl=new LiveController(async(o,ctx)=>{
    active++;maxActive=Math.max(maxActive,active);
    try{if(o===1){entered.resolve();await first.promise;}else await last.promise;ctx.check();writes.push(o);}finally{active--;}
  },{delay:10000});
  ctrl.request(1);ctrl.kick();await entered.promise;ctrl.request(2);
  let finished=false;const flushed=ctrl.flush().then(()=>{finished=true;});first.resolve();await tick();
  assert.equal(finished,false);assert.deepEqual(writes,[]);last.resolve();await flushed;
  assert.deepEqual(writes,[2]);assert.equal(maxActive,1);await ctrl.dispose();
});
test('new input interrupts idle wait; dispose drains and prevents late commits',async()=>{
  const entered=deferred(),writes=[];const ctrl=new LiveController(async(o,ctx)=>{
    entered.resolve();await ctx.pause(10000);ctx.check();writes.push(o);
  },{delay:10000});
  ctrl.request(1);ctrl.kick();await entered.promise;await ctrl.dispose();
  assert.deepEqual(writes,[]);assert.throws(()=>ctrl.request(2),/cerrada/);
});
test('latest processing errors block Apply; a corrected request recovers',async()=>{
  const errors=[],writes=[];const ctrl=new LiveController(async(o,ctx)=>{ctx.check();if(o==='invalid')throw Error('invalid levels');writes.push(o);},{delay:10000,onError:e=>errors.push(e.message)});
  ctrl.request('valid');await ctrl.flush();ctrl.request('invalid');await assert.rejects(ctrl.flush(),/invalid levels/);
  assert.deepEqual(writes,['valid']);assert.deepEqual(errors,['invalid levels']);
  ctrl.request('corrected');await ctrl.flush();assert.deepEqual(writes,['valid','corrected']);await ctrl.dispose();
});
