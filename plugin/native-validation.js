'use strict';
// Runs only on the user's real Photoshop host. It never touches existing artwork.
const {app,core,imaging,constants}=require('photoshop');
const host=require('./host'),{processRGBA}=require('./engine'),{checksum}=require('./project');
const PROFILE='sRGB IEC61966-2.1';
async function read(docID,layerID,w,h){
 let obj;try{
  const request={documentID:docID,sourceBounds:{left:0,top:0,right:w,bottom:h},colorSpace:'RGB',colorProfile:PROFILE,componentSize:8,applyAlpha:false};
  if(layerID!=null){if(!Number.isSafeInteger(layerID))throw Error('Identificador de capa inválido en validación.');request.layerID=layerID;}
  obj=await imaging.getPixels(request);
  if(obj.level!==0)throw Error('Lectura nativa con escala inesperada.');
  const im=obj.imageData,raw=await im.getData({chunky:true}),out=new Uint8Array(w*h*4),bounds=obj.sourceBounds;
  for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++){
   const i=(y*im.width+x)*im.components,j=((bounds.top+y)*w+bounds.left+x)*4;
   if(im.components===4)out.set(raw.subarray(i,i+4),j);else if(im.components===3)out.set([raw[i],raw[i+1],raw[i+2],255],j);else throw Error('Formato nativo inesperado.');
   if(!out[j+3])out.fill(0,j,j+4);
  }return out;
 }finally{if(obj?.imageData)obj.imageData.dispose();}
}
async function run(parent,check=()=>{},progress=()=>{}){
 const folder=await parent.createFolder('DTF-Prueba-Photoshop-'+Date.now()),report={schema:'halftone-native-validation',version:1,plugin:require('./manifest.json').version,photoshop:app.version,date:new Date().toISOString(),status:'running',checks:[]};
 let sourceID;const sessions=[];const w=640,h=160,data=new Uint8Array(w*h*4),options={knockout:false,cleanup:'none',lpi:35,angle:33,focusX:50,focusY:50};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=y<8||y>=h-8?0:Math.round(x/(w-1)*255);data.set([200,70,30,a],(y*w+x)*4);}
 try{
  check();progress('Creando carta sintética');
  await core.executeAsModal(async context=>{
   const doc=await app.createDocument({name:'Prueba DTF · temporal',width:w,height:h,resolution:300,mode:constants.NewDocumentMode.RGB,fill:constants.DocumentFill.TRANSPARENT,depth:8,profile:PROFILE});sourceID=doc.id;
   await context.hostControl.registerAutoCloseDocument(doc.id);let im;
   try{im=await imaging.createImageDataFromBuffer(data,{width:w,height:h,components:4,colorSpace:'RGB',colorProfile:PROFILE});await imaging.putPixels({documentID:doc.id,layerID:doc.layers[0].id,imageData:im,replace:true,targetBounds:{left:0,top:0}});check();await context.hostControl.unregisterAutoCloseDocument(doc.id);}finally{if(im)im.dispose();}
  },{commandName:'Carta sintética de validación DTF'});
  // Use actual captured native input to account for Photoshop's transparent RGB.
  const captured=await read(sourceID,undefined,w,h),expected=await processRGBA(captured,w,h,options);
  for(const memoryMode of ['auto','disk']){
   check();progress('Procesando '+memoryMode);const started=Date.now();
   const session=await host.beginSession('composite',{...options,documentID:sourceID,memoryMode},()=>check());sessions.push(session);
   const actual=await read(session.documentID,session.layerID,w,h);
   if(checksum(actual)!==checksum(expected.data))throw Error('Diferencia de píxeles nativos en modo '+memoryMode);
   report.checks.push({name:'RGBA '+memoryMode,status:'passed',ms:Date.now()-started,checksum:checksum(actual)});
   const file=await folder.createFile('prueba-'+memoryMode+'.png',{overwrite:false});await host.exportPNG(session.documentID,file,check,session.size);check();
   const verified=await host.validateBatchOutput(file,{width:w,height:h});report.checks.push({name:'PNG reabierto '+memoryMode,status:'passed',...verified});
  }
  const session=sessions[1],before=await read(session.documentID,session.layerID,w,h);
  progress('Comprobando rollback de historial');
  await core.executeAsModal(async context=>{
   check();const doc=Array.from(app.documents).find(d=>d.id===session.documentID),suspension=await context.hostControl.suspendHistory({documentID:doc.id,name:'Prueba rollback'});let im;
   try{const layer=await doc.createPixelLayer();layer.visible=false;im=await imaging.createImageDataFromBuffer(new Uint8Array([255,255,255,255]),{width:1,height:1,components:4,colorSpace:'RGB',colorProfile:PROFILE});await imaging.putPixels({documentID:doc.id,layerID:layer.id,imageData:im,replace:true,targetBounds:{left:513,top:20}});}
   finally{if(im)im.dispose();await context.hostControl.resumeHistory(suspension,false);}
  },{commandName:'Verificar rollback DTF'});
  check();if(checksum(before)!==checksum(await read(session.documentID,session.layerID,w,h)))throw Error('Rollback cambió los píxeles.');
  report.checks.push({name:'Rollback nativo',status:'passed'});report.status='passed';
 }catch(e){report.status=e.cancelled?'cancelled':'failed';report.error=e.message||String(e);}
 finally{
  for(const session of sessions)try{await host.cancelSession(session);}catch(e){report.status='failed';report.cleanupError=e.message;}
  if(sourceID)try{await core.executeAsModal(async()=>{const doc=Array.from(app.documents).find(d=>d.id===sourceID);if(doc)doc.closeWithoutSaving();},{commandName:'Cerrar carta de prueba DTF'});}catch(e){report.status='failed';report.cleanupError=e.message;}
 }
 const file=await folder.createFile('validacion-photoshop.json',{overwrite:false});await file.write(JSON.stringify(report,null,2));return {folder,report};
}
module.exports={run};
