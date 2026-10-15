'use strict';
/* Factory presets: starting points for common DTF jobs, not universal
 * calibrations. They set the look (screen, levels, knockout, cleanup, pores)
 * and never touch size, garment color, calibration curve or ink costs. */
const {validate}=require('./engine');
const BASE={shape:'round',lpi:30,angle:33,cleanup:'standard',minDiameterMM:.2,inputBlack:7,inputMidtone:2,inputWhite:100,outputBlack:0,outputWhite:255,
  shadowBoost:0,colorBoost:0,knockout:true,key:'#000000',tolerance:2,softness:35,recover:false,defringe:false,halftone:true,fillHolesMM:0,solidAbove:100,protection:'off',lineTrim:0,cleanupMode:'area',presmooth:0};
const NEUTRAL={inputBlack:0,inputMidtone:1,inputWhite:255};
const PRESETS=[
 {id:'dark-photo',name:'Camiseta negra · foto',note:'Arte con fondo negro: quita el negro, 30 LPI a 33°, cierra poros de sombras y pasa a sólido sobre 95 %.',
  options:{fillHolesMM:.25,solidAbove:95}},
 {id:'dark-fine',name:'Camiseta negra · detalle fino',note:'40 LPI a 22,5°, limpieza baja. Exige buena adherencia de puntos pequeños: prueba de lavado.',
  options:{lpi:40,angle:22.5,cleanup:'low',minDiameterMM:.12,fillHolesMM:.2,solidAbove:97}},
 {id:'light-logo',name:'Camiseta blanca · logo y color',note:'Quita el blanco del fondo, 35 LPI a 45° y niveles neutros para conservar los tonos.',
  options:{key:'#ffffff',lpi:35,angle:45,cleanup:'low',minDiameterMM:.12,softness:25,...NEUTRAL}},
 {id:'vintage',name:'Vintage desgastado',note:'Trama gruesa de 25 LPI y niveles que levantan el negro: aspecto de estampado gastado.',
  options:{lpi:25,angle:45,cleanup:'low',minDiameterMM:.12,inputBlack:20,inputMidtone:1.4,inputWhite:190}},
 {id:'engraving',name:'Líneas · estilo grabado',note:'Trama de líneas a 45°; funciona mejor con arte de alto contraste.',
  options:{shape:'line',lpi:30,angle:45,fillHolesMM:.2,lineTrim:3}},
 {id:'dark-euclid',name:'Camiseta negra · punto euclidiano',note:'Punto euclidiano a 30 LPI y 33°, suavizado previo que aplana la textura fina y limpieza por apertura cuyo radio sigue la lineatura.',
  options:{shape:'euclidean',presmooth:2,cleanupMode:'opening',fillHolesMM:.25,solidAbove:95}},
 {id:'knockout-only',name:'Solo quitar fondo · sin trama',note:'Elimina el color elegido y deja el resto sólido; sin semitonos.',
  options:{halftone:false,cleanup:'none',minDiameterMM:0,...NEUTRAL}}
];
function find(id){return PRESETS.find(p=>p.id===id)||null;}
// Complete, validated option set for a preset; throws if a preset is invalid.
function optionsFor(id){
  const preset=find(id);if(!preset)throw Error('Preset desconocido.');
  const options={...BASE,...preset.options};validate({...options,dpi:300});return options;
}
module.exports={PRESETS,BASE,find,optionsFor};
