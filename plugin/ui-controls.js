'use strict';
const CONTROL_SELECTOR='input,select,button,sp-slider,sp-button,sp-action-button,sp-checkbox,sp-textfield';
const REQUIRED=['sp-theme','sp-button','sp-action-button','sp-checkbox','sp-textfield'];
function bootstrap(document,registry,start){
 const missing=REQUIRED.filter(tag=>!registry||!registry.get(tag));
 if(missing.length){
  for(const control of Array.from(document.querySelectorAll(CONTROL_SELECTOR)))control.disabled=true;
  document.getElementById('status').textContent='No se pudieron cargar los controles Spectrum. Reinstala el paquete completo del plugin y reinicia Photoshop.';
  return false;
 }
 start();return true;
}
module.exports={CONTROL_SELECTOR,REQUIRED,bootstrap};
