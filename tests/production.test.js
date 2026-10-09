'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const engine=require('../plugin/engine'),sizing=require('../plugin/sizing'),diagnostics=require('../plugin/diagnostics'),recipes=require('../plugin/recipes');
const {MemoryStore,processTiles}=require('../plugin/tiles'),{thumbnail}=require('../plugin/overview'),{mockupRGB}=require('../plugin/views');
function solid(w,h,rgb=[255,255,255],a=255){const data=new Uint8Array(w*h*4);for(let i=0;i<data.length;i+=4)data.set([...rgb,a],i);return data;}
test('audit A01: area reduction conserves fine stripes and alpha over non-aligned crops',async()=>{
 const data=solid(256,4);for(let y=0;y<4;y++)for(let x=0;x<256;x++){const c=x%4===0?255:0;data.set([c,c,c,255],(y*256+x)*4);}
 const source={data,width:256,height:4,bounds:{left:0,top:0}},r=await sizing.resampleCrop(source,256,4,64,1,{left:0,top:0,width:64,height:1});
 assert.ok(Array.from({length:64},(_,p)=>r.data[p*4]).every(v=>v===64));
 const mixed=solid(6,3,[255,0,0],128),src={data:mixed,width:6,height:3,bounds:{left:0,top:0}};
 const all=await sizing.resampleCrop(src,6,3,4,2,{left:0,top:0,width:4,height:2}),crop=await sizing.resampleCrop(src,6,3,4,2,{left:2,top:0,width:2,height:2});
 for(let y=0;y<2;y++)assert.deepEqual(crop.data.subarray(y*8,y*8+8),all.data.subarray(y*16+8,y*16+16));assert.equal(all.data[3],128);
});
test('independent halftone switch and None preserve binary endpoints with a configurable threshold',async()=>{
 const data=solid(3,1,[90,100,110]);data[3]=127;data[7]=128;data[11]=255;
 const r=await engine.processRGBA(data,3,1,{halftone:false,knockout:false,cleanup:'none',minDiameterMM:2});assert.deepEqual([r.data[3],r.data[7],r.data[11]],[0,255,255]);assert.equal(r.stats.minDiameterMM,0);
 const s=await engine.processRGBA(data,3,1,{halftone:false,alphaThreshold:200,knockout:false,cleanup:'none'});assert.equal(s.data[7],0);assert.equal(s.data[11],255);
});
test('color controls change RGB independently of coverage; zero is neutral and white stays white',async()=>{
 const data=solid(128,64,[45,70,110],160),o={knockout:false,cleanup:'none'},a=await engine.processRGBA(data,128,64,o),b=await engine.processRGBA(data,128,64,{...o,shadowBoost:40,colorBoost:20});
 for(let i=3;i<a.data.length;i+=4)assert.equal(a.data[i],b.data[i]);assert.ok(b.data.some((v,i)=>i%4!==3&&v!==a.data[i]));
 const white=await engine.processRGBA(solid(2,2),2,2,{...o,shadowBoost:100,colorBoost:100});assert.deepEqual(white.data,solid(2,2));
});
test('localized de-fringe uses nearby opaque interior but preserves solid regions',async()=>{
 const data=new Uint8Array([255,0,0,255,100,0,0,128,0,0,0,0]),r=await engine.processRGBA(data,3,1,{knockout:false,halftone:false,cleanup:'none',defringe:true,defringeRadius:2});
 assert.deepEqual(Array.from(r.data.subarray(0,4)),[255,0,0,255]);assert.deepEqual(Array.from(r.data.subarray(4,8)),[255,0,0,255]);assert.equal(r.data[11],0);
});
test('None and warnings expose lineature/cleanup interaction and removed-particle mask',async()=>{
 const data=solid(128,128,[255,255,255],51),high=await engine.processRGBA(data,128,128,{lpi:75,knockout:false,cleanup:'standard'}),none=await engine.processRGBA(data,128,128,{lpi:75,knockout:false,cleanup:'none'});
 assert.equal(high.stats.inkPixels,0);assert.ok(none.stats.inkPixels>3000);assert.equal(high.removedMask.reduce((a,b)=>a+b,0),high.stats.removedPixels);assert.ok(diagnostics.warnings({lpi:75,cleanup:'standard'},high.stats).some(s=>s.includes('eliminó')));
});
test('disk budget rejects preflight before any processing; 128 MP estimate remains bounded per tile',()=>{
 const p={width:10000,height:10000};assert.throws(()=>diagnostics.preflight(p,{memoryMode:'disk'},.1),/insuficiente/);const r=diagnostics.preflight(p,{memoryMode:'disk'},2);assert.equal(r.resources.cacheBytes,800e6);assert.ok(r.resources.workingBytes<40e6);
});
test('recipe import validates schema, bounds and enums; ignores host IDs and prototype properties',()=>{
 const r=recipes.entry({name:'Algodón negro',options:{key:'#000000',lpi:35,protection:'edges',documentID:99},areas:{front:{M:[25,33]}},profile:{rip:'RasterLink 7'}});
 const decoded=recipes.parse(recipes.serialize([r]));assert.equal(decoded[0].profile.rip,'RasterLink 7');assert.equal(decoded[0].options.documentID,undefined);assert.equal(decoded[0].options.protection,'edges');
 assert.throws(()=>recipes.options({viewMode:'bad'}));assert.throws(()=>recipes.options({halftone:'yes'}));assert.throws(()=>recipes.areas({front:{M:[-1,10]}}));assert.throws(()=>recipes.parse('{"schema":"bad"}'));
 const o=recipes.options(JSON.parse('{"__proto__":{"polluted":true},"knockout":false}'));assert.equal(o.polluted,undefined);assert.equal({}.polluted,undefined);
});
test('additional positions and child sizes fit without deformation and refuse impossible dimensions',()=>{
 for(const p of Object.keys(sizing.PRESETS))for(const size of sizing.CHILD_SIZES){const a=sizing.garmentArea(p,size,'child');assert.ok(a[0]>0&&a[1]>0);}
 assert.deepEqual(sizing.garmentArea('chest','M'),[10,10]);assert.throws(()=>sizing.plan(1,1000000,300,{widthCM:.01}),/300000/);
});
test('overview stitching conserves source tint and alpha over tile boundaries',async()=>{
 const source=new MemoryStore(640,320,4,solid(640,320,[100,150,200],255)),preview=await thumbnail(source,160);assert.equal(preview.width,160);assert.equal(preview.height,80);
 for(let i=0;i<preview.data.length;i+=4){assert.deepEqual(Array.from(preview.data.subarray(i,i+4)),[100,150,200,255]);}
});
test('garment placement uses physical dimensions; comparison and background never mutate artwork',()=>{
 const source={data:solid(40,40,[255,0,0]),width:40,height:40},result={data:solid(40,40,[0,255,0]),width:40,height:40},cached={src:source,result,size:{widthCM:10,heightCM:10}},o={key:'#000000',mockupChestCM:52,mockupHeightCM:72,mockupX:50,mockupY:18,comparePosition:50};
 const view=mockupRGB(cached,'compare',o);assert.equal(view.width,420);assert.ok(view.data.some((v,i)=>i%3===0&&v===255));assert.ok(view.data.some((v,i)=>i%3===1&&v===255));assert.equal(source.data[0],255);assert.equal(result.data[1],255);
 assert.throws(()=>mockupRGB(cached,'garment',{...o,mockupChestCM:0}),/inválidas/);
});
test('localized color treatment and cleanup produce identical RAM/tiled pixels across seams',async()=>{
 const w=530,h=64,data=solid(w,h,[200,60,20],200);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(y<2||y>h-3)data[(y*w+x)*4+3]=0;else if(y<5)data[(y*w+x)*4+3]=128;else data[(y*w+x)*4+3]=255;
 const o={knockout:false,cleanup:'standard',defringe:true,defringeRadius:3,shadowBoost:25,colorBoost:10},a=await engine.processRGBA(data,w,h,o),source=new MemoryStore(w,h,4,data),target=new MemoryStore(w,h);await processTiles(source,target,o);assert.deepEqual(a.data,target.data);
});

test('custom areas cannot bypass garment, size or placement validation',()=>{
 assert.throws(()=>sizing.garmentArea('front','../M','adult',[20,20]),/Talla/);
 assert.throws(()=>sizing.garmentArea('../back','M','adult',[20,20]),/Posición/);
 assert.throws(()=>sizing.garmentArea('front','M','unknown',[20,20]),/prenda/);
 assert.throws(()=>sizing.garmentArea('front','4','adult',[20,20]),/Talla/);
});
test('mockup rejects invalid coordinates instead of rendering an empty image',()=>{
 const src={data:new Uint8Array([220,60,40,255]),width:1,height:1},cached={src,result:src,size:{widthCM:20,heightCM:20}};
 for(const options of [{mockupX:NaN},{mockupY:-1},{comparePosition:101}])assert.throws(()=>mockupRGB(cached,'compare',{key:'#000000',...options}),/0 a 100/);
});

test('protection radius controls opaque detail width and exposes the actual protected mask',async()=>{
 const w=20,h=10,data=solid(w,h,[200,40,20]);for(let y=0;y<h;y++)data[(y*w+8)*4+3]=0;
 const options={knockout:false,cleanup:'none',protection:'edges',outputWhite:60};
 const one=await engine.processRGBA(data,w,h,{...options,edgeRadius:1}),three=await engine.processRGBA(data,w,h,{...options,edgeRadius:3});
 assert.ok(three.stats.protectedPixels>one.stats.protectedPixels);assert.equal(one.protectedMask[10],0);assert.equal(three.protectedMask[10],255);assert.equal(three.data[10*4+3],255);
 assert.throws(()=>engine.validate({...options,edgeRadius:1.5}),/enteros/);
});
test('expanded automatic protection has exact RGB and alpha across disk tile boundaries',async()=>{
 const w=530,h=20,data=solid(w,h,[200,50,20]);for(let y=0;y<h;y++)data[(y*w+511)*4+3]=0;
 const options={knockout:false,cleanup:'standard',protection:'edges',edgeRadius:4,outputWhite:90};
 const full=await engine.processRGBA(data,w,h,options),target=new MemoryStore(w,h);await processTiles(new MemoryStore(w,h,4,data),target,options);assert.deepEqual(target.data,full.data);
});
