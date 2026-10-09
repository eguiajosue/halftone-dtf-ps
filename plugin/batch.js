'use strict';
const sizing=require('./sizing'),recipes=require('./recipes'),diagnostics=require('./diagnostics');
const {validate}=require('./engine');
const VERSION='0.5.0';
function cancelled(){const e=Error('Lote detenido.');e.cancelled=true;return e;}
function checkToken(token){if(token.cancelled)throw cancelled();}
function variantPlan(width,height,placement,size,areas,garment='adult'){
 const a=sizing.garmentArea(placement,size,garment,areas&&areas[size]);
 if(!Array.isArray(a)||a.length!==2||!a.every(v=>Number.isFinite(v)&&v>0&&v<=100))throw Error('Área por talla: usa medidas de más de 0 y hasta 100 cm.');
 return sizing.plan(width,height,300,{widthCM:width*Math.min(a[0]/width,a[1]/height),sizeAxis:'width'});
}
function safeName(name){return name.replace(/\.[^.]+$/,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,80)||'imagen';}
function outputName(file,index,size,placement){return String(index+1).padStart(3,'0')+'_'+safeName(file.name)+'_'+size+'_'+placement+'_300ppp.png';}
function csv(rows){
 const fields=['image','size','placement','status','output','widthCM','heightCM','widthPX','heightPX','dpi','error'];
 const quote=v=>{let s=String(v==null?'':v);if(typeof v==='string'&&/^[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 return '\ufeff'+fields.join(',')+'\r\n'+rows.map(row=>fields.map(k=>quote(row[k])).join(',')).join('\r\n');
}
async function entry(folder,name){if(folder.getEntry)return folder.getEntry(name);const e=(await folder.getEntries()).find(e=>e.name===name);if(!e)throw Error('Archivo no encontrado: '+name);return e;}
async function createRunFolder(parent){
 const base='DTF-'+new Date().toISOString().replace(/[:.]/g,'-');
 for(let n=0;n<100;n++)try{return await parent.createFolder(base+(n?'-'+n:''));}catch(e){if(!(await parent.getEntries()).some(f=>f.name===base+(n?'-'+n:'')))throw e;}
 throw Error('No se pudo crear una carpeta nueva para el lote.');
}
async function identity(file){const m=file.getMetadata?await file.getMetadata():{};return {name:file.name,size:m.size==null?null:m.size,modified:m.dateModified?new Date(m.dateModified).toISOString():null};}
function sameIdentity(a,b){return a.name===b.name&&(a.size==null||a.size===b.size)&&(a.modified==null||a.modified===b.modified);}
function makeRows(files,sizes,placement,areas,options,assignments){
 const rows=[];for(let i=0;i<files.length;i++){
  const config=assignments&&assignments[i]||{},g=config.garment||options.garment||'adult';
  const ss=Array.from(new Set(config.sizes||sizes)),pp=Array.from(new Set(config.placements||[placement]));
  for(const size of ss)for(const position of pp){
   const aa=config.areas?.[position]||areas,recipe=recipes.options({...options,...config.overrides,garment:g});
   if(recipe.protection==='selection')throw Error('En lotes usa protección automática o desactivada.');variantPlan(1,1,position,size,aa,g);
   rows.push({id:rows.length,index:i,image:files[i].name,size,placement:position,garment:g,areas:aa||null,recipe,status:'pending',output:size+'/'+outputName(files[i],i,size,position),dpi:300});
  }
 }if(!rows.length||rows.length>20000)throw Error('Selecciona de 1 a 20000 variantes.');return rows;
}
async function writeNew(folder,name,data){const f=await folder.createFile(name,{overwrite:false});await f.write(data);return f;}
async function readJSON(file,max=8e6){if(file.getMetadata&&(await file.getMetadata()).size>max)throw Error('Registro demasiado grande.');const text=await file.read();if(text.length>max)throw Error('Registro demasiado grande.');return JSON.parse(text);}
async function loadRun(folder){
 const job=await readJSON(await entry(folder,'trabajo.json'),64e6);
 if(job.schema!=='halftone-batch'||job.version!==1||!Array.isArray(job.rows)||!job.rows.length||job.rows.length>20000||!Array.isArray(job.sources)||job.sources.length>500)throw Error('Formato de lote inválido.');
 for(let i=0;i<job.rows.length;i++){
  const row=job.rows[i];if(row.id!==i||!Number.isInteger(row.index)||row.index<0||row.index>=job.sources.length)throw Error('Índice de lote inválido.');
  row.recipe=recipes.options(row.recipe);variantPlan(1,1,row.placement,row.size,row.areas,row.garment);
  if(row.output!==row.size+'/'+outputName({name:row.image},row.index,row.size,row.placement))throw Error('Nombre de salida inválido.');
 }
 const state=await entry(folder,'avance'),logs=(await state.getEntries()).filter(f=>/^\d{8}\.json$/.test(f.name)).sort((a,b)=>a.name.localeCompare(b.name));let sequence=0,warning=null;
 for(const log of logs){sequence=Math.max(sequence,Number(log.name.slice(0,8)));try{
  const r=await readJSON(log,16000),row=job.rows[r.id];if(!row||!['pending','done','error','cancelled'].includes(r.status))throw Error('Registro inválido.');
  const base=outputName({name:row.image},row.index,row.size,row.placement),filename=r.output?.split('/');
  if(filename&&(filename.length!==2||filename[0]!==row.size||!(filename[1]===base||filename[1].startsWith(base.slice(0,-4)+'_r')&&/^\d+\.png$/.test(filename[1].slice(base.length-2)))))throw Error('Ruta inválida.');
  for(const key of ['widthPX','heightPX'])if(r[key]!=null&&(!Number.isInteger(r[key])||r[key]<1||r[key]>300000))throw Error('Dimensión de avance inválida.');
  if(r.widthPX&&r.heightPX&&r.widthPX*r.heightPX>sizing.MAX_OUTPUT_PIXELS)throw Error('Resultado demasiado grande.');
  for(const key of ['status','output','widthCM','heightCM','widthPX','heightPX','error'])if(r[key]!=null)row[key]=r[key];
 }catch(e){warning='Hay un registro incompleto; se verificarán las salidas antes de continuar.';}}
 return {folder,job,state,sequence,warning};
}
async function checkpoint(run,row){const data={};for(const k of ['id','status','output','widthCM','heightCM','widthPX','heightPX','error'])if(row[k]!=null)data[k]=row[k];await writeNew(run.state,String(++run.sequence).padStart(8,'0')+'.json',JSON.stringify(data));}
async function preflightBatch({files,sizes,placement,areas,options,assignments,host,token={cancelled:false},onProgress=()=>{}}){
 const rows=makeRows(files,sizes,placement,areas,options,assignments),results=[];
 for(let i=0;i<files.length;i++){
  if(!rows.some(r=>r.index===i))continue;checkToken(token);let source;
  try{source=await host.openBatchSource(files[i],rows.find(r=>r.index===i).recipe);for(const row of rows.filter(r=>r.index===i)){
   checkToken(token);try{const frame=row.recipe.trimArt&&host.trimSourceBounds?await host.trimSourceBounds('composite',source.documentID,null,()=>checkToken(token)):null;
    const p=variantPlan(frame?.width||source.width,frame?.height||source.height,row.placement,row.size,row.areas,row.garment);p.upscaled=p.width>source.width||p.height>source.height;
    const check=diagnostics.preflight(p,row.recipe,options.diskBudgetGB||0);results.push({...row,...p,resources:check.resources,warnings:check.messages,status:'ready'});
   }catch(e){if(e.cancelled)throw e;results.push({...row,status:'error',error:e.message});}
  }}catch(e){if(e.cancelled)throw e;for(const row of rows.filter(r=>r.index===i))results.push({...row,status:'error',error:e.message});}
  finally{if(source)await host.closeBatchSource(source);}onProgress({done:i+1,total:files.length,message:'Verificado '+files[i].name});
 }return results;
}
async function runBatch({files,folder,sizes=['M','L'],placement='front',areas,options={},assignments,token={cancelled:false},onProgress=()=>{},host,resume,bindSources}){
 if(!Array.isArray(files)||!files.length||files.length>500)throw Error('Selecciona de 1 a 500 imágenes.');if(!sizes.length&&!assignments&&!resume)throw Error('Selecciona al menos una talla.');
 validate({...options,dpi:300});if(options.protection==='selection')throw Error('En lotes usa protección automática o desactivada.');let run=resume;checkToken(token);
 if(!run){
  const rows=makeRows(files,sizes,placement,areas,options,assignments),sources=[];for(const file of files)sources.push(await identity(file));
  const output=await createRunFolder(folder),state=await output.createFolder('avance');run={folder:output,state,sequence:0,job:{schema:'halftone-batch',version:1,plugin:VERSION,createdAt:new Date().toISOString(),sources,rows}};
  run.folders={};for(const size of new Set(rows.map(r=>r.size)))run.folders[size]=await output.createFolder(size);await writeNew(output,'trabajo.json',JSON.stringify(run.job));if(bindSources)await bindSources(output,files);
 }else{
  if(files.length!==run.job.sources.length)throw Error('Selecciona todos los originales del trabajo en el mismo orden.');
  for(let i=0;i<files.length;i++)if(!sameIdentity(run.job.sources[i],await identity(files[i])))throw Error('El original cambió o no coincide: '+run.job.sources[i].name);
 }
 const rows=run.job.rows,warnings=run.warning?[run.warning]:[];let done=0,fatal=null;const folders={};for(const size of new Set(rows.map(r=>r.size)))folders[size]=run.folders?.[size]||await entry(run.folder,size);
 try{for(let i=0;i<files.length;i++){
  checkToken(token);let source;const selected=rows.filter(r=>r.index===i);
  for(const row of selected){
   checkToken(token);
   const existing=(await folders[row.size].getEntries()).find(f=>f.name===row.output.split('/')[1]);
   if(existing&&host.validateBatchOutput&&row.widthPX&&row.heightPX){try{
    await host.validateBatchOutput(existing,{width:row.widthPX,height:row.heightPX},()=>checkToken(token));checkToken(token);row.status='done';delete row.error;await checkpoint(run,row);done++;continue;
   }catch(e){if(e.cancelled)throw e;}}
   else if(row.status==='done'&&!host.validateBatchOutput){done++;continue;}row.status='pending';delete row.error;
  }
  const pending=selected.filter(r=>r.status!=='done');if(!pending.length)continue;
  try{source=await host.openBatchSource(files[i],pending[0].recipe);}catch(e){
   if(e.cancelled){token.cancelled=true;throw e;}for(const row of pending){row.status='error';row.error=e.message||String(e);await checkpoint(run,row);done++;}onProgress({done,total:rows.length,message:files[i].name+': '+e.message});continue;
  }
  try{for(const row of pending){
   checkToken(token);let session,file;
   try{
    const frame=row.recipe.trimArt&&host.trimSourceBounds?await host.trimSourceBounds('composite',source.documentID,null,(phase,value)=>{checkToken(token);onProgress({done,total:rows.length,phase,value,message:'Midiendo '+row.image});}):null;
    const p=variantPlan(frame?.width||source.width,frame?.height||source.height,row.placement,row.size,row.areas,row.garment);Object.assign(row,{widthCM:p.widthCM,heightCM:p.heightCM,widthPX:p.width,heightPX:p.height});
    const o={...row.recipe,frame,documentID:source.documentID,widthCM:p.requestedWidthCM,heightCM:p.requestedHeightCM,sizeAxis:'width',focusX:50,focusY:50};
    session=await host.beginSession('composite',o,(phase,value)=>{checkToken(token);onProgress({done,total:rows.length,image:files[i].name,size:row.size,phase,value,message:`${done+1}/${rows.length} · ${files[i].name} · ${row.size} · ${row.placement}`});});
    checkToken(token);if(!session.stats.inkPixels)throw Error('El resultado quedó vacío. Ajusta knockout/niveles y repite.');
    if(session.size)Object.assign(row,{widthCM:session.size.widthCM,heightCM:session.size.heightCM,widthPX:session.size.width,heightPX:session.size.height});
    let basename=outputName(files[i],i,row.size,row.placement),attempt=1;const names=new Set((await folders[row.size].getEntries()).map(f=>f.name));
    while(names.has(basename))basename=outputName(files[i],i,row.size,row.placement).replace('.png','_r'+(++attempt)+'.png');
    row.output=row.size+'/'+basename;await checkpoint(run,row);
    file=await folders[row.size].createFile(basename,{overwrite:false});await host.exportPNG(session.documentID,file,()=>checkToken(token),session.size);row.status='done';
   }catch(e){row.status=e.cancelled?'cancelled':'error';row.error=e.message||String(e);if(file)try{await file.delete();}catch(_){}if(e.cancelled)token.cancelled=true;}
   finally{if(session){await host.cancelSession(session);if(session.cacheWarning)throw Error(session.cacheWarning);}}
   await checkpoint(run,row);done++;onProgress({done,total:rows.length,message:`${done}/${rows.length} · ${row.status==='done'?'Guardado':'Error'} · ${row.image} · ${row.size}`});checkToken(token);
  }}finally{await host.closeBatchSource(source);}
 }}catch(e){fatal=e;if(e.cancelled)token.cancelled=true;}
 for(const row of rows)if(row.status==='pending'){row.status=token.cancelled?'cancelled':'error';row.error=fatal?fatal.message:'Trabajo interrumpido.';}
 const report={version:VERSION,createdAt:new Date().toISOString(),cancelled:token.cancelled,rows,fatal:fatal?fatal.message:null};
 for(const [name,data]of [['reporte.csv',csv(rows)],['ajustes-y-resultados.json',JSON.stringify(report,null,2)]])try{
  const suffix=resume?'-'+Date.now():'';await writeNew(run.folder,name.replace(/(\.[^.]+)$/,suffix+'$1'),data);
 }catch(e){warnings.push('No se pudo escribir '+name+': '+e.message);}
 return {folder:run.folder,run,rows,done:rows.filter(r=>r.status==='done').length,errors:rows.filter(r=>r.status==='error').length,cancelled:rows.filter(r=>r.status==='cancelled').length,fatal:report.fatal,warnings};
}
module.exports={variantPlan,safeName,outputName,csv,runBatch,preflightBatch,loadRun,entry,identity,makeRows};
