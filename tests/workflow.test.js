'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {validate}=require('../plugin/engine');
function fixture(){
  const html=fs.readFileSync(require.resolve('../plugin/index.html'),'utf8'),elements={},calls=[];
  for(const m of html.matchAll(/<([\w-]+)([^>]*\bid="([^"]+)"[^>]*)>/g)){
    const [,tag,attrs,id]=m,el={style:{},id,tag,type:(attrs.match(/type="([^"]+)"/)||[])[1]||'text',value:(attrs.match(/value="([^"]*)"/)||[])[1]||'',checked:/\bchecked\b/.test(attrs),className:(attrs.match(/class="([^"]*)"/)||[])[1]||'',disabled:false,textContent:'',src:'',listeners:{}};
    if(tag==='select'){
      const body=html.slice(m.index).split('</select>')[0],opts=[...body.matchAll(/<option([^>]*)>([^<]+)<\/option>/g)],opt=opts.find(o=>/selected/.test(o[1]))||opts[0];el.value=(opt[1].match(/value="([^"]+)"/)||[])[1]||opt[2];
    }
    el.addEventListener=(name,fn)=>(el.listeners[name]||=[]).push(fn);
    el.emit=async(name,event={})=>{for(const fn of el.listeners[name]||[])await fn({target:el,...event});};elements[id]=el;
  }
  const src={data:new Uint8Array([240,80,20,255]),width:1,height:1};
  const size={width:300,height:300,widthCM:2.54,heightCM:2.54};
  const stats={inkPixels:100,coveragePercent:50};
  const preview={src,result:src,size,stats,exact:true};
  const directory={name:'output',nativePath:'/output',getEntries:async()=>[],createFolder:async name=>({...directory,name}),createFile:async name=>({name,write:async()=>{},delete:async()=>{}})};
  const files=[{name:'a.png'},{name:'b.png'}];
  const host={
    openBatchSource:async()=>({documentID:7,width:300,height:300,owned:true}),closeBatchSource:async()=>calls.push(['closeBatch']),captureProtection:async s=>{s.protectStore={};calls.push(['protect']);},
    info:()=>({documentID:7,name:'Original',width:300,height:300,dpi:300,widthCM:2.54}),
    beginSession:async(source,o)=>{validate(o);calls.push(['begin',source,o]);return {documentID:20,source:src.data,size,stats,preview};},
    renderPreview:async()=> 'data:image/jpeg;base64,mock',
    updateSession:async(session,o,ctx,onPreview)=>{ctx.check();validate(o);calls.push(['update',o]);session.stats=stats;await onPreview(preview,ctx);ctx.check();},
    cancelSession:async()=>calls.push(['cancel']),releaseSession:()=>calls.push(['release']),exportPNG:async()=>calls.push(['export'])
  };
  const values={};
  const storageFS={getFileForSaving:async()=>({write:async data=>calls.push(['fileWrite',data])}),getFileForOpening:async()=>files,getFolder:async()=>directory};
  function createElement(tag){const e={tag,type:'',style:{},value:'',checked:false,className:'',textContent:'',disabled:false,children:[],listeners:{},innerHTML:''};Object.defineProperty(e,'id',{get:()=>e._id,set:id=>{e._id=id;elements[id]=e;}});e.appendChild=child=>{e.children.push(child);child.parentElement=e;};e.addEventListener=(event,fn)=>(e.listeners[event]||=[]).push(fn);e.emit=async(event,data={})=>{for(const fn of e.listeners[event]||[])await fn({target:e,...data});};return e;}
  for(const e of Object.values(elements)){e.children=[];e.appendChild=child=>{e.children.push(child);child.parentElement=e;};}

  vm.runInNewContext(fs.readFileSync(require.resolve('../plugin/main'),'utf8'),{
    require:name=>name==='uxp'?{entrypoints:{setup:()=>{}},storage:{localFileSystem:storageFS,formats:{binary:'binary'}}}:name==='./host'?host:require('../plugin/'+name.replace('./','')),
    document:{createElement,getElementById:id=>{if(!elements[id])throw Error('Missing '+id);return elements[id];},querySelectorAll:()=>Object.values(elements).filter(el=>['input','select','button','sp-slider'].includes(el.tag))},
    localStorage:{getItem:key=>values[key],setItem:(key,value)=>{values[key]=value;}},setTimeout,clearTimeout,Promise,Uint8Array
  });
  return {elements,calls,host,storageFS,values};
}
test('Next prepares a processed copy; stage 2 edits knockout and five levels before Apply',async()=>{
  const {elements:e,calls}=fixture();
  await e.next.emit('click');assert.equal(e.prepareStage.className,'hidden');assert.equal(e.editStage.className,'');
  assert.equal(calls[0][0],'begin');assert.equal(calls[0][2].widthCM,2.54);
  e.keyEdit.value='#123456';await e.keyEdit.emit('input');assert.equal(e.key.value,'#123456');
  e.inputMidtoneSlider.value=2;await e.inputMidtoneSlider.emit('input');assert.equal(e.inputMidtone.value,2);
  e.outputWhiteSlider.value=140;await e.outputWhiteSlider.emit('input');
  await e.apply.emit('click');const update=calls.find(c=>c[0]==='update')[1];
  assert.equal(update.key,'#123456');assert.equal(update.inputMidtone,2);assert.equal(update.outputWhite,140);
  assert.equal(e.resultStage.className,'');assert.equal(e.editStage.className,'hidden');assert.ok(calls.some(c=>c[0]==='release'));
  await e.export.emit('click');assert.ok(calls.some(c=>c[0]==='export'));
});
test('invalid final levels keep editing open; correction and Reset recover; Back discards copy',async()=>{
  const {elements:e,calls}=fixture();await e.next.emit('click');
  e.inputBlack.value=250;await e.inputBlack.emit('input');e.inputWhite.value=100;await e.inputWhite.emit('input');
  await e.apply.emit('click');assert.equal(e.editStage.className,'');assert.match(e.status.textContent,/negro de entrada/);
  assert.ok(!calls.some(c=>c[0]==='release'));
  await e.resetLevels.emit('click');assert.equal(e.inputBlack.value,7);assert.equal(e.inputMidtone.value,2);assert.equal(e.inputWhite.value,100);
  await e.back.emit('click');assert.equal(e.prepareStage.className,'');assert.equal(calls.filter(c=>c[0]==='cancel').length,1);
  assert.ok(!calls.some(c=>c[0]==='release'));
});
test('Cancel with invalid editing values cannot trap the next preparation',async()=>{
  const {elements:e,calls}=fixture();await e.next.emit('click');
  e.inputBlack.value=250;await e.inputBlack.emit('input');e.inputWhite.value=100;await e.inputWhite.emit('input');
  await e.cancel.emit('click');await e.next.emit('click');
  assert.equal(e.editStage.className,'');assert.equal(calls.filter(c=>c[0]==='begin').length,2);
  assert.equal(e.inputBlack.value,7);assert.equal(e.inputWhite.value,100);
  await e.cancel.emit('click');
});

test('batch UI defaults to M/L, shows image×size count and executes all selected variants',async()=>{
 const {elements:e,calls}=fixture();await e.openBatch.emit('click');assert.equal(e.batchStage.className,'');
 assert.equal(e.batchM.checked,true);assert.equal(e.batchL.checked,true);assert.equal(e.batchXS.checked,false);
 await e.batchFiles.emit('click');await e.batchFolder.emit('click');assert.match(e.batchCount.textContent,/2 imágenes · 2 tallas · 4 resultados/);
 e.keyBatch.value='#223344';await e.keyBatch.emit('input');e.batchProtection.value='edges';
 await e.batchRun.emit('click');assert.match(e.batchProgress.textContent,/4 guardados · 0 errores/);
 const jobs=calls.filter(c=>c[0]==='begin');assert.equal(jobs.length,4);assert.ok(jobs[0][2].widthCM<jobs[1][2].widthCM);assert.equal(jobs[0][2].key,'#223344');assert.equal(jobs[0][2].protection,'edges');
 assert.equal(calls.filter(c=>c[0]==='export').length,4);assert.equal(calls.filter(c=>c[0]==='closeBatch').length,4);
 assert.equal(e.batchCancel.disabled,true);await e.batchBack.emit('click');assert.equal(e.prepareStage.className,'');
});
test('comparison divider updates rendering without scheduling another Photoshop write',async()=>{
 const {elements:e,calls}=fixture();await e.next.emit('click');e.viewMode.value='compare';await e.viewMode.emit('change');e.compareSlider.value=70;await e.compareSlider.emit('input');
 assert.equal(e.comparePosition.value,70);assert.equal(calls.filter(c=>c[0]==='update').length,0);await e.cancel.emit('click');
});

test('new UI tabs show only task-specific controls; cm/in switches preserve exact print plan',async()=>{
 const {elements:e,calls}=fixture();e.widthCM.value=20;await e.widthCM.emit('input');
 for(let i=0;i<5;i++){e.units.value='in';await e.units.emit('change');assert.ok(Math.abs(Number(e.widthCM.value)-20/2.54)<1e-6);e.units.value='cm';await e.units.emit('change');}
 assert.equal(Number(e.widthCM.value),20);await e.next.emit('click');assert.equal(calls.find(c=>c[0]==='begin')[2].widthCM,20);
  await e.tabColor.emit('click');assert.equal(e.colorControls.className,'control-card');assert.ok(!e.levelsControls.className.includes('hidden'));
  await e.tabDetails.emit('click');assert.equal(e.cleanupControls.className,'control-card');assert.equal(e.protectionControls.className,'control-card');await e.cancel.emit('click');
});
test('recipes save calibrated profiles, restore independent controls and reject invalid import without losing them',async()=>{
 const {elements:e,calls,storageFS,values}=fixture();e.recipeName.value='Algodón negro';e.profileMachine.value='Mimaki';e.profileCalibrated.checked=true;e.shadowBoost.value=25;e.cleanup.value='none';
 await e.saveRecipe.emit('click');const stored=JSON.parse(values['halftone-recipes-v1']);assert.equal(stored.recipes[0].profile.calibrated,true);assert.equal(stored.recipes[0].options.shadowBoost,25);
 e.recipeSelect.value=stored.recipes[0].id;e.shadowBoost.value=0;await e.applyRecipe.emit('click');assert.equal(Number(e.shadowBoost.value),25);
 storageFS.getFileForOpening=async()=>({read:async()=>'{"schema":"bad"}'});await e.importRecipes.emit('click');assert.match(e.status.textContent,/no compatible/);assert.equal(JSON.parse(values['halftone-recipes-v1']).recipes.length,1);
 await e.next.emit('click');e.halftone.checked=false;await e.halftone.emit('change');await e.apply.emit('click');assert.equal(calls.find(c=>c[0]==='update')[1].halftone,false);
});
test('flexible batch selectors, both sides and per-image knockout exceptions produce the correct jobs',async()=>{
 const {elements:e,calls}=fixture();await e.openBatch.emit('click');await e.batchFiles.emit('click');await e.batchFolder.emit('click');
 e.batchM.checked=false;e.batchL.checked=false;e.batchS.checked=true;e.batchXL.checked=true;await e.batchS.emit('change');e.batchBothSides.checked=true;await e.batchBothSides.emit('change');assert.match(e.batchCount.textContent,/8 resultados/);
 e.batchImageIndex.value='0';await e.batchImageIndex.emit('change');e.imageUseCommon.checked=false;for(const size of ['XS','S','M','L','XL','2XL','3XL','2','4','6','8','10','12'])e['imageSize'+size].checked=size==='3XL';
 for(const place of ['front','back','chest','sleeve','neck'])e['imagePosition'+place].checked=place==='chest';e.imageOwnColor.checked=true;e.imageKey.value='#ffffff';await e.saveAssignment.emit('click');assert.match(e.batchCount.textContent,/5 resultados/);
 await e.batchRun.emit('click');const jobs=calls.filter(c=>c[0]==='begin');assert.equal(jobs.length,5);assert.equal(jobs[0][2].key,'#ffffff');assert.match(e.batchProgress.textContent,/5 guardados/);
});
test('initial preparation cancellation remains available while controls are busy and preserves the source',async()=>{
 const {elements:e,host,calls}=fixture();let release;const gate=new Promise(r=>release=r);
 host.beginSession=async(_,o,progress)=>{calls.push(['beginSlow']);await gate;progress('screen',.2);throw Error('should not reach this');};
 const pending=e.next.emit('click');await Promise.resolve();assert.equal(e.cancelPreparation.disabled,false);await e.cancelPreparation.emit('click');release();await pending;
 assert.equal(e.prepareStage.className,'');assert.match(e.status.textContent,/detenida/);assert.equal(calls.filter(c=>c[0]==='cancel').length,0);assert.equal(e.cancelPreparation.className,'hidden');
});

test('one batch can assign adult and child sizes to different images without invalid hidden sizes',async()=>{
 const {elements:e,calls}=fixture();await e.openBatch.emit('click');await e.batchFiles.emit('click');await e.batchFolder.emit('click');
 e.batchImageIndex.value='0';await e.batchImageIndex.emit('change');e.imageGarment.value='child';await e.imageGarment.emit('change');
 assert.equal(e.imageSizeM.parentElement.className,'check hidden');assert.equal(e.imageSize4.parentElement.className,'check');
 await e.saveAssignment.emit('click');await e.batchRun.emit('click');const jobs=calls.filter(c=>c[0]==='begin');assert.equal(jobs.length,4);
 assert.equal(jobs[0][2].garment,'child');assert.equal(jobs[2][2].garment,'adult');assert.ok(jobs[0][2].widthCM<jobs[2][2].widthCM);
});

test('reference defaults, stage-one screen controls and compact editor share one settings model',async()=>{
 const {elements:e,calls}=fixture();assert.equal(Number(e.inputBlack.value),7);assert.equal(Number(e.inputMidtone.value),2);assert.equal(Number(e.inputWhite.value),100);
 assert.equal(Number(e.lpi.value),30);assert.equal(Number(e.angle.value),33);
 e.lpi.value=42;await e.lpi.emit('input');await e.next.emit('click');assert.equal(calls.find(c=>c[0]==='begin')[2].lpi,42);
 await e.editScreen.emit('click');assert.equal(Number(e.lpiEdit.value),42);e.angleEdit.value=18;await e.angleEdit.emit('input');assert.equal(Number(e.angle.value),18);
 await e.apply.emit('click');assert.equal(calls.find(c=>c[0]==='update')[1].angle,18);
});
test('four view buttons use the Photoshop workspace without retriggering screening',async()=>{
 const {elements:e,calls,host}=fixture();host.workspaceView=async(s,mode)=>calls.push(['workspace',mode]);host.clearWorkspace=async()=>calls.push(['clearWorkspace']);
 await e.next.emit('click');assert.ok(calls.some(c=>c[0]==='workspace'&&c[1]==='garment'));
 await e.viewMask.emit('click');await new Promise(r=>setTimeout(r,0));assert.equal(e.viewMode.value,'mask');assert.ok(calls.some(c=>c[0]==='workspace'&&c[1]==='mask'));
 await e.viewTransparent.emit('click');await new Promise(r=>setTimeout(r,0));assert.equal(e.viewMode.value,'transparent');assert.equal(calls.filter(c=>c[0]==='update').length,0);
 await e.apply.emit('click');assert.ok(calls.findIndex(c=>c[0]==='clearWorkspace')<calls.findIndex(c=>c[0]==='release'));
});
