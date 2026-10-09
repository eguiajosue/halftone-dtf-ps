'use strict';
const {processRGBA,validate}=require('./engine');
const TILE_SIZE=512;
const RAM_PIXELS=16000000;
let sequence=0;
const activeFolders=new Set();
function* tiles(width,height,size=TILE_SIZE){
  for(let top=0;top<height;top+=size)for(let left=0;left<width;left+=size)
    yield {left,top,width:Math.min(size,width-left),height:Math.min(size,height-top)};
}
function expand(crop,width,height,halo){
  const left=Math.max(0,crop.left-halo),top=Math.max(0,crop.top-halo);
  return {left,top,width:Math.min(width,crop.left+crop.width+halo)-left,height:Math.min(height,crop.top+crop.height+halo)-top};
}
function cut(data,width,crop,components=4){
  const out=new Uint8Array(crop.width*crop.height*components);
  for(let y=0;y<crop.height;y++){
    const i=((crop.top+y)*width+crop.left)*components;
    out.set(data.subarray(i,i+crop.width*components),y*crop.width*components);
  }
  return out;
}
class MemoryStore{
  constructor(width,height,components=4,data){this.width=width;this.height=height;this.components=components;this.data=data||new Uint8Array(width*height*components);this.kind='ram';}
  async put(crop,data){for(let y=0;y<crop.height;y++)this.data.set(data.subarray(y*crop.width*this.components,(y+1)*crop.width*this.components),((crop.top+y)*this.width+crop.left)*this.components);}
  async read(crop){return {data:cut(this.data,this.width,crop,this.components),width:crop.width,height:crop.height};}
  async dispose(){this.data=null;}
}
class DiskStore{
  constructor(width,height,components,folder,format,size=TILE_SIZE){Object.assign(this,{width,height,components,folder,format,size});this.entries=new Map();this.kind='disk';}
  async put(crop,data){
    if(crop.left%this.size||crop.top%this.size||data.length!==crop.width*crop.height*this.components)throw Error('Bloque de caché inválido.');
    const key=crop.left+','+crop.top,file=await this.folder.createFile(crop.left+'-'+crop.top+'.bin',{overwrite:false});
    await file.write(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),{format:this.format});this.entries.set(key,{file,crop});
  }
  async read(crop){
    const out=new Uint8Array(crop.width*crop.height*this.components);
    for(let top=Math.floor(crop.top/this.size)*this.size;top<crop.top+crop.height;top+=this.size)
      for(let left=Math.floor(crop.left/this.size)*this.size;left<crop.left+crop.width;left+=this.size){
        const entry=this.entries.get(left+','+top);if(!entry)throw Error('Falta un bloque de caché temporal.');
        const data=new Uint8Array(await entry.file.read({format:this.format})),b=entry.crop;
        if(data.length!==b.width*b.height*this.components)throw Error('Bloque temporal incompleto.');
        const x0=Math.max(left,crop.left),x1=Math.min(left+b.width,crop.left+crop.width),y0=Math.max(top,crop.top),y1=Math.min(top+b.height,crop.top+crop.height);
        for(let y=y0;y<y1;y++){
          const i=((y-top)*b.width+x0-left)*this.components;
          out.set(data.subarray(i,i+(x1-x0)*this.components),((y-crop.top)*crop.width+x0-crop.left)*this.components);
        }
      }
    return {data:out,width:crop.width,height:crop.height};
  }
  async dispose(){if(this.folder){await this.folder.delete();activeFolders.delete(this.folder.name);this.folder=null;this.entries.clear();}}
}
async function createDiskStore(width,height,components=4){
  const {storage}=require('uxp'),parent=await storage.localFileSystem.getTemporaryFolder();
  const folder=await parent.createFolder('halftone-'+Date.now()+'-'+(++sequence));
  try{
  const marker=await folder.createFile('cache.json',{overwrite:false});await marker.write(JSON.stringify({owner:'com.josueeguia.halftonedtf',schema:1}));activeFolders.add(folder.name);
  return new DiskStore(width,height,components,folder,storage.formats.binary);
  }catch(e){try{await folder.delete();}catch(cleanup){e.message+=' No se pudo eliminar la caché incompleta '+folder.name+': '+cleanup.message;}throw e;}
}
function haloFor(options){
  const n=validate(options),diameter=n.minDiameterMM/25.4*n.dpi;
  const area=Math.max(1,Math.ceil(Math.PI*(diameter/2)**2));
  // Every removable 8-connected component has < area pixels and hence spans
  // at most area-1 steps. This halo gives exact global small-particle cleanup,
  // even across tile corners. Also include the edge detector's one-pixel radius.
  return area-1+Math.max(n.protection==='edges'?n.edgeRadius:0,n.defringe?n.defringeRadius:0);
}
async function processTiles(source,target,options,hook,protectStore){
  const n=validate(options),halo=haloFor(n),count=Math.ceil(source.width/TILE_SIZE)*Math.ceil(source.height/TILE_SIZE);
  let done=0,inkPixels=0,removedPixels=0,protectedPixels=0,screenPixels=0,cellStats;
  for(const core of tiles(source.width,source.height)){
    if(hook)await hook('tile',done/count);
    const bounds=expand(core,source.width,source.height,halo),src=await source.read(bounds);
    const protect=protectStore?(await protectStore.read(bounds)).data:null;
    const region={left:core.left-bounds.left,top:core.top-bounds.top,width:core.width,height:core.height};
    const result=await processRGBA(src.data,src.width,src.height,Object.assign({},n,{originX:bounds.left,originY:bounds.top,protectMask:protect,statsRegion:region}),hook);
    if(hook)await hook('tile',done/count);
    await target.put(core,cut(result.data,src.width,region));
    screenPixels+=result.stats.regionScreenPixels;inkPixels+=result.stats.regionInkPixels;removedPixels+=result.stats.regionRemovedPixels;protectedPixels+=result.stats.regionProtectedPixels;cellStats=result.stats;done++;
  }
  if(hook)await hook('tile',1);
  return {cellPX:cellStats.cellPX,minArea:cellStats.minArea,minDiameterMM:cellStats.minDiameterMM,inkPixels,removedPixels,protectedPixels,screenPixels,removedComponents:null,coveragePercent:inkPixels/(source.width*source.height)*100};
}
module.exports={TILE_SIZE,RAM_PIXELS,tiles,expand,cut,MemoryStore,DiskStore,createDiskStore,haloFor,processTiles};

async function cleanupAbandonedCaches(){const {storage}=require('uxp'),parent=await storage.localFileSystem.getTemporaryFolder();let deleted=0;const errors=[];
 for(const folder of await parent.getEntries()){if(!folder.isFolder||!/^halftone-\d+-\d+$/.test(folder.name)||activeFolders.has(folder.name))continue;
 try{const m=JSON.parse(await (await folder.getEntry('cache.json')).read());if(m.owner==='com.josueeguia.halftonedtf'&&m.schema===1){await folder.delete();deleted++;}}catch(e){errors.push(folder.name+': '+e.message);}}return {deleted,errors};}
module.exports.cleanupAbandonedCaches=cleanupAbandonedCaches;
