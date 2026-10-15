'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const engine=require('../plugin/engine'),{LiveRenderer,compose,colorKey}=require('../plugin/live-render');
function source(w,h){const data=new Uint8Array(w*h*4);for(let p=0;p<w*h;p++){const x=p%w,y=Math.floor(p/w);data.set([(x*17+y*3)%256,(x*5+y*11)%256,(x*7+y*19)%256,p%7===0?0:p%5===0?255:(x*13+y*23)%256],p*4);}return data;}
const cases=[{},{knockout:false},{inputBlack:7,inputMidtone:2,inputWhite:100},{outputBlack:40,outputWhite:200},{recover:true,key:'#202020'},
 {defringe:true},{shadowBoost:30,colorBoost:20},{halftone:false},{cleanup:'high',lpi:20},{cleanup:'none',gamma:1.6,strength:80},
 {recover:true,key:'#202020',shadowBoost:25,colorBoost:15},{recover:true,key:'#303030',defringe:true}];
test('cached live renderer matches processRGBA except for rare 16-bit edge rounding',async()=>{
 const w=160,h=120,data=source(w,h),renderer=new LiveRenderer(data,w,h);
 for(const shape of engine.SHAPES)for(const c of cases){
  const o={dpi:300,lpi:30,angle:33,shape,...c},n=engine.validate(o),reference=await engine.processRGBA(data,w,h,o);
  const {mask,stats}=await renderer.mask(n),out=compose(await renderer.color(n),mask,w);let different=0;
  for(let p=0;p<w*h;p++)for(let k=0;k<4;k++)if(out[p*4+k]!==reference.data[p*4+k]){different++;break;}
  assert.ok(different<=3,`${shape} ${JSON.stringify(c)}: ${different} px`);
  assert.ok(Math.abs(stats.inkPixels-reference.stats.inkPixels)<=3);
  for(const v of mask)assert.ok(v===0||v===255);
 }
 assert.deepEqual(data,source(w,h),'source is never modified');
});
test('bounded particle cleanup removes exactly the same islands as the full engine',async()=>{
 const w=90,h=60,data=new Uint8Array(w*h*4);
 const dot=(x,y)=>data.set([90,120,160,255],(y*w+x)*4);
 for(let y=5;y<40;y++)for(let x=5;x<40;x++)dot(x,y);              // large block
 dot(50,10);dot(51,11);dot(60,20);dot(61,20);dot(60,21);            // 2- and 3-pixel islands
 for(let i=0;i<30;i++)dot(45+i,50+(i%2));                          // thin diagonal line, 8-connected
 for(const cleanup of ['low','standard','high']){
  const o={dpi:300,knockout:false,cleanup,halftone:false},n=engine.validate(o),reference=await engine.processRGBA(data,w,h,o);
  const r=await new LiveRenderer(data,w,h).mask(n);
  for(let p=0;p<w*h;p++)assert.equal(r.mask[p],reference.data[p*4+3],cleanup+' '+p);
  assert.equal(r.stats.removedComponents,reference.stats.removedComponents);
 }
});
test('only color options invalidate the art layer RGB',()=>{
 const n=o=>engine.validate({dpi:300,...o});
 assert.equal(colorKey(n({inputBlack:20})),'plain');assert.equal(colorKey(n({lpi:50,cleanup:'high'})),'plain');
 assert.notEqual(colorKey(n({shadowBoost:10})),'plain');
 assert.equal(colorKey(n({shadowBoost:10,inputBlack:20})),colorKey(n({shadowBoost:10,inputBlack:40})));
 assert.notEqual(colorKey(n({defringe:true,inputBlack:20})),colorKey(n({defringe:true,inputBlack:40})));
});
