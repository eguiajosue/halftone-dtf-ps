'use strict';
const CONTROL_SELECTOR='input,select,button,sp-slider,sp-button,sp-action-button,sp-checkbox,sp-textfield';
const REQUIRED=['sp-theme','sp-button','sp-action-button','sp-checkbox','sp-textfield'];
function report(document,message,{error=false}={}){
  try{
    const banner=document.getElementById&&document.getElementById('errorBanner'),status=document.getElementById&&document.getElementById('status');
    if(banner)banner.textContent=message;if(status)status.textContent=message;
  }catch(_){}
  void error;
}
// Never block the panel. Photoshop provides native Spectrum widgets, so a
// Spectrum tag missing from customElements is not a reason to disable every
// control: start anyway and say so. A crash while starting is shown in the
// red banner instead of leaving silent, half-connected controls.
function bootstrap(document,registry,start){
  const missing=REQUIRED.filter(tag=>!registry||!registry.get(tag));
  try{start();}
  catch(e){
    const where=e&&e.stack?String(e.stack).split('\n').slice(0,5).map(line=>line.trim().replace(/^at /,'').replace(/\(?(?:uxp|plugin|file):\/\/[^)]*\//g,'(')).join(' · '):'';
    report(document,'Error al iniciar el panel: '+(e&&e.message||e)+(where?' ['+where+']':''),{error:true});
    return false;
  }
  if(missing.length)report(document,'Modo compatible: no se registraron los controles Spectrum ('+missing.join(', ')+'). El panel usa los controles nativos de Photoshop.');
  return true;
}
module.exports={CONTROL_SELECTOR,REQUIRED,bootstrap,report};
