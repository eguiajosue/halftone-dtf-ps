'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const sizing=require('../plugin/sizing');
const {processRGBA}=require('../plugin/engine');
const views=require('../plugin/views');
test('10 × 10 cm source becomes 20 × 20 cm at 300 ppi with proportional rounding',()=>{
  const p=sizing.plan(1181,1181,300,{widthCM:20,sizeAxis:'width'});
  assert.equal(p.width,2362);assert.equal(p.height,2362);assert.equal(p.dpi,300);
  assert.ok(Math.abs(p.widthCM-20)<.01);
});
test('editing either dimension keeps exact source aspect; square cannot become 20 × 30',()=>{
  assert.deepEqual(sizing.proportional(100,100,'width',20),{widthCM:20,heightCM:20});
  assert.deepEqual(sizing.proportional(100,150,'width',20),{widthCM:20,heightCM:30});
  assert.deepEqual(sizing.proportional(100,150,'height',30),{widthCM:20,heightCM:30});
  const p=sizing.plan(100,150,72,{widthCM:20,heightCM:99,sizeAxis:'width'});
  assert.equal(p.width,2362);assert.equal(p.height,3543);
  const q=sizing.plan(100,150,72,{widthCM:99,heightCM:30,sizeAxis:'height'});
  assert.equal(q.width,2362);assert.equal(q.height,3543);
});
test('all 14 presets fit portrait, landscape and square artwork without distortion',()=>{
  for(const place of Object.keys(sizing.PRESETS)) for(const size of sizing.SIZES) for(const [w,h] of [[100,100],[100,200],[200,100]]) {
    const p=sizing.fitPreset(w,h,place,size);
    assert.ok(p.widthCM<=p.maxWidthCM+1e-9&&p.heightCM<=p.maxHeightCM+1e-9);
    assert.ok(Math.abs(p.widthCM/p.heightCM-w/h)<1e-9);
    assert.doesNotThrow(()=>sizing.plan(w,h,300,{widthCM:p.widthCM}));
  }
});
test('resampling premultiplied alpha avoids contaminated transparent fringe',async()=>{
  const src={data:new Uint8Array([255,0,0,255,0,0,255,0]),width:2,height:1,bounds:{left:0,top:0}};
  const r=await sizing.resampleCrop(src,2,1,4,1,{left:0,top:0,width:4,height:1});
  for(let i=0;i<r.data.length;i+=4) if(r.data[i+3]) assert.deepEqual(Array.from(r.data.slice(i,i+3)),[255,0,0]);
  assert.ok(r.data[7]>0 && r.data[7]<255);
});
test('a trimmed layer stays aligned inside a resized full canvas',async()=>{
  const src={data:new Uint8Array([255,0,0,255,255,0,0,255,255,0,0,255,255,0,0,255]),width:2,height:2,bounds:{left:2,top:3}};
  const r=await sizing.resampleCrop(src,8,8,16,16,{left:0,top:0,width:16,height:16});
  assert.equal(r.data[(7*16+5)*4+3],255);
  assert.equal(r.data[(2*16+2)*4+3],0);
});
test('resampling strips and final preview crop agree with whole image',async()=>{
  const src={data:new Uint8Array(11*13*4),width:11,height:13,bounds:{left:0,top:0}};
  for(let p=0;p<11*13;p++) src.data.set([p%256,100,240,p%7===0?0:150],p*4);
  const full=await sizing.resampleCrop(src,11,13,32,38,{left:0,top:0,width:32,height:38});
  const crop=await sizing.resampleCrop(src,11,13,32,38,{left:9,top:12,width:12,height:15});
  for(let y=0;y<15;y++) for(let x=0;x<12;x++) {
    const a=(y*12+x)*4,b=((y+12)*32+x+9)*4;
    assert.deepEqual(crop.data.slice(a,a+4),full.data.slice(b,b+4));
  }
});
test('halftoning AFTER resizing removes all interpolation semitransparency',async()=>{
  const src={data:new Uint8Array([20,180,90,255,20,180,90,0]),width:2,height:1,bounds:{left:0,top:0}};
  const resized=await sizing.resampleCrop(src,2,1,100,50,{left:0,top:0,width:100,height:50});
  assert.ok(Array.from(resized.data).some((v,i)=>i%4===3&&v>0&&v<255));
  const result=await processRGBA(resized.data,100,50,{dpi:300,knockout:false,minDiameterMM:0});
  for(let i=3;i<result.data.length;i+=4) assert.ok(result.data[i]===0||result.data[i]===255);
});
test('view modes are independent of output; background defaults to removed color',()=>{
  const original=new Uint8Array([80,90,100,128,20,30,40,255]);
  const result=new Uint8Array([80,90,100,255,0,0,0,0]),copy=result.slice();
  const opts={key:'#112233',linkBackground:true,previewColor:'#ffffff'};
  assert.deepEqual(views.viewRGB('garment',original,result,2,1,opts),new Uint8Array([80,90,100,17,34,51]));
  assert.deepEqual(views.viewRGB('mask',original,result,2,1,opts),new Uint8Array([255,255,255,0,0,0]));
  assert.deepEqual(views.viewRGB('garment',original,result,2,1,{...opts,linkBackground:false}),new Uint8Array([80,90,100,255,255,255]));
  assert.notDeepEqual(views.viewRGB('original',original,result,2,1,opts),views.viewRGB('transparent',original,result,2,1,opts));
  assert.deepEqual(result,copy);
});
test('invalid dimensions, presets and excessive output are rejected',()=>{
  for(const cm of [0,-1,NaN,101]) assert.throws(()=>sizing.proportional(100,100,'width',cm));
  assert.throws(()=>sizing.fitPreset(100,100,'front','XXS'));
  assert.throws(()=>sizing.plan(100,100,300,{widthCM:100}),/128 megap/);
});
