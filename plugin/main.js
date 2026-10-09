'use strict';
const {entrypoints,storage}=require('uxp');
const host=require('./host');
const {LEVELS,hexRGB,validate}=require('./engine');
const {LiveController}=require('./live');
const sizing=require('./sizing');
const batch=require('./batch');
const {runBatch}=batch;
const recipesAPI=require('./recipes'),projects=require('./project'),diagnostics=require('./diagnostics');
const $=id=>document.getElementById(id);
const levels={inputBlack:7,inputMidtone:2,inputWhite:100,outputBlack:0,outputWhite:255};
const numeric=['alphaThreshold','shadowBoost','colorBoost','defringeRadius','defringeStrength','edgeContrast','edgeRadius','mockupChestCM','mockupHeightCM','mockupX','mockupY','diskBudgetGB','tolerance','softness','lpi','angle','minDiameterMM','focusX','focusY','widthCM','heightCM','comparePosition',...Object.keys(levels)];
const checks=['knockout','recover','linkBackground','halftone','defringe','trimArt','convertCopy'];
const settingIDs=['source','key',...checks,...numeric,'shape','cleanup','viewMode','previewColor','sizeAxis','placement','shirtSize','memoryMode','protection','units','garment','previewScope'];
const colorIDs=['key','knockout','tolerance','softness'];
let busy=false,stage='prepare',previewCache=null,outputID=null,sourceInfo=null,session=null,live=null,paintRevision=0;
let batchFiles=[],batchFolder=null,batchToken=null,batchReturnStage='prepare';
const batchSharedIDs=['key','knockout','tolerance','softness','shape','lpi','angle','cleanup','halftone','alphaThreshold','recover','defringe','shadowBoost','colorBoost','defringeRadius','defringeStrength','edgeContrast','edgeRadius','minDiameterMM',...Object.keys(levels)];
let previewPixels=512;
let approvedResult=null;
let initialToken=null,recipeList=[],profileAreas={},lastProject=null,assignments={},resumeRun=null,preflightResult=null;
let displayUnit='cm',canonicalSize=null;
let updateUI=null;
let controlsBusy=null,viewTimer=null;
const allSizes=[...sizing.SIZES,...sizing.CHILD_SIZES];
function settings() {
  const o={};for(const id of settingIDs)o[id]=checks.includes(id)?$(id).checked:numeric.includes(id)?($(id).value===''?NaN:Number($(id).value)):$(id).value;
  o.key=o.key.trim();o.previewColor=o.previewColor.trim();
  if(canonicalSize){o.widthCM=canonicalSize.widthCM;o.heightCM=canonicalSize.heightCM;}
  else{if(o.units==='in'){o.widthCM*=2.54;o.heightCM*=2.54;}}
  if(sourceInfo){o.documentID=sourceInfo.documentID;o.layerID=sourceInfo.layerID;o.sourceWidth=sourceInfo.width;o.sourceHeight=sourceInfo.height;}return o;
}
function status(message){$('status').textContent=message;}
function save(){try{localStorage.setItem('halftone-dtf-settings-v5',JSON.stringify(settings()));}catch(_) {}}
function syncColor(){for(const id of colorIDs){if(id==='knockout')$(id+'Edit').checked=$(id).checked;else $(id+'Edit').value=$(id).value;}syncSwatches();}
function syncSwatches(){try{hexRGB($('key').value);$('foreground').style.borderLeftColor=$('key').value;$('foregroundEdit').style.borderLeftColor=$('key').value;const bg=$('linkBackground').checked?$('key').value:$('previewColor').value;hexRGB(bg);$('pickBackground').style.borderLeftColor=bg;}catch(_){} }
function syncScreen(){for(const id of ['lpi','angle','shape'])$(id+'Edit').value=$(id).value;$('halftoneEdit').checked=$('halftone').checked;}
function syncSliders(){for(const id of [...Object.keys(levels),'shadowBoost','colorBoost'])$(id+'Slider').value=Number($(id).value);}
function ensureEditDefaults(){
  if(!['original','garment','beforeGarment','compare','transparent','mask','removed','protection'].includes($('viewMode').value))$('viewMode').value='garment';
  try{hexRGB($('previewColor').value);}catch(_){$('previewColor').value='#202020';}
  try{
    const o=settings();validate(Object.assign({},o,{key:'#000000',tolerance:2,softness:35}));
    if(![o.focusX,o.focusY].every(v=>Number.isFinite(v)&&v>=0&&v<=100))throw Error('Centro inválido.');
  }catch(_){
    // Invalid hidden editing fields must never trap the user in stage 1 after
    // Cancel or a restart. Stage-1 color errors remain visible and editable.
    for(const [id,value]of Object.entries(Object.assign({},levels,{shape:'round',lpi:30,angle:33,cleanup:'standard',minDiameterMM:.20,focusX:50,focusY:50,alphaThreshold:128,shadowBoost:0,colorBoost:0,defringeRadius:2,defringeStrength:100,edgeContrast:96,edgeRadius:1})))$(id).value=value;
    $('recover').checked=false;$('defringe').checked=false;$('halftone').checked=true;$('protection').value='off';syncSliders();
  }
}
function load(){
  try{
    const o=JSON.parse(localStorage.getItem('halftone-dtf-settings-v5')||localStorage.getItem('halftone-dtf-settings-v4')||localStorage.getItem('halftone-dtf-settings-v3')||localStorage.getItem('halftone-dtf-settings-v2')||'{}');
    for(const id of settingIDs)if(o[id]!=null){if(checks.includes(id))$(id).checked=Boolean(o[id]);else $(id).value=o[id];}
    syncGarmentOptions(o.shirtSize);
  }catch(_){status('Preferencias reiniciadas.');}
  displayUnit=$('units').value;
  if(displayUnit==='in'){canonicalSize={widthCM:Number($('widthCM').value),heightCM:Number($('heightCM').value)};$('widthCM').value=(canonicalSize.widthCM/2.54).toFixed(6);$('heightCM').value=(canonicalSize.heightCM/2.54).toFixed(6);}
  syncColor();syncSliders();syncScreen();$('compareSlider').value=Number($('comparePosition').value);
}
function controls(){
  if(controlsBusy!==busy){
    const controlElements=Array.from(document.querySelectorAll('input,select,button,sp-slider'));
    for(const el of controlElements)el.disabled=busy;controlsBusy=busy;
  }
  syncCleanup();
  $('next').disabled=busy||!sourceInfo;$('apply').disabled=busy||!session;
  $('export').disabled=busy||outputID===null;$('previewColor').disabled=busy||$('linkBackground').checked;
  $('batchRun').disabled=busy||!batchFiles.length||!batchFolder;
  $('batchCancel').disabled=!batchToken||batchToken.cancelled;
  $('cancelPreparation').disabled=!initialToken||initialToken.cancelled;$('cancelPreparation').className=initialToken?'':'hidden';
  $('lpi').disabled=busy||!$('halftone').checked;$('angle').disabled=busy||!$('halftone').checked;$('shape').disabled=busy||!$('halftone').checked;$('alphaThreshold').disabled=busy||$('halftone').checked;
  $('minDiameterMM').disabled=busy||$('cleanup').value==='none';
  $('saveProject').disabled=busy||!session;$('reopenLastProject').disabled=busy||!lastProject;
  $('captureSelection').disabled=busy||!session||session.sourceID==null;
  for(const id of ['lpiEdit','angleEdit','shapeEdit'])$(id).disabled=busy||!$('halftone').checked;
  $('widthCM').disabled=busy||$('sizeMode').value==='preset';$('heightCM').disabled=busy||$('sizeMode').value==='preset';
  if(updateUI)updateUI.sync(busy);
}
function showStage(next){
  stage=next;for(const [name,id]of [['prepare','stepPrepare'],['edit','stepEdit'],['result','stepResult']])$(id).className=next===name?'current':'';
  for(const id of ['prepare','edit','result','batch'])$(id+'Stage').className=id===next?'':'hidden';
  $('stageBadge').textContent={prepare:'Preparar',edit:'Ajustar',result:'Exportar',batch:'Lotes'}[next];
  $('stepLabel').textContent={prepare:'1 · Preparar impresión',edit:'2 · Editar semitonos',result:'Resultado · listo para exportar',batch:'Lotes · imágenes × tallas'}[next];controls();
}
async function action(fn){
  if(busy)return;busy=true;controls();
  try{await fn();save();}catch(e){status(e.message||String(e));}
  finally{busy=false;controls();}
}
function syncSize(axis,cm){
  if(!sourceInfo)throw Error('Primero selecciona el documento de origen.');
  canonicalSize={...(canonicalSize||{}),[axis+'CM']:cm};
  const p=sizing.proportional(sourceInfo.width,sourceInfo.height,axis,cm);canonicalSize=p;
  $(axis==='width'?'heightCM':'widthCM').value=fromCM(axis==='width'?p.heightCM:p.widthCM).toFixed(6);
  $('sizeAxis').value=axis;updateSizeInfo();
}
function updateSizeInfo(){
  if(!sourceInfo)return;
  const p=sizing.plan(sourceInfo.width,sourceInfo.height,sourceInfo.dpi,settings());
  $('pixelInfo').textContent=`${p.widthCM.toFixed(2)} × ${p.heightCM.toFixed(2)} cm · ${p.width} × ${p.height} px · 300 ppp`;
  const resources=diagnostics.preflight(p,settings(),settings().diskBudgetGB).resources;
  $('resourceInfo').textContent=`${resources.megapixels.toFixed(1)} MP · ${resources.disk?'caché en disco':'memoria RAM'} · disco estimado ${(resources.recommendedDiskBytes/1e9).toFixed(2)} GB + scratch de Photoshop`;
  $('upscaleInfo').textContent=p.upscaled?'Se ampliará el origen. El remuestreo no recupera detalle perdido.':'El tamaño se prepara antes de tramar.';
}
function adoptSource(){
  const next=host.info();sourceInfo=next;
  $('sourceInfo').textContent=`${next.name} · ${next.width} × ${next.height} px · ${next.dpi} ppp de origen`;
  if(!Number.isFinite(Number($('widthCM').value))||Number($('widthCM').value)<=0)$('widthCM').value=fromCM(next.widthCM).toFixed(6);
  syncSize('width',toCM(Number($('widthCM').value)));controls();save();status('Define el tamaño final y el color a eliminar.');
}
function summary(result){return `${result.size.widthCM.toFixed(2)} × ${result.size.heightCM.toFixed(2)} cm · 300 ppp · cobertura ${result.stats.coveragePercent.toFixed(1)}%.`;}
function viewLabel(mode){return {original:'ORIGINAL · sin knockout ni trama · clic para tomar color',garment:'DESPUÉS · resultado sobre la prenda',beforeGarment:'ANTES · original sobre la misma prenda',compare:'COMPARACIÓN · izquierda antes / derecha después · misma prenda',transparent:'TRAMA · transparencia representada con cuadrícula',mask:'MÁSCARA · blanco imprime · negro transparente',removed:'ELIMINADO · partículas retiradas por limpieza',protection:'PROTECCIÓN · píxeles que conservan color sólido'}[mode];}
async function paint(value,ctx){
  const {workspaceResultStore,...cached}=value;
  if(ctx)ctx.check();previewCache=cached;
  const revision=++paintRevision,o=settings();
  const guard=()=>{if(ctx)ctx.check();if(revision!==paintRevision||stage!=='edit'){const e=Error('Vista reemplazada.');e.superseded=true;throw e;}};hexRGB(o.key);if(!o.linkBackground)hexRGB(o.previewColor);
  const inspecting=$('inspectorPanel').className!=='hidden';let display=cached,image;
  if(inspecting){
    if(cached.exact&&o.previewScope!=='detail'&&!['removed','protection'].includes(o.viewMode)&&host.overview){display=await host.overview(session,guard);}
    image=await host.renderPreview({...display,mockup:o.previewScope==='mockup'&&['original','beforeGarment','garment','compare'].includes(o.viewMode)},o.viewMode,o);
  }
  if(cached.exact&&host.workspaceView){try{await host.workspaceView(session,o.viewMode,o,guard,workspaceResultStore);}catch(e){if(e.superseded)return;throw e;}}
  if(revision!==paintRevision||stage!=='edit'||(ctx&&!ctx.current()))return;
  if(image)$('previewImage').src=image;previewPixels=o.previewScope==='mockup'&&['original','beforeGarment','garment','compare'].includes(o.viewMode)?420:display.src.width;
  $('previewImage').style.width=$('previewZoom').value==='fit'?'100%':(previewPixels*Number($('previewZoom').value)/100)+'px';
  $('compareControls').className=o.viewMode==='compare'?'level':'level hidden';
  $('mockupControls').className=o.previewScope==='mockup'?'':'hidden';
  $('qualityWarnings').textContent=diagnostics.warnings(o,cached.stats).join(' ');
  $('viewLabel').textContent=viewLabel(o.viewMode);
  syncViews();
  if(cached.exact)status('Resultado completo actualizado. '+summary(cached));
  else status('Detalle actualizado; calculando el lienzo completo…');
}
function scheduleView(){
  // Coalesce divider drags and invalidate a pending full-canvas presentation now.
  paintRevision++;clearTimeout(viewTimer);
  viewTimer=setTimeout(()=>{
    viewTimer=null;
    if(stage==='edit'&&!busy&&previewCache)paint(previewCache).catch(e=>{if(!e.superseded)status(e.message);});
  },80);
}
function queue(){
  save();controls();if(!live||!session||stage!=='edit'||busy)return;
  paintRevision++;live.request(settings());$('liveState').textContent='Actualizando automáticamente…';
}
function createLive(){
  live=new LiveController((o,ctx)=>host.updateSession(session,{...o,detailPreview:$('inspectorPanel').className!=='hidden'},ctx,paint),{
    onError:e=>{if(stage==='edit')status('Corrige el ajuste o vuelve a intentarlo: '+(e.message||e));},
    onState:s=>{if(stage==='edit')$('liveState').textContent={working:'Procesando · puedes seguir ajustando',idle:'Vista y lienzo sincronizados',error:'No se pudo completar la última actualización'}[s];}
  });
}
async function discard(){
  if(live)await live.dispose();live=null;paintRevision++;
  try{if(session)await host.cancelSession(session);}catch(e){createLive();throw e;}
  const cacheWarning=session&&session.cacheWarning;session=null;previewCache=null;$('previewImage').src='';
  showStage('prepare');status('La copia de trabajo se descartó. Puedes cambiar tamaño y color.'+(cacheWarning?' '+cacheWarning:''));
}
async function foreground(){
  await action(async()=>{
    if(live)await live.flush();
    const mode=$('viewMode').value;
    if(session&&host.workspaceView)await host.workspaceView(session,'original',settings());
    try{const key=await require('./color-picker').pickColor($('key').value);if(key){$('key').value=key;syncColor();save();}}
    finally{if(session){if(live){live.request(settings());await live.flush();}else if(host.workspaceView)await host.workspaceView(session,mode,settings());}}
  });
}
function batchSizes(){return ($('garment').value==='child'?sizing.CHILD_SIZES:sizing.SIZES).filter(size=>$('batch'+size).checked);}
function batchAreas(){const areas={};for(const size of batchSizes())areas[size]=[Number($('batchWidth'+size).value),Number($('batchHeight'+size).value)];return areas;}
function batchInfo(){
  preflightResult=null;const sizes=batchSizes();$('batchCount').textContent=`${batchFiles.length} imágenes · ${sizes.length} tallas · ${batchFiles.length*sizes.length} resultados`;
  try{const count=batchFiles.length?batch.makeRows(batchFiles,sizes,$('batchPlacement').value,batchAreas(),settings(),batchAssignments()).length:0;$('batchCount').textContent=`${batchFiles.length} imágenes · ${sizes.length} tallas · ${count} resultados`;}catch(e){$('batchCount').textContent=e.message;}
  const o=settings();$('batchSettingsInfo').textContent=`Niveles: ${o.inputBlack} / ${o.inputMidtone} / ${o.inputWhite} · salida ${o.outputBlack} / ${o.outputWhite} · diámetro ${o.minDiameterMM} mm · recuperación de color ${o.recover?'activada':'desactivada'}.`;
}
function batchAreaDefaults(){for(const size of allSizes){const child=sizing.CHILD_SIZES.includes(size),active=child===($('garment').value==='child');$('batchRow'+size).className=active?'size-row':'size-row hidden';
  const area=sizing.garmentArea($('batchPlacement').value,size,child?'child':'adult',profileAreas[$('batchPlacement').value]?.[size]);$('batchWidth'+size).value=area[0];$('batchHeight'+size).value=area[1];}}
function openBatch(){
  if(busy||session)return;batchReturnStage=stage;ensureEditDefaults();
  for(const id of batchSharedIDs){if(checks.includes(id))$(id+'Batch').checked=$(id).checked;else $(id+'Batch').value=$(id).value;}
  $('batchGarment').value=$('garment').value;$('batchPlacement').value=$('placement').value;$('batchProtection').value=$('protection').value==='edges'?'edges':'off';
  batchAreaDefaults();batchInfo();showStage('batch');status('Selecciona las imágenes y las tallas que necesita cada una.');
}
function init(){
  load();showStage('prepare');
  $('useCurrent').addEventListener('click',()=>{if(busy)return;try{adoptSource();}catch(e){status(e.message);}});
  for(const axis of ['width','height'])$(axis+'CM').addEventListener('input',()=>{
    if(busy)return;try{syncSize(axis,toCM(Number($(axis+'CM').value)));save();}catch(e){$('pixelInfo').textContent='Corrige la medida antes de continuar.';status(e.message);}
  });
  $('applyPreset').addEventListener('click',()=>{
    if(busy)return;try{
      if(!sourceInfo)throw Error('Primero selecciona el documento de origen.');
      const a=sizing.garmentArea($('placement').value,$('shirtSize').value,$('garment').value,profileAreas[$('placement').value]?.[$('shirtSize').value]);
      const scale=Math.min(a[0]/sourceInfo.width,a[1]/sourceInfo.height),p={widthCM:sourceInfo.width*scale,label:`${sizing.PRESETS[$('placement').value].label} · ${$('shirtSize').value} · ${a.join(' × ')} cm`};
      $('widthCM').value=fromCM(p.widthCM).toFixed(6);syncSize('width',toCM(Number($('widthCM').value)));
      $('presetInfo').textContent=p.label+'. El arte encaja proporcionalmente.';save();
    }catch(e){status(e.message);}
  });
  for(const id of colorIDs){
    const event=id==='knockout'?'change':'input';
    $(id).addEventListener(event,()=>{syncColor();save();});
    $(id+'Edit').addEventListener(event,()=>{if(id==='knockout')$(id).checked=$(id+'Edit').checked;else $(id).value=$(id+'Edit').value;syncSwatches();queue();});
  }
  $('foreground').addEventListener('click',foreground);$('foregroundEdit').addEventListener('click',foreground);
  for(const id of Object.keys(levels)){
    $(id+'Slider').addEventListener('input',()=>{$(id).value=Number($(id+'Slider').value);queue();});
    // change catches keyboard commits and host versions with discrete events.
    $(id+'Slider').addEventListener('change',()=>{if(Number($(id).value)!==Number($(id+'Slider').value)){$(id).value=Number($(id+'Slider').value);queue();}});
    $(id).addEventListener('input',()=>{$(id+'Slider').value=Number($(id).value);queue();});
  }
  $('resetLevels').addEventListener('click',()=>{for(const [id,value]of Object.entries(levels))$(id).value=value;syncSliders();queue();});
  for(const id of ['lpi','angle','minDiameterMM','focusX','focusY','alphaThreshold','shadowBoost','colorBoost','defringeRadius','defringeStrength','edgeContrast','edgeRadius'])$(id).addEventListener('input',queue);
  for(const id of ['shape','recover','protection','halftone','defringe'])$(id).addEventListener('change',queue);
  $('captureSelection').addEventListener('click',()=>action(async()=>{
    if(live)await live.dispose();live=null;
    try{await host.captureProtection(session);$('protection').value='selection';save();}
    finally{createLive();live.request(settings());}
  }));
  $('cleanup').addEventListener('change',()=>{$('minDiameterMM').value=LEVELS[$('cleanup').value].minDiameterMM;queue();});
  for(const id of ['viewMode','linkBackground','previewColor','comparePosition','previewScope','mockupChestCM','mockupHeightCM','mockupX','mockupY'])$(id).addEventListener(['previewColor','comparePosition','mockupChestCM','mockupHeightCM','mockupX','mockupY'].includes(id)?'input':'change',()=>{
    $('compareSlider').value=Number($('comparePosition').value);
    controls();save();if(['comparePosition','previewColor','mockupChestCM','mockupHeightCM','mockupX','mockupY'].includes(id))scheduleView();else if(previewCache)paint(previewCache).catch(e=>{if(!e.superseded)status(e.message);});
  });
  $('compareSlider').addEventListener('input',()=>{$('comparePosition').value=Number($('compareSlider').value);save();scheduleView();});
  $('previewImage').addEventListener('click',event=>{
    if(busy||!previewCache||$('viewMode').value!=='original'||$('previewScope').value!=='detail')return;
    const rect=$('previewImage').getBoundingClientRect(),src=previewCache.src;if(!rect.width||!rect.height)return;
    const x=Math.max(0,Math.min(src.width-1,Math.floor((event.clientX-rect.left)/rect.width*src.width)));
    const y=Math.max(0,Math.min(src.height-1,Math.floor((event.clientY-rect.top)/rect.height*src.height))),i=(y*src.width+x)*4;
    if(!src.data[i+3])return status('Selecciona un píxel con color; la muestra es transparente.');
    $('key').value='#'+Array.from(src.data.subarray(i,i+3)).map(v=>v.toString(16).padStart(2,'0')).join('');syncColor();queue();
  });
  $('next').addEventListener('click',()=>action(async()=>{
    if($('protection').value==='selection')$('protection').value='off';
    ensureEditDefaults();updateSizeInfo();const o=settings();hexRGB(o.key);if(!o.linkBackground)hexRGB(o.previewColor);
    status('Preparando tamaño y primer tramado…');
    initialToken={cancelled:false};controls();const started=Date.now();
    try{session=await host.beginSession(o.source,o,(phase,p)=>{checkInitial();status(({trim:'Midiendo arte ',resize:'Redimensionando ',screen:'Tramando ',cleanup:'Limpiando ',write:'Creando resultado '}[phase]||'Procesando ')+Math.round(p*100)+'%');});}
    finally{initialToken=null;controls();}
    session.metrics={initialMs:Date.now()-started};
    outputID=null;syncColor();showStage('edit');$('sessionInfo').textContent=summary(session)+(session.memoryMode==='disk'?' Procesamiento con caché en disco.':' Procesamiento en memoria RAM.');
    createLive();await paint(session.preview);$('liveState').textContent='Vista y lienzo sincronizados';
  }));
  $('back').addEventListener('click',()=>action(discard));$('cancel').addEventListener('click',()=>action(discard));
  $('apply').addEventListener('click',()=>action(async()=>{
    status('Esperando el último procesamiento completo…');
    // Rebuild once at commit so manual changes to the working layer cannot
    // introduce translucent pixels or leave a closed document accepted.
    live.request(settings());await live.flush();
    if(!session.stats.inkPixels)throw Error('El resultado quedó vacío. Reduce tolerancia o limpieza y revisa el color.');
    if(host.clearWorkspace)await host.clearWorkspace(session);
    const result=session;approvedResult={width:result.size.width,height:result.size.height};await live.dispose();live=null;outputID=result.documentID;
    $('resultInfo').textContent=summary(result);await host.releaseSession(result);session=null;previewCache=null;paintRevision++;
    showStage('result');status('Resultado conservado en Photoshop. Puedes exportarlo a PNG.'+(result.cacheWarning?' '+result.cacheWarning:''));
  }));
  $('export').addEventListener('click',()=>action(async()=>{
    const file=await storage.localFileSystem.getFileForSaving('halftone-dtf-300ppp.png',{types:['png']});
    if(!file)return status('Exportación cancelada.');await host.exportPNG(outputID,file,()=>{},approvedResult);status('PNG exportado a 300 ppp, con alfa binario.');
  }));
  $('newJob').addEventListener('click',()=>{if(busy)return;outputID=null;showStage('prepare');status('Selecciona un origen o conserva el anterior para otro tramado.');});
  $('openBatch').addEventListener('click',openBatch);$('openBatchResult').addEventListener('click',openBatch);
  $('batchBack').addEventListener('click',()=>{if(!busy)showStage(batchReturnStage);});
  $('batchFiles').addEventListener('click',()=>action(async()=>{
    const selected=await storage.localFileSystem.getFileForOpening({allowMultiple:true,types:['png','jpg','jpeg','tif','tiff','psd','bmp']});
    if(selected&&selected.length){batchFiles=selected;assignments={};refreshFileSelect();$('batchFilesInfo').textContent=`${selected.length} archivos seleccionados. ${selected.slice(0,3).map(file=>file.name).join(', ')}${selected.length>3?'…':''}`;batchInfo();}
  }));
  $('batchFolder').addEventListener('click',()=>action(async()=>{const selected=await storage.localFileSystem.getFolder();if(selected){batchFolder=selected;$('batchFolderInfo').textContent=selected.nativePath||selected.name;}}));
  $('batchPlacement').addEventListener('change',()=>{batchAreaDefaults();batchInfo();});
  for(const size of allSizes){$('batch'+size).addEventListener('change',batchInfo);$('batchWidth'+size).addEventListener('input',()=>{rememberAreas();batchInfo();});$('batchHeight'+size).addEventListener('input',()=>{rememberAreas();batchInfo();});}
  for(const id of batchSharedIDs)$(id+'Batch').addEventListener((['shape','cleanup'].includes(id)||checks.includes(id))?'change':'input',()=>{
    if(checks.includes(id))$(id).checked=$(id+'Batch').checked;else $(id).value=$(id+'Batch').value;
    if(id==='cleanup')$('minDiameterMM').value=LEVELS[$('cleanup').value].minDiameterMM;
    syncColor();save();batchInfo();
  });
  $('batchCancel').addEventListener('click',()=>{if(batchToken){batchToken.cancelled=true;controls();$('batchProgress').textContent='Deteniendo; se conservarán los PNG completados…';}});
  $('batchRun').addEventListener('click',()=>action(()=>executeBatch()));
  initExtras();initCompact();
  updateUI=require('./update-ui').initUpdates({get:$,preferences:localStorage,fetchImpl:typeof fetch==='function'?fetch:undefined,photoshop:typeof fetch==='function'?require('photoshop').app.version:'25.0.0',open:(url,text)=>require('uxp').shell.openExternal(url,text)});
  try{adoptSource();}catch(_){status('Abre tu diseño y pulsa Usar documento actual.');}controls();
}
entrypoints.setup({panels:{halftoneDTF:{show(){}}}});
init();

function toCM(value){return $('units').value==='in'?value*2.54:value;}
function fromCM(value){return $('units').value==='in'?value/2.54:value;}
function checkInitial(){if(initialToken?.cancelled){const e=Error('Preparación detenida.');e.cancelled=true;throw e;}}
function toggle(id){$(id).className=$(id).className==='hidden'?'':'hidden';}
function setFields(o){
 for(const id of settingIDs)if(o[id]!=null){if(checks.includes(id))$(id).checked=o[id];else $(id).value=o[id];}
 displayUnit=$('units').value;
 if(o.widthCM!=null&&o.heightCM!=null){canonicalSize={widthCM:o.widthCM,heightCM:o.heightCM};$('widthCM').value=fromCM(o.widthCM).toFixed(6);$('heightCM').value=fromCM(o.heightCM).toFixed(6);}
 syncGarmentOptions(o.shirtSize);syncColor();syncSliders();syncScreen();
}
function rememberAreas(){
 const place=$('batchPlacement').value;profileAreas[place]=profileAreas[place]||{};
 for(const size of allSizes){const a=[Number($('batchWidth'+size).value),Number($('batchHeight'+size).value)];if(a.every(v=>Number.isFinite(v)&&v>0&&v<=100))profileAreas[place][size]=a;}
 localStorage.setItem('halftone-areas-v1',JSON.stringify(profileAreas));
}
function optionsForBatch(){return {...settings(),protection:$('batchProtection').value};}
function batchAssignments(){
 const commonPositions=$('batchBothSides').checked?['front','back']:[$('batchPlacement').value];
 return batchFiles.map((file,i)=>({...(!assignments[i]?.useCommon?assignments[i]:{}),
  sizes:assignments[i]?.useCommon===false?assignments[i].sizes:batchSizes(),placements:assignments[i]?.useCommon===false?assignments[i].placements:commonPositions,
  overrides:assignments[i]?.overrides||{},areas:assignments[i]?.areas||{...profileAreas,[$('batchPlacement').value]:batchAreas()}}));
}
function refreshFileSelect(){
 if(typeof document.createElement!=='function')return;
 const selected=$('batchImageIndex').value;$('batchImageIndex').innerHTML='';
 for(let i=0;i<batchFiles.length;i++){const opt=document.createElement('option');opt.value=String(i);opt.textContent=(i+1)+'. '+batchFiles[i].name;$('batchImageIndex').appendChild(opt);}
 $('batchImageIndex').value=batchFiles[Number(selected)]?selected:'0';showAssignment();
}
function refreshRecipes(){
 if(typeof document.createElement!=='function')return;
 for(const id of ['recipeSelect','imageRecipe']){
  const current=$(id).value;$(id).innerHTML='';const empty=document.createElement('option');empty.value='';empty.textContent=id==='imageRecipe'?'Ajustes comunes':'Elegir receta…';$(id).appendChild(empty);
  for(const recipe of recipeList){const opt=document.createElement('option');opt.value=recipe.id;opt.textContent=recipe.name;$(id).appendChild(opt);}$(id).value=current;
 }
}
function showAssignment(){
 const i=Number($('batchImageIndex').value),a=assignments[i];$('imageUseCommon').checked=a?.useCommon!==false;
 $('imageGarment').value=a?.garment||$('garment').value;showImageSizes();
 $('imageRecipe').value=a?.recipeID||'';$('imageOwnColor').checked=!!a?.ownColor;$('imageKey').value=a?.overrides?.key||$('key').value;
 for(const size of allSizes)if($('imageSize'+size))$('imageSize'+size).checked=(a?.sizes||batchSizes()).includes(size);
 for(const place of Object.keys(sizing.PRESETS))if($('imagePosition'+place))$('imagePosition'+place).checked=(a?.placements||[$('batchPlacement').value]).includes(place);
 $('assignmentInfo').textContent=batchFiles[i]?batchFiles[i].name+' · '+(a?'excepción guardada':'ajustes comunes'):'Selecciona una imagen.';
}
function showImageSizes(){for(const size of allSizes)if($('imageSize'+size))$('imageSize'+size).parentElement.className=sizing.CHILD_SIZES.includes(size)===($('imageGarment').value==='child')?'check':'check hidden';}
async function executeBatch(resume){
 batchToken={cancelled:false};controls();
 try{
  const o=optionsForBatch(),config={files:batchFiles,folder:batchFolder,sizes:batchSizes(),placement:$('batchPlacement').value,areas:batchAreas(),options:o,assignments:batchAssignments(),token:batchToken,host};
  const progress=p=>{$('batchProgress').textContent=p.message+(p.phase?' · '+({trim:'Midiendo arte',resize:'Preparando tamaño',screen:'Tramando',cleanup:'Limpiando',tile:'Calculando resultado',write:'Creando documento'}[p.phase]||'Procesando')+' '+Math.round(p.value*100)+'%':'');};
  if(!resume&&host.openBatchSource){const verified=await batch.preflightBatch({...config,onProgress:progress});$('batchPreflightInfo').textContent=verified.filter(r=>r.status==='ready').length+' variantes verificadas · '+verified.filter(r=>r.status==='error').length+' errores detectados.';}
  const result=await runBatch({...config,options:resume?{}:o,resume,onProgress:progress,bindSources:async(folder,files)=>{
   if(!storage.localFileSystem.createPersistentToken)return;
   try{const tokens=[];for(const file of files)tokens.push(await storage.localFileSystem.createPersistentToken(file));localStorage.setItem('halftone-batch-'+folder.name,JSON.stringify(tokens));}catch(e){status('Para reanudar deberás volver a elegir los originales.');}
  }});
  resumeRun=result.run;$('batchProgress').textContent=`${result.done} guardados · ${result.errors} errores · ${result.cancelled} detenidos. Carpeta: ${result.folder.nativePath||result.folder.name}${result.fatal?' · '+result.fatal:''}${result.warnings?.length?' · '+result.warnings.join(' '):''}`;
  status('Lote terminado. El avance está guardado; revisa los PNG antes de imprimir.');
 }finally{batchToken=null;controls();}
}
async function loadProjectAction(folder){
 if(!folder)return;initialToken={cancelled:false};controls();
 try{
  const snapshot=await projects.load(folder,storage.formats.binary,checkInitial);setFields(snapshot.options);
  session=await host.beginFromSnapshot(snapshot,settings(),(phase,p)=>{checkInitial();status('Abriendo proyecto · '+phase+' '+Math.round(p*100)+'%');});
  sourceInfo=null;outputID=null;lastProject=folder;showStage('edit');createLive();await paint(session.preview);$('sessionInfo').textContent=summary(session)+' · Proyecto reabierto a su tamaño guardado.';
 }finally{initialToken=null;controls();}
}
function initExtras(){
 try{recipeList=recipesAPI.parse(localStorage.getItem('halftone-recipes-v1')||recipesAPI.serialize([]));profileAreas=recipesAPI.areas(JSON.parse(localStorage.getItem('halftone-areas-v1')||'{}'));}catch(e){status('No se pudieron cargar recetas: '+e.message);}refreshRecipes();
 $('toggleRecipes').addEventListener('click',()=>toggle('recipesPanel'));$('toggleHelp').addEventListener('click',()=>toggle('helpPanel'));
 $('togglePreviewExtras').addEventListener('click',()=>toggle('previewExtras'));
 $('toggleBatchAdvanced').addEventListener('click',()=>toggle('batchAdvanced'));$('toggleAssignment').addEventListener('click',()=>{toggle('assignmentPanel');showAssignment();});
 for(const [id,panel]of [['tabTrama','tramaControls'],['tabColor','colorControls'],['tabDetails','protectionControls']])$(id).addEventListener('click',()=>{
  $(panel).className=$(panel).className.includes('hidden')?'control-card':'control-card hidden';
 });
 for(const key of ['shadowBoost','colorBoost'])$(key+'Slider').addEventListener('input',()=>{$(key).value=Number($(key+'Slider').value);queue();});
 $('units').addEventListener('change',()=>{
  if(!canonicalSize)canonicalSize={widthCM:displayUnit==='in'?Number($('widthCM').value)*2.54:Number($('widthCM').value),heightCM:displayUnit==='in'?Number($('heightCM').value)*2.54:Number($('heightCM').value)};
  displayUnit=$('units').value;$('widthCM').value=fromCM(canonicalSize.widthCM).toFixed(6);$('heightCM').value=fromCM(canonicalSize.heightCM).toFixed(6);save();if(sourceInfo)updateSizeInfo();
 });
 $('garment').addEventListener('change',()=>{
  const child=$('garment').value==='child';$('shirtSize').innerHTML=(child?sizing.CHILD_SIZES:sizing.SIZES).map(size=>'<option>'+size+'</option>').join('');$('shirtSize').value=child?'4':'M';
  if(child&&!sizing.CHILD_SIZES.some(size=>$('batch'+size).checked)){$('batch4').checked=true;$('batch6').checked=true;}
  $('batchGarment').value=$('garment').value;batchAreaDefaults();batchInfo();showAssignment();save();
 });
 $('batchGarment').addEventListener('change',()=>{
  $('garment').value=$('batchGarment').value;syncGarmentOptions();
  if($('garment').value==='child'&&!sizing.CHILD_SIZES.some(size=>$('batch'+size).checked)){$('batch4').checked=true;$('batch6').checked=true;}
  batchAreaDefaults();batchInfo();showAssignment();save();
 });
 $('imageGarment').addEventListener('change',()=>{
  const sizes=$('imageGarment').value==='child'?sizing.CHILD_SIZES:sizing.SIZES;
  for(const size of allSizes)$('imageSize'+size).checked=sizes.includes(size)&&(['M','L','4','6'].includes(size));
  $('imageUseCommon').checked=false;showImageSizes();
 });
 $('convertCurrent').addEventListener('click',()=>action(async()=>{await host.convertCurrent();canonicalSize=null;adoptSource();status('Copia RGB/8 creada. El original se conserva.');}));
 $('cancelPreparation').addEventListener('click',()=>{if(initialToken){initialToken.cancelled=true;controls();status('Deteniendo entre bloques…');}});
 $('cleanupCaches').addEventListener('click',()=>action(async()=>{if(session)throw Error('Termina la sesión antes de limpiar cachés.');const r=await require('./tiles').cleanupAbandonedCaches();status(r.deleted+' cachés abandonadas eliminadas. '+r.errors.join(' '));}));
 $('previewZoom').addEventListener('change',()=>{$('previewImage').style.width=$('previewZoom').value==='fit'?'100%':(previewPixels*Number($('previewZoom').value)/100)+'px';});
 for(const [id,axis,delta]of [['panLeft','focusX',-10],['panRight','focusX',10],['panUp','focusY',-10],['panDown','focusY',10]])$(id).addEventListener('click',()=>{$(axis).value=Math.max(0,Math.min(100,Number($(axis).value)+delta));$('previewScope').value='detail';queue();});
 $('saveRecipe').addEventListener('click',()=>action(async()=>{
  rememberAreas();const r=recipesAPI.entry({name:$('recipeName').value,options:settings(),areas:profileAreas,profile:{brand:$('profileBrand').value,model:$('profileModel').value,machine:$('profileMachine').value,rip:$('profileRIP').value,material:$('profileMaterial').value,calibrated:$('profileCalibrated').checked}});
  if(recipeList.length>=100)throw Error('Límite de 100 recetas.');recipeList.push(r);localStorage.setItem('halftone-recipes-v1',recipesAPI.serialize(recipeList));refreshRecipes();status('Receta guardada.');
 }));
 $('applyRecipe').addEventListener('click',()=>{
  if(busy)return;const r=recipeList.find(r=>r.id===$('recipeSelect').value);if(!r)return status('Elige una receta.');
  try{const o={...r.options};if(session){delete o.widthCM;delete o.heightCM;delete o.units;delete o.sizeAxis;}
   setFields(o);profileAreas=r.areas;localStorage.setItem('halftone-areas-v1',JSON.stringify(profileAreas));batchAreaDefaults();
   $('profileBrand').value=r.profile.brand;$('profileModel').value=r.profile.model;$('profileMachine').value=r.profile.machine;$('profileRIP').value=r.profile.rip;$('profileMaterial').value=r.profile.material;$('profileCalibrated').checked=r.profile.calibrated;
   if(stage==='batch'){for(const id of batchSharedIDs){if(checks.includes(id))$(id+'Batch').checked=$(id).checked;else $(id+'Batch').value=$(id).value;}batchInfo();}
   if(stage==='prepare'&&sourceInfo)updateSizeInfo();queue();status('Receta aplicada'+(session?' al tamaño de la sesión actual.':'.'));
  }catch(e){status(e.message);}
 });
 $('deleteRecipe').addEventListener('click',()=>{if(busy)return;recipeList=recipeList.filter(r=>r.id!==$('recipeSelect').value);localStorage.setItem('halftone-recipes-v1',recipesAPI.serialize(recipeList));refreshRecipes();status('Receta eliminada de este equipo.');});
 $('importRecipes').addEventListener('click',()=>action(async()=>{const file=await storage.localFileSystem.getFileForOpening({types:['json']});if(!file)return;
  const incoming=recipesAPI.parse(await file.read()),merged=recipeList.slice();for(const r of incoming){const index=merged.findIndex(old=>old.id===r.id);if(index<0)merged.push(r);else merged[index]=r;}if(merged.length>100)throw Error('La importación supera 100 recetas.');
  recipeList=merged;localStorage.setItem('halftone-recipes-v1',recipesAPI.serialize(recipeList));refreshRecipes();status(incoming.length+' recetas importadas.');
 }));
 $('exportRecipes').addEventListener('click',()=>action(async()=>{const file=await storage.localFileSystem.getFileForSaving('recetas-halftone.json',{types:['json']});if(file){await file.write(recipesAPI.serialize(recipeList));status('Recetas exportadas.');}}));
 $('saveProject').addEventListener('click',()=>action(async()=>{
  live.request(settings());await live.flush();const parent=await storage.localFileSystem.getFolder();if(!parent)return;
  initialToken={cancelled:false};controls();try{lastProject=await projects.save(parent,session,{...settings(),widthCM:session.size.widthCM,heightCM:session.size.heightCM},storage.formats.binary,checkInitial);status('Proyecto editable guardado: '+lastProject.name);}finally{initialToken=null;controls();}
 }));
 $('openProject').addEventListener('click',()=>action(async()=>loadProjectAction(await storage.localFileSystem.getFolder())));
 $('reopenLastProject').addEventListener('click',()=>action(()=>loadProjectAction(lastProject)));
 $('nativeSelfTest').addEventListener('click',()=>action(async()=>{if(session)throw Error('Aplica o descarta la sesión antes de comprobar Photoshop.');const parent=await storage.localFileSystem.getFolder();if(!parent)return;initialToken={cancelled:false};controls();try{const r=await require('./native-validation').run(parent,checkInitial,status);status('Comprobación Photoshop: '+r.report.status+' · '+r.folder.name+(r.report.error?' · '+r.report.error:''));}finally{initialToken=null;controls();}}));
 $('diagnosticExport').addEventListener('click',()=>action(async()=>{const file=await storage.localFileSystem.getFileForSaving('diagnostico-halftone.json',{types:['json']});if(file)await file.write(JSON.stringify({plugin:require('./manifest.json').version,date:new Date().toISOString(),settings:recipesAPI.options(settings()),stage,stats:session?.stats||null,metrics:session?.metrics||null,photoshop:require('photoshop').app.version||'no disponible'},null,2));status('Diagnóstico exportado sin píxeles ni rutas del origen.');}));
 $('batchImageIndex').addEventListener('change',showAssignment);
 $('batchBothSides').addEventListener('change',batchInfo);
 if(typeof document.createElement==='function'){
  for(const [target,items,prefix]of [['imageSizes',allSizes,'imageSize'],['imagePositions',Object.keys(sizing.PRESETS),'imagePosition']])for(const value of items){const label=document.createElement('label'),input=document.createElement('input');label.className='check';input.type='checkbox';input.id=prefix+value;label.appendChild(input);const text=document.createElement('span');text.textContent=sizing.PRESETS[value]?.label||value;label.appendChild(text);$(target).appendChild(label);}
 }
 $('saveAssignment').addEventListener('click',()=>{
  try{const i=Number($('batchImageIndex').value);if(!batchFiles[i])throw Error('Elige una imagen.');const r=recipeList.find(r=>r.id===$('imageRecipe').value),overrides=r?{...r.options}:{};
   if($('imageOwnColor').checked){hexRGB($('imageKey').value);overrides.key=$('imageKey').value;overrides.knockout=true;}
   const garment=$('imageGarment').value,validSizes=garment==='child'?sizing.CHILD_SIZES:sizing.SIZES;
   assignments[i]={useCommon:$('imageUseCommon').checked,garment,sizes:validSizes.filter(size=>$('imageSize'+size)?.checked),placements:Object.keys(sizing.PRESETS).filter(place=>$('imagePosition'+place)?.checked),recipeID:r?.id||'',overrides,ownColor:$('imageOwnColor').checked,areas:r?.areas||null};
   batchInfo();showAssignment();status('Excepción guardada para '+batchFiles[i].name);
  }catch(e){status(e.message);}
 });
 $('removeBatchFile').addEventListener('click',()=>{if(busy)return;const i=Number($('batchImageIndex').value);batchFiles.splice(i,1);const next={};for(const [index,a]of Object.entries(assignments))if(Number(index)!==i)next[Number(index)>i?Number(index)-1:index]=a;assignments=next;refreshFileSelect();batchInfo();controls();});
 $('addBatchFiles').addEventListener('click',()=>action(async()=>{const files=await storage.localFileSystem.getFileForOpening({allowMultiple:true,types:['png','jpg','jpeg','tif','tiff','psd','bmp']});if(files){if(batchFiles.length+files.length>500)throw Error('Límite de 500 imágenes por lote.');batchFiles.push(...files);refreshFileSelect();batchInfo();}}));
 $('batchPreflight').addEventListener('click',()=>action(async()=>{
  batchToken={cancelled:false};controls();try{preflightResult=await batch.preflightBatch({files:batchFiles,sizes:batchSizes(),placement:$('batchPlacement').value,areas:batchAreas(),options:optionsForBatch(),assignments:batchAssignments(),token:batchToken,host,onProgress:p=>{$('batchProgress').textContent=p.message;}});
   $('batchPreflightInfo').textContent=preflightResult.filter(r=>r.status==='ready').length+' listas · '+preflightResult.filter(r=>r.status==='error').length+' errores. '+preflightResult.filter(r=>r.error).slice(0,3).map(r=>r.image+': '+r.error).join(' ');
  }finally{batchToken=null;controls();}
 }));
 $('batchResume').addEventListener('click',()=>action(async()=>{
  const folder=await storage.localFileSystem.getFolder();if(!folder)return;const run=await batch.loadRun(folder),tokens=JSON.parse(localStorage.getItem('halftone-batch-'+folder.name)||'[]');let files=[];
  try{if(tokens.length!==run.job.sources.length)throw Error('Sin referencias');for(const token of tokens)files.push(await storage.localFileSystem.getEntryForPersistentToken(token));}
  catch(e){const selected=await storage.localFileSystem.getFileForOpening({allowMultiple:true,types:['png','jpg','jpeg','tif','tiff','psd','bmp']});if(!selected)return;files=[];const available=selected.slice();
   for(const original of run.job.sources){const candidates=[];for(let i=0;i<available.length;i++){const id=await batch.identity(available[i]);if(id.name===original.name&&(original.size==null||id.size===original.size)&&(original.modified==null||id.modified===original.modified))candidates.push(i);}
    if(candidates.length!==1)throw Error('No se pudo identificar de forma única el original: '+original.name);files.push(available.splice(candidates[0],1)[0]);}
  }
  batchFiles=files;batchFolder=folder;refreshFileSelect();await executeBatch(run);
 }));
}

function syncGarmentOptions(preferred){const child=$('garment').value==='child',sizes=child?sizing.CHILD_SIZES:sizing.SIZES;
 $('shirtSize').innerHTML=sizes.map(size=>'<option>'+size+'</option>').join('');$('shirtSize').value=sizes.includes(preferred)?preferred:child?'4':'M';
 if(child&&!sizing.CHILD_SIZES.some(size=>$('batch'+size).checked)){$('batch4').checked=true;$('batch6').checked=true;}
}

function syncViews(){
 syncSwatches();
 const mode=$('viewMode').value;
 for(const [id,value]of [['viewOriginal','original'],['viewGarment','garment'],['viewTransparent','transparent'],['viewMask','mask']]){
  const active=mode===value||(value==='garment'&&['compare','beforeGarment'].includes(mode));$(id).className=active?'active':'';
  if($(id).setAttribute)$(id).setAttribute('aria-pressed',String(active));
 }
 $('compareEnabled').checked=mode==='compare';
}
function syncCleanup(){
 for(const [id,value]of [['cleanupNone','none'],['cleanupLow','low'],['cleanupStandard','standard'],['cleanupHigh','high']]){
  const active=$('cleanup').value===value;$(id).className=active?'active':'';
  if($(id).setAttribute)$(id).setAttribute('aria-pressed',String(active));
 }
}
function initCompact(){
 $('footerVersion').textContent=require('./manifest.json').version+' RC';
 for(const [id,value]of [['cleanupNone','none'],['cleanupLow','low'],['cleanupStandard','standard'],['cleanupHigh','high']])$(id).addEventListener('click',()=>{
  $('cleanup').value=value;$('minDiameterMM').value=LEVELS[value].minDiameterMM;syncCleanup();queue();
 });
 const repaint=()=>{syncViews();save();if(previewCache)paint(previewCache).catch(e=>{if(!e.superseded)status(e.message);});};
 for(const [button,panel]of [['toggleTools','toolsPanel'],['toggleSource','sourceOptions'],['togglePerformance','performancePanel'],['togglePrepareColor','prepareColorAdvanced'],['toggleBatchCommon','batchCommonPanel'],['toggleOutput','outputControls']])$(button).addEventListener('click',()=>{
  toggle(panel);if($(button).setAttribute)$(button).setAttribute('aria-expanded',String($(panel).className!=='hidden'));
 });
 $('editScreen').addEventListener('click',()=>{syncScreen();$('tramaControls').className=$('tramaControls').className.includes('hidden')?'control-card':'control-card hidden';});
 for(const id of ['lpi','angle','shape','halftone']){
  $(id+'Edit').addEventListener(['shape','halftone'].includes(id)?'change':'input',()=>{if(id==='halftone')$(id).checked=$(id+'Edit').checked;else $(id).value=$(id+'Edit').value;controls();queue();});
  $(id).addEventListener(['shape','halftone'].includes(id)?'change':'input',syncScreen);
 }
 $('sizeMode').addEventListener('change',()=>{$('presetControls').className=$('sizeMode').value==='preset'?'':'hidden';controls();if($('sizeMode').value==='preset')applySizePreset();});
 for(const id of ['placement','shirtSize','garment'])$(id).addEventListener('change',()=>{if($('sizeMode').value==='preset')applySizePreset();});
 for(const [id,mode]of [['viewOriginal','original'],['viewGarment','garment'],['viewTransparent','transparent'],['viewMask','mask']])$(id).addEventListener('click',()=>{$('viewMode').value=mode;repaint();});
 $('compareEnabled').addEventListener('change',()=>{$('viewMode').value=$('compareEnabled').checked?'compare':'garment';repaint();});
 $('toggleInspector').addEventListener('click',()=>{toggle('inspectorPanel');repaint();});
 $('pickBackground').addEventListener('click',()=>action(async()=>{
  if(live)await live.flush();const color=await require('./color-picker').pickColor($('linkBackground').checked?$('key').value:$('previewColor').value,'Color de la prenda');
  if(color){$('previewColor').value=color;$('linkBackground').checked=false;if(previewCache)await paint(previewCache);}
 }));
 $('toggleBatchAreas').addEventListener('click',()=>{$('batchAreasPanel').className=$('batchAreasPanel').className==='compact-areas'?'':'compact-areas';});
 syncViews();syncScreen();
}
function applySizePreset(){
 if(busy||!sourceInfo)return;
 try{const area=sizing.garmentArea($('placement').value,$('shirtSize').value,$('garment').value,profileAreas[$('placement').value]?.[$('shirtSize').value]);
  const scale=Math.min(area[0]/sourceInfo.width,area[1]/sourceInfo.height);$('widthCM').value=fromCM(sourceInfo.width*scale).toFixed(6);syncSize('width',sourceInfo.width*scale);
  $('presetInfo').textContent='Área máxima: '+area.join(' × ')+' cm · encaje proporcional';save();
 }catch(e){status(e.message);}
}
