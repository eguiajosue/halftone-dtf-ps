'use strict';
const {hexRGB}=require('./engine');
function pickerHex(result){
  if(!result||result.result===-128)return null;
  if(result._obj==='error')throw Error(result.message||'No se pudo abrir el selector de color.');
  const c=result.RGBFloatColor;if(!c)return null;
  const rgb=[c.red??(c.redFloat==null?NaN:c.redFloat*255),c.grain??c.green??(c.greenFloat==null?NaN:c.greenFloat*255),c.blue??(c.blueFloat==null?NaN:c.blueFloat*255)];
  if(!rgb.every(Number.isFinite))throw Error('Photoshop devolvió un color no compatible. Usa un HEX sRGB.');
  return '#'+rgb.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
}
async function pickColor(hex,title='Color a eliminar'){
  const {core,action}=require('photoshop'),[red,grain,blue]=hexRGB(hex);
  try{return await core.executeAsModal(async()=>{
    const [result]=await action.batchPlay([{_obj:'showColorPicker',_target:[{_ref:'application'}],context:title,color:{_obj:'RGBColor',red,grain,blue}}],{});
    return pickerHex(result);
  },{commandName:title});}catch(e){if(e.number===-128||e.result===-128)return null;throw e;}
}
module.exports={pickerHex,pickColor};
