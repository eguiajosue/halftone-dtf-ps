'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {processRGBA}=require('../plugin/engine'),views=require('../plugin/views'),sizing=require('../plugin/sizing');
const {MemoryStore,DiskStore,tiles,processTiles,haloFor}=require('../plugin/tiles');
function fakeFolder(){
 const entries=new Map();return {entries,deleted:false,
  createFile:async(name,{overwrite}={})=>{if(entries.has(name)&&!overwrite)throw Error('exists');const file={name,data:null,write:async data=>{file.data=new Uint8Array(data).slice();},read:async()=>file.data.slice().buffer};entries.set(name,file);return file;},
  delete:async function(){this.deleted=true;entries.clear();}
 };
}
test('disk tiles stitch arbitrary crops, truncated edge blocks and detect missing/corrupt data',async()=>{
 const w=19,h=17,folder=fakeFolder(),disk=new DiskStore(w,h,4,folder,'binary',8),data=new Uint8Array(w*h*4);for(let i=0;i<data.length;i++)data[i]=i%251;
 const memory=new MemoryStore(w,h,4,data);
 for(const tile of tiles(w,h,8))await disk.put(tile,(await memory.read(tile)).data);
 for(const crop of [{left:0,top:0,width:w,height:h},{left:7,top:6,width:10,height:9},{left:17,top:16,width:2,height:1}])assert.deepEqual((await disk.read(crop)).data,(await memory.read(crop)).data);
 folder.entries.get('16-16.bin').data=new Uint8Array(1);await assert.rejects(disk.read({left:17,top:16,width:2,height:1}),/incompleto/);
 await disk.dispose();assert.equal(folder.deleted,true);
});
test('tiled screening and cleanup match full image across edges/corners with all protection modes',async()=>{
 const w=1031,h=1029,input=new Uint8Array(w*h*4),mask=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=y*w+x;if((x%37<10&&y%31<6)||Math.abs(x-y)<2)input.set([240,80,50,(x+y)%3?255:150],p*4);
  if(x>=506&&x<=516&&y>=506&&y<=516)mask[p]=255;
 }
 // Small diagonal components cross the intersection of four tiles.
 for(let i=0;i<7;i++)input.set([0,0,0,255],((509+i)*w+509+i)*4);
 const source=new MemoryStore(w,h,4,input),protect=new MemoryStore(w,h,1,mask);
 for(const protection of ['off','edges','selection']){
  const o={knockout:true,key:'#000000',lpi:35,angle:33,shape:'round',cleanup:'high',minDiameterMM:.6,outputWhite:180,protection};
  const full=await processRGBA(input,w,h,{...o,protectMask:mask}),out=new MemoryStore(w,h);
  let maxRead=0;const read=source.read.bind(source);source.read=async c=>{maxRead=Math.max(maxRead,c.width*c.height);return read(c);};
  const stats=await processTiles(source,out,o,undefined,protect);
  assert.ok(Buffer.from(out.data).equals(Buffer.from(full.data)),'full/tiled mismatch: '+protection);
  assert.equal(stats.inkPixels,full.stats.inkPixels);assert.equal(stats.removedPixels,full.stats.removedPixels);
  assert.ok(maxRead<(512+2*haloFor(o))**2+1);
 }
});
test('manual selection preserves selected color and particles while removing unprotected same-color background',async()=>{
 const input=new Uint8Array(20*20*4),mask=new Uint8Array(400);
 input.set([0,0,0,255],(10*20+10)*4);input.set([0,0,0,255],(10*20+11)*4);mask[10*20+10]=255;
 const r=await processRGBA(input,20,20,{key:'#000000',protection:'selection',protectMask:mask,cleanup:'high'});
 assert.deepEqual(Array.from(r.data.subarray((10*20+10)*4,(10*20+10)*4+4)),[0,0,0,255]);assert.equal(r.data[(10*20+11)*4+3],0);assert.equal(r.stats.protectedPixels,1);
 await assert.rejects(processRGBA(input,20,20,{protection:'selection'}),/Captura/);
});
test('automatic protection preserves thin opaque strokes, keeps knockout holes and does not solidify soft gradients',async()=>{
 const w=40,h=40,input=new Uint8Array(w*h*4);for(let y=2;y<38;y++)input.set([230,20,70,255],(y*w+20)*4);
 input.set([0,0,0,255],(5*w+5)*4);input.set([230,20,70,100],(6*w+6)*4);
 const r=await processRGBA(input,w,h,{protection:'edges',outputWhite:100,minDiameterMM:1,cleanup:'high'});
 for(let y=2;y<38;y++)assert.equal(r.data[(y*w+20)*4+3],255);
 assert.equal(r.data[(5*w+5)*4+3],0);assert.equal(r.data[(6*w+6)*4+3],0);
});
test('comparison uses one garment color and a movable divider without mutating output',()=>{
 const original=new Uint8Array([200,0,0,128,200,0,0,255,0,0,0,0,200,0,0,255]),result=new Uint8Array([200,0,0,255,0,0,0,0,0,0,0,0,0,0,0,0]),copy=result.slice();
 const o={key:'#123456',linkBackground:true};const before=views.viewRGB('beforeGarment',original,result,4,1,o),after=views.viewRGB('garment',original,result,4,1,o);
 assert.deepEqual(views.viewRGB('compare',original,result,4,1,{...o,comparePosition:100}),before);
 assert.deepEqual(views.viewRGB('compare',original,result,4,1,{...o,comparePosition:0}),after);
 const half=views.viewRGB('compare',original,result,4,1,{...o,comparePosition:50});assert.deepEqual(half.subarray(0,6),before.subarray(0,6));assert.deepEqual(half.subarray(6,9),new Uint8Array([255,255,255]));assert.deepEqual(half.subarray(9),after.subarray(9));assert.deepEqual(result,copy);
});
test('large physical output above 32 MP is accepted; hard cap remains 128 MP',()=>{
 const p=sizing.plan(2000,3000,300,{widthCM:60});assert.ok(p.width*p.height>32000000&&p.width*p.height<128000000);
 assert.equal(p.dpi,300);assert.throws(()=>sizing.plan(1000,1000,300,{widthCM:100}),/128 megap/);
});
test('actual >32 MP tiled run never requests or emits a full-image RGBA buffer',async()=>{
 const width=8192,height=4097;let maxRead=0,written=0;
 const source={width,height,read:async crop=>{
  maxRead=Math.max(maxRead,crop.width*crop.height);const data=new Uint8Array(crop.width*crop.height*4);
  for(let y=0;y<crop.height;y++)if((y+crop.top)%64===0)for(let x=0;x<crop.width;x++)data.set([220,30,100,255],(y*crop.width+x)*4);
  return {data,width:crop.width,height:crop.height};
 }};
 const target={put:async(crop,data)=>{assert.equal(data.length,crop.width*crop.height*4);assert.ok(data.length<=512*512*4);written+=crop.width*crop.height;}};
 const stats=await processTiles(source,target,{knockout:false,minDiameterMM:0});
 assert.equal(written,width*height);assert.ok(written>32000000);assert.equal(stats.inkPixels,65*width);assert.ok(maxRead<=512*512);
});
