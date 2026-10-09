'use strict';
const tiles=require('./tiles'),sizing=require('./sizing'),recipes=require('./recipes');
const {entry}=require('./batch');
function checksum(bytes){let h=2166136261;for(let i=0;i<bytes.length;i++)h=Math.imul(h^bytes[i],16777619);return (h>>>0).toString(16).padStart(8,'0');}
async function save(parent,session,options,format,check=()=>{}){
  const folder=await parent.createFolder('DTF-Proyecto-'+Date.now());
  try{
  const source=await folder.createFolder('origen'),mask=session.protectStore?await folder.createFolder('proteccion'):null;
  const store=session.sourceStore||new tiles.MemoryStore(session.size.width,session.size.height,4,session.source),blocks=[];
  for(const crop of tiles.tiles(store.width,store.height)){
    check();const part=await store.read(crop),name=crop.left+'-'+crop.top+'.bin';
    const file=await source.createFile(name,{overwrite:false});await file.write(part.data.buffer.slice(part.data.byteOffset,part.data.byteOffset+part.data.byteLength),{format});
    const block={...crop,name,hash:checksum(part.data)};
    if(mask){const p=await session.protectStore.read(crop),f=await mask.createFile(name,{overwrite:false});await f.write(p.data.buffer.slice(p.data.byteOffset,p.data.byteOffset+p.data.byteLength),{format});block.maskHash=checksum(p.data);}
    blocks.push(block);await new Promise(r=>setTimeout(r,0));
  }
  check();const manifest={schema:'halftone-project',version:1,plugin:'0.5.0',size:{width:store.width,height:store.height,dpi:300},options:recipes.options(options),blocks};
  const file=await folder.createFile('proyecto.json',{overwrite:false});await file.write(JSON.stringify(manifest));return folder;
  }catch(e){try{await folder.delete();}catch(cleanup){e.message+=' No se pudo eliminar el proyecto incompleto '+folder.name+': '+cleanup.message;}throw e;}
}
async function load(folder,format,check=()=>{},createStore=tiles.createDiskStore){
  const file=await entry(folder,'proyecto.json');if(file.getMetadata&&(await file.getMetadata()).size>2e6)throw Error('Proyecto demasiado grande.');
  const text=await file.read();if(text.length>2e6)throw Error('Proyecto demasiado grande.');const m=JSON.parse(text),w=m.size?.width,h=m.size?.height;
  if(m.schema!=='halftone-project'||m.version!==1||!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>300000||h>300000||w*h>sizing.MAX_OUTPUT_PIXELS||m.size.dpi!==300)throw Error('Formato de proyecto inválido.');
  const expected=Array.from(tiles.tiles(w,h));if(!Array.isArray(m.blocks)||expected.length!==m.blocks.length)throw Error('Faltan bloques de origen.');
  const options=recipes.options(m.options),sourceFolder=await entry(folder,'origen');let sourceStore,protectStore;
  try{
    sourceStore=await createStore(w,h);if(m.blocks.some(b=>b.maskHash))protectStore=await createStore(w,h,1);
    const maskFolder=protectStore?await entry(folder,'proteccion'):null;
    for(let i=0;i<expected.length;i++){
      check();const crop=expected[i],b=m.blocks[i],name=crop.left+'-'+crop.top+'.bin';
      if(b.name!==name||Object.keys(crop).some(k=>b[k]!==crop[k]))throw Error('Coordenadas de proyecto inválidas.');
      const f=await entry(sourceFolder,name);if(f.getMetadata&&(await f.getMetadata()).size!==crop.width*crop.height*4)throw Error('Bloque de origen incompleto.');
      const data=new Uint8Array(await f.read({format}));if(data.length!==crop.width*crop.height*4||checksum(data)!==b.hash)throw Error('El origen del proyecto está dañado.');await sourceStore.put(crop,data);
      if(protectStore){const file=await entry(maskFolder,name),p=new Uint8Array(await file.read({format}));if(p.length!==crop.width*crop.height||checksum(p)!==b.maskHash)throw Error('La protección está dañada.');await protectStore.put(crop,p);}
      await new Promise(r=>setTimeout(r,0));
    }
    return {sourceStore,protectStore,size:sizing.plan(w,h,300),options};
  }catch(e){if(sourceStore)await sourceStore.dispose();if(protectStore)await protectStore.dispose();throw e;}
}
module.exports={save,load,checksum};
