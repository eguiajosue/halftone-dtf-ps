'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const engine=require('../plugin/engine'),presets=require('../plugin/presets'),ink=require('../plugin/ink');
const {LiveRenderer}=require('../plugin/live-render'),{MemoryStore,processTiles}=require('../plugin/tiles'),batch=require('../plugin/batch');
function art(w,h){const a=new Uint8Array(w*h*4);for(let p=0;p<w*h;p++){const x=p%w,y=(p-x)/w;a.set([210,70,120,x<w/2?255:40],p*4);}return a;}

test('every factory preset is complete, valid, unique and leaves size, calibration and costs alone',async()=>{
 assert.ok(presets.PRESETS.length>=5);assert.equal(new Set(presets.PRESETS.map(p=>p.id)).size,presets.PRESETS.length);
 const image=art(120,90);
 for(const p of presets.PRESETS){
  assert.ok(p.name&&p.note,p.id);const o=presets.optionsFor(p.id);
  for(const k of Object.keys(presets.BASE))assert.notEqual(o[k],undefined,p.id+' '+k);
  for(const k of ['widthCM','heightCM','gainPoints','previewColor','inkColorMLm2','filmPriceM2','units'])assert.equal(k in o,false,p.id+' must not set '+k);
  const r=await engine.processRGBA(image,120,90,{...o,dpi:300,knockout:false});assert.ok(r.stats.inkPixels>0,p.id);
 }
 assert.equal(presets.optionsFor('light-logo').key,'#ffffff');assert.equal(presets.optionsFor('knockout-only').halftone,false);
 assert.equal(presets.optionsFor('dark-fine').lpi,40);assert.throws(()=>presets.optionsFor('nope'),/desconocido/);
});
test('ink estimate: area, ml, savings versus no screen, cost and defaults',()=>{
 const size={width:3000,height:3000,widthCM:25.4,heightCM:25.4},area=25.4*25.4;
 const e=ink.estimate({coveragePercent:50,solidPixels:.8*9e6},size,{});
 assert.ok(Math.abs(e.areaCM2-area)<1e-9);assert.ok(Math.abs(e.colorML-area*.5/1e4*8)<1e-9);assert.ok(Math.abs(e.whiteML-area*.5/1e4*12)<1e-9);
 assert.ok(Math.abs(e.savingsPercent-37.5)<1e-9);assert.equal(e.priced,false);assert.equal(e.totalCost,0);
 const p=ink.estimate({coveragePercent:50,solidPixels:.8*9e6},size,{inkColorPriceL:100,inkWhitePriceL:120,filmPriceM2:10});
 const m2=area*.5/1e4,expectedInk=m2*8*100/1000+m2*12*120/1000,film=area/1e4*10;
 assert.ok(Math.abs(p.inkCost-expectedInk)<1e-9);assert.ok(Math.abs(p.totalCost-(expectedInk+film))<1e-9);assert.ok(p.savedInkCost>0);assert.equal(p.priced,true);
 assert.equal(ink.estimate({coveragePercent:30},size,{}).savingsPercent,null);
 assert.equal(ink.estimate({coveragePercent:60,solidPixels:.2*9e6},size,{}).savingsPercent,0,'solid reference never below the printed art');
 assert.deepEqual(ink.normalize({inkColorMLm2:-3,inkWhiteMLm2:NaN,filmPriceM2:'x'}),ink.DEFAULTS);
 assert.match(ink.describe(e),/color 0\.26 ml · blanca 0\.39 ml · cubre 50 % del área · 38 % menos tinta que sin trama\.$/);
 assert.match(ink.describe(p),/costo 0\.72 \(incluye film y polvo\)\.$/);
});
test('solid-equivalent art is measured identically by the engine, the live renderer and tiles',async()=>{
 const w=1100,h=600,a=art(w,h),o={dpi:300,lpi:35,knockout:false,cleanup:'none',minDiameterMM:0};
 const off=await engine.processRGBA(a,w,h,o);assert.equal('solidPixels' in off.stats,false,'opt-in only');
 const full=await engine.processRGBA(a,w,h,{...o,measureSolid:true});assert.equal(full.stats.solidPixels,w/2*h);
 const live=await new LiveRenderer(a,w,h).mask(engine.validate(o));assert.equal(live.stats.solidPixels,w/2*h);
 const tiled=await processTiles(new MemoryStore(w,h,4,a),new MemoryStore(w,h,4),{...o,measureSolid:true});assert.equal(tiled.solidPixels,w/2*h);
});
test('batch report carries coverage, ink and cost columns',()=>{
 const text=batch.csv([{image:'a.png',size:'M',coveragePercent:41.5,colorML:.25,whiteML:.4,cost:''}]);
 assert.match(text,/dpi,coveragePercent,colorML,whiteML,cost,error\r\n/);assert.match(text,/"41.5","0.25","0.4","",/);
});
