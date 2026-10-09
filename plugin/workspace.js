'use strict';
// Presentation only: never write a preview into the printable result layer.
const {viewRGB}=require('./views');
const {tiles,MemoryStore}=require('./tiles');
const supported=['original','garment','beforeGarment','compare','transparent','mask'];
function superseded(){const e=Error('Vista reemplazada.');e.superseded=true;return e;}
function tileView(mode,original,result,crop,size,options){
  let localMode=mode,localOptions=options;
  if(mode==='compare'){
    const split=Math.round(size.width*(options.comparePosition??50)/100),local=split-crop.left;
    if(local<=0)localMode='garment';else if(local>=crop.width)localMode='beforeGarment';
    else localOptions={...options,comparePosition:local/crop.width*100};
  }
  const rgb=viewRGB(localMode,original,result,crop.width,crop.height,localOptions),rgba=new Uint8Array(crop.width*crop.height*4);
  if(mode==='compare'){
    const split=Math.round(size.width*(options.comparePosition??50)/100),local=split-crop.left;
    if(split>0&&split<size.width&&local>=0&&local<crop.width)for(let y=0;y<crop.height;y++)rgb.fill(255,(y*crop.width+local)*3,(y*crop.width+local+1)*3);
  }
  for(let p=0;p<crop.width*crop.height;p++){rgba[p*4]=rgb[p*3];rgba[p*4+1]=rgb[p*3+1];rgba[p*4+2]=rgb[p*3+2];rgba[p*4+3]=255;}
  return rgba;
}
function createWorkspace({app,core,imaging,readRGBA,profile}){
  const wait=async session=>{if(session.workspaceTask)await session.workspaceTask.catch(()=>{});};
  async function clear(session){
    session.workspaceRevision=(session.workspaceRevision||0)+1;await wait(session);
    if(session.workspaceLayerID==null)return;
    await core.executeAsModal(async()=>{
      const doc=Array.from(app.documents).find(d=>d.id===session.documentID);
      const layer=doc&&Array.from(doc.layers).find(l=>l.id===session.workspaceLayerID);
      if(layer)await layer.delete();session.workspaceLayerID=null;
    },{commandName:'Conservar solo el resultado DTF'});
  }
  function show(session,mode,options,externalCheck=()=>{},resultStore=null){
    if(!supported.includes(mode))return Promise.resolve();
    const revision=session.workspaceRevision=(session.workspaceRevision||0)+1,previous=session.workspaceTask;
    const check=()=>{externalCheck();if(session.closed||revision!==session.workspaceRevision)throw superseded();};
    const job=(async()=>{
      if(previous)await previous.catch(()=>{});check();
      await core.executeAsModal(async context=>{
        check();const doc=Array.from(app.documents).find(d=>d.id===session.documentID);
        if(!doc)throw Error('El documento de trabajo fue cerrado.');
        const resultLayer=Array.from(doc.layers).find(l=>l.id===session.layerID);
        if(!resultLayer)throw Error('La capa de resultado fue eliminada.');
        app.activeDocument=doc;
        const old=Array.from(doc.layers).find(l=>l.id===session.workspaceLayerID);
        if(mode==='transparent'){if(old)await old.delete();session.workspaceLayerID=null;session.workspaceMode=mode;return;}
        const source=session.sourceStore||new MemoryStore(session.size.width,session.size.height,4,session.source);
        const history=await context.hostControl.suspendHistory({documentID:doc.id,name:'Vista DTF · '+mode});let committed=false,newLayer;
        try{
          newLayer=await doc.createPixelLayer();newLayer.visible=false;newLayer.bringToFront();
          let first=true;
          for(const crop of tiles(session.size.width,session.size.height)){
            check();if(context.isCancelled)throw superseded();
            // Use the just-computed output only for this awaited presentation.
            // View-only changes fall back to Photoshop; never retain another full image.
            const needsOriginal=['original','beforeGarment','compare'].includes(mode);
            const needsResult=!['original','beforeGarment'].includes(mode);
            const original=needsOriginal?(await source.read(crop)).data:null;
            let result=null;
            if(needsResult){
              if(resultStore)result=(await resultStore.read(crop)).data;
              else{
                const native=await readRGBA(doc,resultLayer.id,{left:crop.left,top:crop.top,right:crop.left+crop.width,bottom:crop.top+crop.height});
                result=new Uint8Array(crop.width*crop.height*4);
                for(let y=0;y<native.height;y++){
                  const offset=((native.bounds.top-crop.top+y)*crop.width+native.bounds.left-crop.left)*4;
                  result.set(native.data.subarray(y*native.width*4,(y+1)*native.width*4),offset);
                }
              }
            }
            check();const rgba=tileView(mode,original,result,crop,session.size,options);let im;
            try{
              im=await imaging.createImageDataFromBuffer(rgba,{width:crop.width,height:crop.height,components:4,colorSpace:'RGB',colorProfile:profile});check();
              await imaging.putPixels({documentID:doc.id,layerID:newLayer.id,imageData:im,replace:first,targetBounds:{left:crop.left,top:crop.top}});first=false;
            }finally{if(im)im.dispose();}
            await new Promise(r=>setTimeout(r,0));
          }
          check();if(context.isCancelled)throw superseded();
          newLayer.name='VISTA · '+({original:'Original',garment:'Prenda',beforeGarment:'Antes sobre prenda',compare:'Antes / después',mask:'Máscara'}[mode])+' · no exportar';
          if(old)await old.delete();newLayer.visible=true;
          await context.hostControl.resumeHistory(history,true);committed=true;session.workspaceLayerID=newLayer.id;session.workspaceMode=mode;
        }finally{if(!committed)await context.hostControl.resumeHistory(history,false);}
      },{commandName:'Mostrar vista DTF en Photoshop'});
    })();
    session.workspaceTask=job;return job;
  }
  return {show,clear,wait};
}
module.exports={createWorkspace,tileView};
