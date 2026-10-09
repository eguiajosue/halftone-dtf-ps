'use strict';
const {app,imaging,core,constants,action}=require('photoshop');
const {processRGBA,validate}=require('./engine');
const sizing=require('./sizing');
const {viewRGB}=require('./views');
const tileEngine=require('./tiles');
const diagnostics=require('./diagnostics');
const approvedSizes=new Map();
const PROFILE='sRGB IEC61966-2.1';
const workspace=require('./workspace').createWorkspace({app,core,imaging,readRGBA,profile:PROFILE});
const MAX_TILE_SOURCE_PIXELS=16000000;
function printPlan(doc,options){const f=options.frame||{left:0,top:0,width:doc.width,height:doc.height};return {...sizing.plan(f.width,f.height,doc.resolution,options),frame:f};}
function cancelError(message){const error=Error(message);error.cancelled=true;return error;}
function sourceDocument(source,documentID,pinnedLayerID) {
  if(!app.documents.length) throw Error('Abre un documento antes de empezar.');
  const doc=documentID==null?app.activeDocument:Array.from(app.documents).find(d=>d.id===documentID);
  if(!doc) throw Error('El documento de origen fue cerrado. Selecciona otro origen.');
  if(doc.mode!==constants.DocumentMode.RGB || doc.bitsPerChannel!==constants.BitsPerChannelType.EIGHT) throw Error('Usa Imagen > Modo > Color RGB y 8 bits/canal. Trabaja sobre una copia si necesitas convertir.');
  if(doc.pixelAspectRatio!==1) throw Error('Usa píxeles cuadrados (proporción 1:1).');
  let layerID;
  if(source==='layer') {
    if(pinnedLayerID!=null){
      const find=layers=>Array.from(layers).some(l=>l.id===pinnedLayerID||(l.layers&&find(l.layers)));
      if(!find(doc.layers||doc.activeLayers))throw Error('La capa de origen fue eliminada. Vuelve a seleccionar el origen.');layerID=pinnedLayerID;
    }else{
    if(doc.activeLayers.length!==1) throw Error('Selecciona exactamente una capa.');
    layerID=doc.activeLayers[0].id;
    }
  }
  return {doc,layerID};
}
function info() {
  const {doc}=sourceDocument('composite');
  return {documentID:doc.id,layerID:doc.activeLayers.length===1?doc.activeLayers[0].id:null,name:doc.name,width:doc.width,height:doc.height,dpi:doc.resolution,
    widthCM:doc.width/doc.resolution*2.54,heightCM:doc.height/doc.resolution*2.54};
}
async function readRGBA(doc,layerID,bounds) {
  if((bounds.right-bounds.left)*(bounds.bottom-bounds.top)>MAX_TILE_SOURCE_PIXELS) throw Error('La región de origen excede el presupuesto de memoria. Reduce el lienzo o recorta el arte.');
  let obj;
  try {
    const request={documentID:doc.id,sourceBounds:bounds,
      colorSpace:'RGB',colorProfile:PROFILE,componentSize:8,applyAlpha:false};
    // Native UXP validates present keys even when their value is undefined.
    // Omit layerID for the merged composition; include only a valid native ID.
    if(layerID!=null){
      if(!Number.isSafeInteger(layerID))throw Error('El identificador de la capa no es numérico. Vuelve a seleccionar el origen.');
      request.layerID=layerID;
    }
    obj=await imaging.getPixels(request);
    const im=obj.imageData;
    if(!im || !im.width || !im.height) return {data:new Uint8Array(0),width:0,height:0,bounds:{left:bounds.left,top:bounds.top}};
    if(obj.level!==0) throw Error('Photoshop devolvió píxeles de caché reducidos. No se aplicará una trama a escala incorrecta.');
    const raw=await im.getData({chunky:true}),data=new Uint8Array(im.width*im.height*4);
    if(im.components===4) data.set(raw);
    else if(im.components===3) {
      for(let p=0;p<im.width*im.height;p++) {data.set(raw.subarray(p*3,p*3+3),p*4);data[p*4+3]=255;}
    } else throw Error('Formato de píxeles inesperado.');
    return {data,width:im.width,height:im.height,bounds:obj.sourceBounds};
  } finally {if(obj && obj.imageData) obj.imageData.dispose();}
}
function cropAtFocus(p,focus) {
  if(!focus || ![focus.x,focus.y].every(v=>Number.isFinite(v)&&v>=0&&v<=100)) throw Error('Centro X/Y: usa porcentajes entre 0 y 100.');
  const width=Math.min(512,p.width),height=Math.min(512,p.height);
  return {width,height,left:Math.max(0,Math.min(p.width-width,Math.round(p.width*focus.x/100-width/2))),
    top:Math.max(0,Math.min(p.height-height,Math.round(p.height*focus.y/100-height/2)))};
}
async function readFinalCrop(doc,layerID,p,crop,hook,selection=false) {
  const frame=p.frame||{left:0,top:0,width:doc.width,height:doc.height},virtual=sizing.sourceBoundsForCrop(frame.width,frame.height,p.width,p.height,crop);
  const bounds={left:virtual.left+frame.left,top:virtual.top+frame.top,right:virtual.right+frame.left,bottom:virtual.bottom+frame.top};
  if((bounds.right-bounds.left)*(bounds.bottom-bounds.top)>MAX_TILE_SOURCE_PIXELS) {
    if(crop.width===1&&crop.height===1)return readLargeSample(doc,layerID,p,crop,bounds,hook,selection);
    const horizontal=crop.width>=crop.height,half=Math.floor((horizontal?crop.width:crop.height)/2);
    const a=Object.assign({},crop,horizontal?{width:half}:{height:half});
    const b=Object.assign({},crop,horizontal?{left:crop.left+half,width:crop.width-half}:{top:crop.top+half,height:crop.height-half});
    const out=new tileEngine.MemoryStore(crop.width,crop.height);
    for(const c of [a,b]) {
      if(hook)await hook('resize',0);
      const part=await readFinalCrop(doc,layerID,p,c,hook,selection);
      await out.put({left:c.left-crop.left,top:c.top-crop.top,width:c.width,height:c.height},part.data);
    }
    return {data:out.data,width:crop.width,height:crop.height};
  }
  let native=selection?await readSelectionRGBA(doc,bounds):await readRGBA(doc,layerID,bounds);
  native.bounds={left:native.bounds.left-frame.left,top:native.bounds.top-frame.top};
  const resized=await sizing.resampleCrop(native,frame.width,frame.height,p.width,p.height,crop,hook);
  native=null;
  return resized;
}
// Extreme reduction can put millions of source pixels inside one output pixel.
// Integrate that footprint in bounded native tiles, without rounding partial sums.
async function readLargeSample(doc,layerID,p,crop,bounds,hook,selection){
  const frame=p.frame||{left:0,top:0,width:doc.width,height:doc.height};
  const weight=(position,scale,limit)=>{
    if(scale>1){const start=position*scale,end=Math.min(limit,(position+1)*scale);return v=>Math.max(0,Math.min(end,v+1)-Math.max(start,v))/scale;}
    const pairs=sizing.axisWeights(position,scale,limit);return v=>pairs.reduce((sum,[pixel,w])=>sum+(pixel===v?w:0),0);
  };
  const wx=weight(crop.left,frame.width/p.width,frame.width),wy=weight(crop.top,frame.height/p.height,frame.height);
  let alpha=0,r=0,g=0,b=0;
  for(const tile of tileEngine.tiles(bounds.right-bounds.left,bounds.bottom-bounds.top)){
    if(hook)await hook('resize',tile.top/(bounds.bottom-bounds.top));
    const region={left:bounds.left+tile.left,top:bounds.top+tile.top,right:bounds.left+tile.left+tile.width,bottom:bounds.top+tile.top+tile.height};
    const part=selection?await readSelectionRGBA(doc,region):await readRGBA(doc,layerID,region);
    const horizontal=Array.from({length:part.width},(_,x)=>wx(part.bounds.left-frame.left+x));
    for(let y=0;y<part.height;y++){
      const vertical=wy(part.bounds.top-frame.top+y);if(!vertical)continue;
      for(let x=0;x<part.width;x++){const i=(y*part.width+x)*4,a=part.data[i+3]/255*vertical*horizontal[x];alpha+=a;r+=part.data[i]*a;g+=part.data[i+1]*a;b+=part.data[i+2]*a;}
    }
  }
  const data=new Uint8Array(4);if(alpha>0)data.set([Math.round(r/alpha),Math.round(g/alpha),Math.round(b/alpha),Math.round(alpha*255)]);
  return {data,width:1,height:1};
}
async function jpegRGB(rgb,width,height) {
  let im;
  try {
    im=await imaging.createImageDataFromBuffer(rgb,{width,height,components:3,colorSpace:'RGB',colorProfile:PROFILE});
    return 'data:image/jpeg;base64,'+await imaging.encodeImageData({imageData:im,base64:true});
  } finally {if(im) im.dispose();}
}
async function renderPreview(cached,mode,options) {
  if(cached.mockup){const view=require('./views').mockupRGB(cached,mode,options);return jpegRGB(view.data,view.width,view.height);}
  const rgb=viewRGB(mode,cached.src.data,cached.result.data,cached.src.width,cached.src.height,{...options,removedMask:cached.result.removedMask,protectMask:cached.result.protectedMask||cached.protectMask});
  return jpegRGB(rgb,cached.src.width,cached.src.height);
}
async function preview(source,options,focus) {
  // Validate before entering modal scope too, so NaN bounds can never reach Photoshop.
  if(!focus || ![focus.x,focus.y].every(v=>Number.isFinite(v)&&v>=0&&v<=100)) throw Error('Centro X/Y: usa porcentajes entre 0 y 100.');
  return core.executeAsModal(async context=>{
    const {doc,layerID}=sourceDocument(source,options.documentID,options.layerID);
    const p=printPlan(doc,options);
    const n=validate(Object.assign({},options,{dpi:sizing.OUTPUT_DPI}));
    const crop=cropAtFocus(p,focus);
    const hook=async()=>{if(context.isCancelled) throw cancelError('Vista cancelada.');await new Promise(resolve=>setTimeout(resolve,0));};
    const src=await readFinalCrop(doc,layerID,p,crop,hook);
    const result=await processRGBA(src.data,src.width,src.height,Object.assign({},n,{originX:crop.left,originY:crop.top}),hook);
    const cached={src,result,stats:result.stats,dpi:sizing.OUTPUT_DPI,size:p};
    return Object.assign(cached,{image:await renderPreview(cached,options.viewMode||'garment',options)});
  },{commandName:'Vista Halftone DTF'});
}
async function apply(source,options,onProgress) {
  const pinned=sourceDocument(source,options.documentID,options.layerID),plan=printPlan(pinned.doc,options);
  if(plan.width*plan.height>tileEngine.RAM_PIXELS) {
    const session=await beginSession(source,options,onProgress);
    if(!session.stats.inkPixels){await cancelSession(session);throw Error('El resultado quedó vacío. Reduce tolerancia o limpieza.');}
    const result={documentID:session.documentID,size:session.size,dpi:300,stats:session.stats};await releaseSession(session);return result;
  }
  return core.executeAsModal(async context=>{
    const {doc,layerID}=sourceDocument(source,options.documentID,options.layerID);
    const p=printPlan(doc,options);
    const n=validate(Object.assign({},options,{dpi:sizing.OUTPUT_DPI}));
    let resized=new Uint8Array(p.width*p.height*4);
    // Read/resample horizontal strips with interpolation halo; phase is global.
    for(let top=0;top<p.height;top+=128) {
      if(context.isCancelled) throw cancelError('Proceso cancelado.');
      const crop={left:0,top,width:p.width,height:Math.min(128,p.height-top)};
      const strip=await readFinalCrop(doc,layerID,p,crop,async()=>{
        if(context.isCancelled) throw cancelError('Proceso cancelado.');await new Promise(resolve=>setTimeout(resolve,0));
      });
      resized.set(strip.data,top*p.width*4);
      context.reportProgress({value:(top+crop.height)/p.height*.25});
      if(onProgress) onProgress('resize',(top+crop.height)/p.height);
    }
    const result=await processRGBA(resized,p.width,p.height,Object.assign({},n,{originX:0,originY:0}),async(phase,value)=>{
      if(context.isCancelled) throw cancelError('Proceso cancelado.');
      context.reportProgress({value:phase==='screen'?.25+value*.4:.65+value*.25});
      if(onProgress) onProgress(phase,value);
      await new Promise(resolve=>setTimeout(resolve,0));
    });
    resized=null;
    if(!result.stats.inkPixels) throw Error('El resultado quedó vacío. Reduce tolerancia o limpieza y revisa el color elegido.');
    let outputDoc,im;
    try {
      outputDoc=await app.createDocument({name:'DTF · '+doc.name,width:p.width,height:p.height,
        resolution:sizing.OUTPUT_DPI,mode:constants.NewDocumentMode.RGB,fill:constants.DocumentFill.TRANSPARENT,depth:8,profile:PROFILE});
      await context.hostControl.registerAutoCloseDocument(outputDoc.id);
      const layer=outputDoc.layers[0]||await outputDoc.createPixelLayer();
      layer.name=`DTF ${n.shape} · ${n.lpi} LPI · ${n.angle}° · 300 ppp`;
      im=await imaging.createImageDataFromBuffer(result.data,{width:p.width,height:p.height,components:4,colorSpace:'RGB',colorProfile:PROFILE});
      await imaging.putPixels({documentID:outputDoc.id,layerID:layer.id,imageData:im,replace:true,targetBounds:{left:0,top:0}});
      approvedSizes.set(outputDoc.id,{width:p.width,height:p.height});
      await context.hostControl.unregisterAutoCloseDocument(outputDoc.id);
      context.reportProgress({value:1});
      return {documentID:outputDoc.id,stats:result.stats,dpi:sizing.OUTPUT_DPI,size:p};
    } finally {if(im) im.dispose();}
  },{commandName:'Crear Halftone DTF a 300 ppp'});
}
async function exportPNG(documentID,file,check=()=>{},expected=approvedSizes.get(documentID)) {
  return core.executeAsModal(async context=>{
    const doc=Array.from(app.documents).find(d=>d.id===documentID);
    if(!doc) throw Error('El documento DTF fue cerrado. Genera otro resultado.');
    if(doc.mode!==constants.DocumentMode.RGB || doc.bitsPerChannel!==constants.BitsPerChannelType.EIGHT || doc.resolution!==300) throw Error('El resultado debe seguir en RGB, 8 bits y 300 ppp. Vuelve a generarlo.');
    if(expected&&(doc.width!==expected.width||doc.height!==expected.height))throw Error('El tamaño cambió después de aprobarlo. Regenera desde el origen.');
    if(doc.width*doc.height>sizing.MAX_OUTPUT_PIXELS) throw Error('El resultado excede 128 megapíxeles.');
    let inkPixels=0;
    const exportRows=Math.max(1,Math.min(128,Math.floor(MAX_TILE_SOURCE_PIXELS/doc.width)));
    for(let top=0;top<doc.height;top+=exportRows) {
      check();
      if(context.isCancelled) throw cancelError('Exportación cancelada.');
      const src=await readRGBA(doc,undefined,{left:0,top,right:doc.width,bottom:Math.min(doc.height,top+exportRows)});
      for(let i=3;i<src.data.length;i+=4){if(src.data[i]!==0&&src.data[i]!==255)throw Error('Tus cambios introdujeron semitransparencias. Vuelve a tramar antes de exportar.');if(src.data[i]===255)inkPixels++;}
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(!inkPixels)throw Error('El resultado está vacío; no se guardó ningún PNG.');
    check();if(context.isCancelled)throw cancelError('Exportación cancelada.');if(file)await doc.saveAs.png(file,{},true);
    return {inkPixels,width:doc.width,height:doc.height,dpi:300};
  },{commandName:'Exportar PNG DTF'});
}
function sessionDocument(session) {
  if(session.closed)throw Error('La sesión DTF está cerrada.');
  const doc=Array.from(app.documents).find(d=>d.id===session.documentID);
  if(!doc)throw Error('El documento de trabajo fue cerrado. Vuelve a la preparación.');
  if(doc.width!==session.size.width||doc.height!==session.size.height||doc.resolution!==300||doc.mode!==constants.DocumentMode.RGB||doc.bitsPerChannel!==constants.BitsPerChannelType.EIGHT)
    throw Error('El documento de trabajo cambió de tamaño o modo. Vuelve a la preparación.');
  const layer=Array.from(doc.layers).find(l=>l.id===session.layerID);
  if(!layer)throw Error('La capa de trabajo fue eliminada. Vuelve a la preparación.');
  if(layer.visible===false||(layer.opacity!=null&&layer.opacity!==100)||(layer.blendMode!=null&&constants.BlendMode&&layer.blendMode!==constants.BlendMode.NORMAL))throw Error('La capa de trabajo fue modificada. Restablece visibilidad, opacidad 100% y mezcla Normal.');
  if(Array.from(doc.layers).some(l=>l.id!==session.layerID&&l.id!==session.workspaceLayerID))throw Error('El documento de trabajo tiene capas adicionales. Vuelve a preparar el original.');
  return {doc,layer};
}
function cropBuffer(data,width,crop) {
  const out=new Uint8Array(crop.width*crop.height*4);
  for(let y=0;y<crop.height;y++) {
    const start=((crop.top+y)*width+crop.left)*4;
    out.set(data.subarray(start,start+crop.width*4),y*crop.width*4);
  }
  return {data:out,width:crop.width,height:crop.height};
}
async function writeSession(session,result,options,check=()=>{}) {
  check();
  await core.executeAsModal(async context=>{
    check();if(context.isCancelled)throw cancelError('Actualización cancelada.');
    const {doc,layer}=sessionDocument(session);await assertLayerState(session);
    let im;
    try {
      im=await imaging.createImageDataFromBuffer(result.data,{width:session.size.width,height:session.size.height,components:4,colorSpace:'RGB',colorProfile:PROFILE});
      check();if(context.isCancelled)throw cancelError('Actualización cancelada.');
      await imaging.putPixels({documentID:doc.id,layerID:layer.id,imageData:im,replace:true,targetBounds:{left:0,top:0}});
      layer.name=`DTF ${options.shape||'round'} · ${options.lpi||35} LPI · ${options.angle==null?45:options.angle}° · 300 ppp`;
    } finally {if(im)im.dispose();}
  },{commandName:'Actualizar Halftone DTF'});
}
async function beginSession(source,options,onProgress=()=>{}) {
  const started=Date.now();
  if(options.trimArt&&!options.frame)options={...options,frame:await trimSourceBounds(source,options.documentID,options.layerID,onProgress)};
  if(![options.focusX==null?50:options.focusX,options.focusY==null?50:options.focusY].every(v=>Number.isFinite(v)&&v>=0&&v<=100))throw Error('Centro X/Y: usa porcentajes entre 0 y 100.');
  // Capture a pristine, resized source once. Slider jobs never read the output
  // document and never accumulate screening or resampling errors.
  const pinned=sourceDocument(source,options.documentID,options.layerID),planned=printPlan(pinned.doc,options);
  diagnostics.preflight(planned,options,options.diskBudgetGB||0);
  if(options.sourceWidth!=null&&(pinned.doc.width!==options.sourceWidth||pinned.doc.height!==options.sourceHeight))throw Error('El origen cambió de tamaño. Vuelve a seleccionar el documento.');
  if(planned.width*planned.height>tileEngine.RAM_PIXELS||options.memoryMode==='disk')return beginTiledSession(source,options,onProgress);
  const snapshot=await core.executeAsModal(async context=>{
    const {doc,layerID}=sourceDocument(source,options.documentID,options.layerID);
    const size=printPlan(doc,options);
    validate(Object.assign({},options,{dpi:300}));
    const data=new Uint8Array(size.width*size.height*4);
    const hook=async()=>{if(context.isCancelled)throw cancelError('Preparación cancelada.');await new Promise(r=>setTimeout(r,0));};
    for(let top=0;top<size.height;top+=128) {
      await hook();
      const crop={left:0,top,width:size.width,height:Math.min(128,size.height-top)};
      const strip=await readFinalCrop(doc,layerID,size,crop,hook);
      data.set(strip.data,top*size.width*4);onProgress('resize',(top+crop.height)/size.height);
      context.reportProgress({value:(top+crop.height)/size.height});
    }
    return {name:doc.name,size,data,sourceID:doc.id,sourceWidth:doc.width,sourceHeight:doc.height};
  },{commandName:'Preparar tamaño DTF'});
  if(options.protection==='selection')await captureProtection(snapshot);
  const result=await processRGBA(snapshot.data,snapshot.size.width,snapshot.size.height,Object.assign({},options,{dpi:300,originX:0,originY:0,protectMask:snapshot.protectStore?snapshot.protectStore.data:null}),async(phase,p)=>{
    onProgress(phase,p);await new Promise(r=>setTimeout(r,0));
  });
  const session=await core.executeAsModal(async context=>{
    onProgress('write',0);
    if(context.isCancelled)throw cancelError('Preparación cancelada.');
    const doc=await app.createDocument({name:'DTF · '+snapshot.name,width:snapshot.size.width,height:snapshot.size.height,
      resolution:300,mode:constants.NewDocumentMode.RGB,fill:constants.DocumentFill.TRANSPARENT,depth:8,profile:PROFILE});
    await context.hostControl.registerAutoCloseDocument(doc.id);
    const layer=doc.layers[0]||await doc.createPixelLayer();let im;
    try {
      im=await imaging.createImageDataFromBuffer(result.data,{width:snapshot.size.width,height:snapshot.size.height,components:4,colorSpace:'RGB',colorProfile:PROFILE});
      await imaging.putPixels({documentID:doc.id,layerID:layer.id,imageData:im,replace:true,targetBounds:{left:0,top:0}});
      onProgress('write',1);
      layer.name='DTF · edición en vivo · 300 ppp';
      approvedSizes.set(doc.id,{width:doc.width,height:doc.height});
      await context.hostControl.unregisterAutoCloseDocument(doc.id);
      return {documentID:doc.id,layerID:layer.id,size:snapshot.size,source:snapshot.data,sourceID:snapshot.sourceID,sourceWidth:snapshot.sourceWidth,sourceHeight:snapshot.sourceHeight,protectStore:snapshot.protectStore,stats:result.stats,closed:false,memoryMode:'ram'};
    }finally{if(im)im.dispose();}
  },{commandName:'Abrir edición Halftone DTF'});
  // The first stage transition already displays the processed result.
  const crop=cropAtFocus(session.size,{x:options.focusX==null?50:options.focusX,y:options.focusY==null?50:options.focusY});
  session.metrics={initialMs:Date.now()-started};
  session.preview={src:cropBuffer(session.source,session.size.width,crop),result:{...cropBuffer(result.data,session.size.width,crop),removedMask:tileEngine.cut(result.removedMask,session.size.width,crop,1),protectedMask:result.protectedMask?tileEngine.cut(result.protectedMask,session.size.width,crop,1):null},size:session.size,stats:result.stats,exact:true};
  return session;
}
async function updateSession(session,options,ctx,onPreview=()=>{}) {
  const started=Date.now();
  await workspace.wait(session);ctx.check();
  if(session.sourceStore)return updateTiledSession(session,options,ctx,onPreview);
  ctx.check();await assertLayerState(session);sessionDocument(session);
  const n=validate(Object.assign({},options,{dpi:300,originX:0,originY:0}));
  const crop=cropAtFocus(session.size,{x:options.focusX,y:options.focusY});
  const hook=async()=>{ctx.check();await new Promise(r=>setTimeout(r,0));ctx.check();};
  const detail=await detailCrop(session,crop,n,hook),src=detail.src;
  ctx.check();await onPreview({...detail,size:session.size,stats:detail.result.stats,exact:false},ctx);
  await ctx.pause(250);ctx.check();
  const result=await processRGBA(session.source,session.size.width,session.size.height,Object.assign({},n,{protectMask:session.protectStore?session.protectStore.data:null}),hook);
  ctx.check();await writeSession(session,result,n,ctx.check);ctx.check();
  session.stats=result.stats;session.overview=null;session.metrics={...session.metrics,updateMs:Date.now()-started};
  const cached={src,result:{...cropBuffer(result.data,session.size.width,crop),removedMask:tileEngine.cut(result.removedMask,session.size.width,crop,1),protectedMask:result.protectedMask?tileEngine.cut(result.protectedMask,session.size.width,crop,1):null},protectMask:detail.protectMask,size:session.size,stats:result.stats,exact:true};
  session.preview=cached;await onPreview(cached,ctx);ctx.check();
}
async function cancelSession(session) {
  if(session.closed)return;
  session.workspaceRevision=(session.workspaceRevision||0)+1;await workspace.wait(session);
  await core.executeAsModal(async()=>{
    const doc=Array.from(app.documents).find(d=>d.id===session.documentID);
    if(doc)doc.closeWithoutSaving();approvedSizes.delete(session.documentID);
  },{commandName:'Descartar sesión Halftone DTF'});
  await releaseSession(session);
}
async function releaseSession(session) {
  await workspace.clear(session);
  session.closed=true;session.source=null;session.preview=null;
  for(const id of ['sourceStore','protectStore'])if(session[id]){await discardStore(session[id],session);session[id]=null;}
}
async function discardStore(store,session){
  try{await store.dispose();}catch(e){if(session)session.cacheWarning='No se pudo eliminar una caché temporal: '+(e.message||e);}
}


async function readSelectionRGBA(doc,bounds) {
  let obj;
  try {
    obj=await imaging.getSelection({documentID:doc.id,sourceBounds:bounds});
    const im=obj.imageData;
    if(!im||!im.width||!im.height)return {data:new Uint8Array(0),width:0,height:0,bounds:{left:bounds.left,top:bounds.top}};
    if(im.components!==1)throw Error('Formato de selección inesperado.');
    const raw=await im.getData({chunky:true}),data=new Uint8Array(im.width*im.height*4);
    for(let p=0;p<raw.length;p++)data.set([255,255,255,raw[p]],p*4);
    return {data,width:im.width,height:im.height,bounds:obj.sourceBounds};
  }finally{if(obj&&obj.imageData)obj.imageData.dispose();}
}
async function captureProtection(session,check=()=>{}) {
  await workspace.wait(session);check();
  let store;
  try {
    await core.executeAsModal(async context=>{
      check();const {doc}=sourceDocument('composite',session.sourceID);
      if(doc.width!==session.sourceWidth||doc.height!==session.sourceHeight)throw Error('El origen cambió de tamaño. Vuelve a la preparación.');
      if(!doc.selection||!doc.selection.bounds)throw Error('Haz una selección en el documento original y pulsa Capturar selección.');
      store=session.sourceStore?await tileEngine.createDiskStore(session.size.width,session.size.height,1):new tileEngine.MemoryStore(session.size.width,session.size.height,1);
      for(const crop of tileEngine.tiles(session.size.width,session.size.height)){
        const hook=async()=>{check();if(context.isCancelled)throw cancelError('Selección cancelada.');await new Promise(r=>setTimeout(r,0));};
        await hook();const rgba=await readFinalCrop(doc,undefined,session.size,crop,hook,true),mask=new Uint8Array(crop.width*crop.height);
        for(let p=0;p<mask.length;p++)mask[p]=rgba.data[p*4+3];await store.put(crop,mask);
      }
    },{commandName:'Capturar protección de detalles'});
    const old=session.protectStore;session.protectStore=store;store=null;if(old)await old.dispose();
  }finally{if(store)await store.dispose();}
}
function hookFor(check=()=>{},onProgress=()=>{}) {
  return async(phase,p)=>{check();onProgress(phase,p);await new Promise(r=>setTimeout(r,0));check();};
}
async function tiledPreview(session,resultStore,stats,options){
  const crop=cropAtFocus(session.size,{x:options.focusX==null?50:options.focusX,y:options.focusY==null?50:options.focusY});
  const detail=await detailCrop(session,crop,options);const result=await resultStore.read(crop);result.removedMask=detail.result.removedMask;result.protectedMask=detail.result.protectedMask;
  return {src:detail.src,result,protectMask:detail.protectMask,size:session.size,stats,exact:true};
}
async function putStore(doc,layer,store,context,check=()=>{},onProgress=()=>{}){
  let first=true,done=0,total=Math.ceil(store.width/tileEngine.TILE_SIZE)*Math.ceil(store.height/tileEngine.TILE_SIZE);
  for(const crop of tileEngine.tiles(store.width,store.height)){
    check();if(context.isCancelled)throw cancelError('Escritura cancelada.');let im;
    try{
      const part=await store.read(crop);check();
      im=await imaging.createImageDataFromBuffer(part.data,{width:crop.width,height:crop.height,components:4,colorSpace:'RGB',colorProfile:PROFILE});
      await imaging.putPixels({documentID:doc.id,layerID:layer.id,imageData:im,replace:first,targetBounds:{left:crop.left,top:crop.top}});first=false;
      onProgress('write',++done/total);
    }finally{if(im)im.dispose();}
  }
  check();if(context.isCancelled)throw cancelError('Escritura cancelada.');
}
async function beginTiledSession(source,options,onProgress){
  let session,resultStore;
  try{
    session=await core.executeAsModal(async context=>{
      const {doc,layerID}=sourceDocument(source,options.documentID,options.layerID),size=printPlan(doc,options);
      validate(Object.assign({},options,{dpi:300}));
      const store=await tileEngine.createDiskStore(size.width,size.height);
      try{
        const list=Array.from(tileEngine.tiles(size.width,size.height));let done=0;
        for(const crop of list){
          const hook=hookFor(()=>{if(context.isCancelled)throw cancelError('Preparación cancelada.');});
          await hook();const part=await readFinalCrop(doc,layerID,size,crop,hook);await store.put(crop,part.data);
          onProgress('resize',++done/list.length);context.reportProgress({value:done/list.length});
        }
        return {sourceID:doc.id,sourceWidth:doc.width,sourceHeight:doc.height,name:doc.name,size,sourceStore:store,source:null,memoryMode:'disk',closed:false};
      }catch(e){await store.dispose();throw e;}
    },{commandName:'Preparar caché de imagen grande'});
    if(options.protection==='selection')await captureProtection(session);
    resultStore=await tileEngine.createDiskStore(session.size.width,session.size.height);
    session.stats=await tileEngine.processTiles(session.sourceStore,resultStore,Object.assign({},options,{dpi:300}),hookFor(()=>{},onProgress),session.protectStore);
    session.preview=await tiledPreview(session,resultStore,session.stats,options);
    await core.executeAsModal(async context=>{
      const doc=await app.createDocument({name:'DTF · '+session.name,width:session.size.width,height:session.size.height,resolution:300,mode:constants.NewDocumentMode.RGB,fill:constants.DocumentFill.TRANSPARENT,depth:8,profile:PROFILE});
      await context.hostControl.registerAutoCloseDocument(doc.id);
      const layer=doc.layers[0]||await doc.createPixelLayer();await putStore(doc,layer,resultStore,context,()=>{},onProgress);
      layer.name='DTF · edición por bloques · 300 ppp';session.documentID=doc.id;session.layerID=layer.id;
      approvedSizes.set(doc.id,{width:doc.width,height:doc.height});
      await context.hostControl.unregisterAutoCloseDocument(doc.id);
    },{commandName:'Abrir imagen grande DTF'});
    return session;
  }catch(e){if(session)await releaseSession(session);throw e;}
  finally{if(resultStore)await discardStore(resultStore,session);}
}
async function writeTiledSession(session,store,options,check){
  await core.executeAsModal(async context=>{
    check();const {doc,layer}=sessionDocument(session);await assertLayerState(session);
    const suspension=await context.hostControl.suspendHistory({documentID:doc.id,name:'Actualizar DTF por bloques'});let committed=false,newLayer;
    try{
      newLayer=await doc.createPixelLayer();newLayer.visible=false;
      await putStore(doc,newLayer,store,context,check);check();
      newLayer.name=`DTF ${options.shape} · ${options.lpi} LPI · ${options.angle}° · 300 ppp`;
      layer.delete();newLayer.visible=true;
      await context.hostControl.resumeHistory(suspension,true);committed=true;session.layerID=newLayer.id;
    }finally{if(!committed)await context.hostControl.resumeHistory(suspension,false);}
  },{commandName:'Actualizar imagen grande DTF'});
}
async function updateTiledSession(session,options,ctx,onPreview){
  const started=Date.now();
  ctx.check();await assertLayerState(session);sessionDocument(session);const n=validate(Object.assign({},options,{dpi:300}));
  const crop=cropAtFocus(session.size,{x:options.focusX,y:options.focusY}),detail=await detailCrop(session,crop,n,hookFor(ctx.check));
  ctx.check();await onPreview({...detail,size:session.size,stats:detail.result.stats,exact:false},ctx);await ctx.pause(250);ctx.check();
  const store=await tileEngine.createDiskStore(session.size.width,session.size.height);
  try{
    const stats=await tileEngine.processTiles(session.sourceStore,store,n,hookFor(ctx.check),session.protectStore);ctx.check();
    const cached=await tiledPreview(session,store,stats,options);ctx.check();
    await writeTiledSession(session,store,n,ctx.check);ctx.check();session.stats=stats;session.overview=null;session.metrics={...session.metrics,updateMs:Date.now()-started};session.preview=cached;
    await onPreview(cached,ctx);ctx.check();
  }finally{await discardStore(store,session);}
}
async function openBatchSource(file,options={}){
  return core.executeAsModal(async()=>{
    const existing=new Set(Array.from(app.documents).map(d=>d.id)),doc=await app.open(file);
    try{sourceDocument('composite',doc.id);}catch(e){
      if(!options.convertCopy){if(!existing.has(doc.id))doc.closeWithoutSaving();throw e;}
      let copy;try{copy=await doc.duplicate('DTF RGB · '+doc.name);await copy.changeMode(constants.ChangeMode.RGB);copy.bitsPerChannel=constants.BitsPerChannelType.EIGHT;sourceDocument('composite',copy.id);
        if(!existing.has(doc.id))doc.closeWithoutSaving();return {documentID:copy.id,width:copy.width,height:copy.height,dpi:copy.resolution,owned:true};
      }catch(error){if(copy)copy.closeWithoutSaving();if(!existing.has(doc.id))doc.closeWithoutSaving();throw error;}
    }
    return {documentID:doc.id,width:doc.width,height:doc.height,dpi:doc.resolution,owned:!existing.has(doc.id)};
  },{commandName:'Abrir origen del lote'});
}
async function closeBatchSource(source){
  if(!source.owned)return;
  await core.executeAsModal(async()=>{const doc=Array.from(app.documents).find(d=>d.id===source.documentID);if(doc)doc.closeWithoutSaving();},{commandName:'Cerrar origen del lote'});
}
module.exports={workspaceView:workspace.show,clearWorkspace:workspace.clear,info,convertCurrent,validateBatchOutput,overview,beginFromSnapshot,trimSourceBounds,preview,renderPreview,apply,exportPNG,beginSession,updateSession,cancelSession,releaseSession,captureProtection,openBatchSource,closeBatchSource};

async function convertCurrent(){
 return core.executeAsModal(async context=>{
  const original=app.activeDocument;if(!original)throw Error('Abre un documento.');let copy;
  try{copy=await original.duplicate('DTF RGB · '+original.name);await context.hostControl.registerAutoCloseDocument(copy.id);
   await copy.changeMode(constants.ChangeMode.RGB);copy.bitsPerChannel=constants.BitsPerChannelType.EIGHT;sourceDocument('composite',copy.id);
   await context.hostControl.unregisterAutoCloseDocument(copy.id);return info();
  }catch(e){throw e;}
 },{commandName:'Crear copia RGB/8 para DTF'});
}
async function validateBatchOutput(file,size,check=()=>{}){
 check();const source=await openBatchSource(file);try{return await exportPNG(source.documentID,null,check,size);}finally{await closeBatchSource(source);}
}
async function overview(session,check=()=>{}){
 await workspace.wait(session);check();if(session.overview)return session.overview;const {thumbnail}=require('./overview');
 const store=session.sourceStore||new tileEngine.MemoryStore(session.size.width,session.size.height,4,session.source);
 const src=await thumbnail(store,360,check),{doc,layer}=sessionDocument(session);
 const output={width:doc.width,height:doc.height,read:crop=>readRGBA(doc,layer.id,{left:crop.left,top:crop.top,right:crop.left+crop.width,bottom:crop.top+crop.height})};
 // Native bounds can be trimmed. Return an aligned RGBA tile for the sampler.
 const aligned={...output,read:async crop=>{const native=await output.read(crop),data=new Uint8Array(crop.width*crop.height*4);
  for(let y=0;y<native.height;y++){const dx=native.bounds.left-crop.left,dy=native.bounds.top-crop.top;data.set(native.data.subarray(y*native.width*4,(y+1)*native.width*4),((dy+y)*crop.width+dx)*4);}return {data,width:crop.width,height:crop.height};}};
 const result=await thumbnail(aligned,360,check);check();session.overview={src,result,size:session.size,stats:session.stats,exact:true,overview:true};return session.overview;
}
async function beginFromSnapshot(snapshot,options,onProgress=()=>{}){
 const session={...snapshot,source:null,sourceID:null,closed:false,memoryMode:'disk',name:'Proyecto DTF'},n=validate({...options,dpi:300});let store;
 try{
  store=await tileEngine.createDiskStore(session.size.width,session.size.height);
  session.stats=await tileEngine.processTiles(session.sourceStore,store,n,hookFor(()=>{},onProgress),session.protectStore);
  session.preview=await tiledPreview(session,store,session.stats,options);
  await core.executeAsModal(async context=>{
   onProgress('write',0);const doc=await app.createDocument({name:'DTF · Proyecto',width:session.size.width,height:session.size.height,resolution:300,mode:constants.NewDocumentMode.RGB,fill:constants.DocumentFill.TRANSPARENT,depth:8,profile:PROFILE});
   await context.hostControl.registerAutoCloseDocument(doc.id);const layer=doc.layers[0]||await doc.createPixelLayer();await putStore(doc,layer,store,context,()=>{},onProgress);
   session.documentID=doc.id;session.layerID=layer.id;approvedSizes.set(doc.id,{width:doc.width,height:doc.height});await context.hostControl.unregisterAutoCloseDocument(doc.id);
  },{commandName:'Reabrir proyecto DTF'});return session;
 }catch(e){await releaseSession(session);throw e;}finally{if(store)await discardStore(store,session);}
}
async function trimSourceBounds(source,documentID,layerID,progress=()=>{}){
 return core.executeAsModal(async context=>{
  const {doc,layerID:id}=sourceDocument(source,documentID,layerID);let left=doc.width,top=doc.height,right=0,bottom=0,done=0;
  const count=Math.ceil(doc.width/512)*Math.ceil(doc.height/512);
  for(const crop of tileEngine.tiles(doc.width,doc.height)){
   if(context.isCancelled)throw cancelError('Recorte cancelado.');progress('trim',done/count);
   const part=await readRGBA(doc,id,{left:crop.left,top:crop.top,right:crop.left+crop.width,bottom:crop.top+crop.height});
   for(let y=0;y<part.height;y++)for(let x=0;x<part.width;x++)if(part.data[(y*part.width+x)*4+3]){
    const xx=x+part.bounds.left,yy=y+part.bounds.top;left=Math.min(left,xx);top=Math.min(top,yy);right=Math.max(right,xx+1);bottom=Math.max(bottom,yy+1);
   }done++;await new Promise(r=>setTimeout(r,0));
  }if(right<=left||bottom<=top)throw Error('El origen está vacío.');return {left,top,width:right-left,height:bottom-top};
 },{commandName:'Medir arte sin márgenes transparentes'});
}

async function assertLayerState(session){
 const {doc,layer}=sessionDocument(session);
 if(action&&action.batchPlay){const [d]=await action.batchPlay([{_obj:'get',_target:[{_ref:'layer',_id:layer.id},{_ref:'document',_id:doc.id}]}],{});
 if(d.hasUserMask||d.hasVectorMask||d.layerEffects)throw Error('La capa de trabajo tiene máscara o efectos añadidos. Vuelve a preparar el original.');}
}

async function detailCrop(session,crop,options,hook){
 const bounds=tileEngine.expand(crop,session.size.width,session.size.height,tileEngine.haloFor({...options,dpi:300})),region={left:crop.left-bounds.left,top:crop.top-bounds.top,width:crop.width,height:crop.height};
 const store=session.sourceStore||new tileEngine.MemoryStore(session.size.width,session.size.height,4,session.source),part=await store.read(bounds),mask=session.protectStore?(await session.protectStore.read(bounds)).data:null;
 const processed=await processRGBA(part.data,bounds.width,bounds.height,{...options,dpi:300,originX:bounds.left,originY:bounds.top,protectMask:mask,statsRegion:region},hook);
 return {src:{data:tileEngine.cut(part.data,bounds.width,region),width:crop.width,height:crop.height},result:{...processed,data:tileEngine.cut(processed.data,bounds.width,region),removedMask:tileEngine.cut(processed.removedMask,bounds.width,region,1),protectedMask:processed.protectedMask?tileEngine.cut(processed.protectedMask,bounds.width,region,1):null,width:crop.width,height:crop.height},protectMask:mask?tileEngine.cut(mask,bounds.width,region,1):null};
}
