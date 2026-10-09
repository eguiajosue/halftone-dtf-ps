'use strict';
const {validate,hexRGB}=require('./engine');
const NUMBERS=['lpi','angle','tolerance','softness','inputBlack','inputMidtone','inputWhite','outputBlack','outputWhite','minDiameterMM',
 'alphaThreshold','shadowBoost','colorBoost','defringeRadius','defringeStrength','edgeContrast','edgeRadius','widthCM','heightCM','focusX','focusY','comparePosition','mockupChestCM','mockupHeightCM','mockupX','mockupY','diskBudgetGB'];
const BOOLS=['knockout','recover','halftone','defringe','linkBackground','trimArt','convertCopy'];
const STRINGS=['key','shape','cleanup','memoryMode','protection','viewMode','previewColor','sizeAxis','placement','shirtSize','garment','units','previewScope'];
const text=(v,max=120)=>String(v||'').trim().slice(0,max);
function options(raw={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Receta inválida.');
  const out={};for(const k of NUMBERS)if(raw[k]!=null){if(!Number.isFinite(raw[k]))throw Error('Valor numérico inválido: '+k);out[k]=raw[k];}
  for(const k of BOOLS)if(raw[k]!=null){if(typeof raw[k]!=='boolean')throw Error('Valor booleano inválido: '+k);out[k]=raw[k];}
  for(const k of STRINGS)if(raw[k]!=null){if(typeof raw[k]!=='string'||raw[k].length>80)throw Error('Texto inválido: '+k);out[k]=raw[k];}
  validate(out);
  const enums={memoryMode:['auto','disk'],protection:['off','edges','selection'],units:['cm','in'],garment:['adult','child'],sizeAxis:['width','height'],placement:['front','back','chest','sleeve','neck'],previewScope:['detail','overview','mockup'],viewMode:['original','garment','beforeGarment','compare','transparent','mask','removed','protection']};
  for(const [key,values]of Object.entries(enums))if(out[key]!=null&&!values.includes(out[key]))throw Error('Opción inválida: '+key);
  if(out.previewColor)hexRGB(out.previewColor);
  for(const k of ['widthCM','heightCM'])if(out[k]!=null&&(out[k]<=0||out[k]>1000))throw Error('Medida de receta inválida.');
  for(const k of ['focusX','focusY','comparePosition','mockupX','mockupY'])if(out[k]!=null&&(out[k]<0||out[k]>100))throw Error('Porcentaje inválido.');
  return out;
}
function areas(raw={}){
  const out={};for(const [position,sizes]of Object.entries(raw)){
    if(!['front','back','chest','sleeve','neck'].includes(position))throw Error('Posición de perfil inválida.');out[position]={};
    for(const [size,a]of Object.entries(sizes)){
      if(!['XS','S','M','L','XL','2XL','3XL','2','4','6','8','10','12'].includes(size)||!Array.isArray(a)||a.length!==2||!a.every(v=>Number.isFinite(v)&&v>0&&v<=100))throw Error('Área de perfil inválida.');
      out[position][size]=a.slice();
    }
  }return out;
}
function entry(raw){
  if(!raw||typeof raw!=='object')throw Error('Preset inválido.');
  const name=text(raw.name,80);if(!name)throw Error('Escribe un nombre para la receta.');
  return {id:text(raw.id,80)||'recipe-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),name,options:options(raw.options),areas:areas(raw.areas),
    profile:{brand:text(raw.profile?.brand),model:text(raw.profile?.model),rip:text(raw.profile?.rip),machine:text(raw.profile?.machine),material:text(raw.profile?.material),calibrated:raw.profile?.calibrated===true}};
}
function parse(source){
  if(source.length>2e6)throw Error('Archivo de recetas demasiado grande.');const data=JSON.parse(source);
  if(data.schema!=='halftone-recipes'||data.version!==1||!Array.isArray(data.recipes)||data.recipes.length>100)throw Error('Formato de recetas no compatible.');
  return data.recipes.map(entry);
}
function serialize(recipes){return JSON.stringify({schema:'halftone-recipes',version:1,recipes:recipes.map(entry)},null,2);}
module.exports={options,entry,parse,serialize,areas,NUMBERS,BOOLS,STRINGS};
