'use strict';
const {validate}=require('./engine');
function estimate(size,options={}){
  const pixels=size.width*size.height,disk=options.memoryMode==='disk'||pixels>16000000;
  const cacheBytes=disk?pixels*(options.protection==='selection'?9:8):0;
  return {pixels,megapixels:pixels/1e6,disk,cacheBytes,workingBytes:disk?32e6:pixels*14,
    recommendedDiskBytes:Math.ceil(cacheBytes*1.25+pixels*4),upscaled:!!size.upscaled};
}
function warnings(options,stats){
  const n=validate({...options,dpi:300}),messages=[];
  const diameter=n.minDiameterMM/25.4*300,area=Math.max(1,Math.ceil(Math.PI*(diameter/2)**2));
  if(n.halftone&&n.cleanup!=='none'&&area/(300/n.lpi)**2>.2)
    messages.push('La limpieza puede borrar tonos de cobertura baja a esta lineatura. Reduce el diámetro, LPI o usa Sin limpieza.');
  if(stats){const before=stats.inkPixels+stats.removedPixels,loss=before?stats.removedPixels/before*100:0;
    if(loss>=5)messages.push(`La limpieza eliminó ${loss.toFixed(1)}% de los píxeles de trama. Revisa la vista Eliminado.`);
    if(!stats.inkPixels)messages.push('Resultado vacío: no se puede exportar.');
  }
  if(n.protection==='edges')messages.push('La protección puede solidificar bordes y trazos. Comprueba su anchura al 100% y en la carta impresa.');
  if(n.protection==='selection')messages.push('La selección conserva color sólido incluso si coincide con el knockout.');
  if(!n.halftone)messages.push('Sin trama: el umbral convierte los degradados en recortes sólidos.');
  return messages;
}
function preflight(size,options={},diskBudgetGB=0){
  validate({...options,dpi:300});const resources=estimate(size,options),messages=warnings(options);
  if(size.upscaled)messages.push('Ampliación: no se recupera detalle perdido del original.');
  if(diskBudgetGB>0&&resources.recommendedDiskBytes>diskBudgetGB*1e9)throw Error('El presupuesto de disco indicado es insuficiente para caché y salida.');
  return {resources,messages};
}
module.exports={estimate,warnings,preflight};
