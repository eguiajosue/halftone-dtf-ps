'use strict';
const {createChecker,RELEASES}=require('./updates');
function initUpdates({get,preferences,fetchImpl,photoshop,open}){
  const manifest=require('./manifest.json'),distribution=require('./distribution.json');
  const text=get('updateStatus'),button=get('checkUpdates'),automatic=get('autoCheckUpdates'),download=get('openUpdate');
  let checking=false,locked=false,target=RELEASES;
  get('pluginVersion').textContent=`Halftone DTF ${manifest.version}`;
  get('toggleUpdates').addEventListener('click',()=>{const p=get('updatesPanel');p.className=p.className==='hidden'?'':'hidden';});
  const launch=async()=>{try{const result=await open(target,'Abrir la distribución de Halftone DTF. La instalación la gestiona Adobe Creative Cloud.');if(result)throw Error(result);}catch(e){text.textContent=e.message||String(e);}};
  download.addEventListener('click',launch);
  if(distribution.channel==='marketplace'){
    automatic.checked=false;automatic.disabled=true;button.disabled=true;
    text.textContent='Esta edición se actualiza desde Creative Cloud Marketplace.';
    target=distribution.marketplaceUrl;download.textContent='Abrir Marketplace';download.disabled=!target;
    return {sync(){automatic.disabled=true;button.disabled=true;download.disabled=!target;}};
  }
  try{automatic.checked=preferences.getItem('halftone-auto-check-v1')!=='false';}catch(_){automatic.checked=true;}
  const checker=createChecker({fetchImpl,installed:manifest,photoshop,read:k=>preferences.getItem(k),write:(k,v)=>preferences.setItem(k,v)});
  async function check(force){
    checking=true;button.disabled=true;
    if(force)text.textContent='Buscando versión estable…';
    try{
      const result=await checker.check(force);if(result.skipped)return;
      const update=result.update;
      if(update){
        target=update.url;download.textContent='Ver actualización';
        text.textContent=update.compatible?`Disponible ${update.version}. El actualizador de Windows puede instalarla con Photoshop cerrado.`:`La versión ${update.version} requiere Photoshop ${update.minPhotoshop} o posterior.`;
        get('updateNotice').textContent=`Nueva versión ${update.version}`;get('updateNotice').className='hint';
      }else{
        target=RELEASES;download.textContent='Abrir releases';get('updateNotice').className='hidden';
        text.textContent=result.empty?'Aún no hay un instalador estable publicado.':'Tu versión está al día.';
      }
    }catch(e){text.textContent=force?(e.message||String(e)):'No se pudo comprobar una actualización verificada. Puedes seguir trabajando.';}
    finally{checking=false;button.disabled=locked;}
  }
  button.addEventListener('click',()=>check(true));
  automatic.addEventListener('change',()=>{try{preferences.setItem('halftone-auto-check-v1',String(automatic.checked));}catch(_){}if(automatic.checked&&fetchImpl)check(false);});
  get('updaterGuide').addEventListener('click',async()=>{
    try{const result=await open('https://github.com/eguiajosue/halftone-dtf-ps/blob/design/ux-ui-proposal/docs/INSTALACION-Y-ACTUALIZACIONES.md','Abrir la guía de instalación y actualizaciones de Halftone DTF.');if(result)throw Error(result);}catch(e){text.textContent=e.message||String(e);}
  });
  text.textContent='Las consultas no envían imágenes ni ajustes. La instalación automática se activa una vez en Windows.';
  if(automatic.checked&&fetchImpl)check(false);
  return {sync(busy){locked=busy;button.disabled=busy||checking;},check};
}
module.exports={initUpdates};
