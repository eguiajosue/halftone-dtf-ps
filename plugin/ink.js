'use strict';
/* Per-piece ink and cost estimate from printed coverage. The consumption
 * figures are editable starting points: calibrate them with your printer's
 * ink counter (ml used / m² printed at full coverage). White is assumed under
 * every printed pixel at the same density. No data leaves the panel. */
const DEFAULTS={inkColorMLm2:8,inkWhiteMLm2:12,inkColorPriceL:0,inkWhitePriceL:0,filmPriceM2:0};
const IDS=Object.keys(DEFAULTS);
const num=(v,d)=>Number.isFinite(v)&&v>=0?v:d;
function normalize(o={}){const out={};for(const k of IDS)out[k]=num(Number(o[k]),DEFAULTS[k]);return out;}
// stats: coveragePercent of the whole frame, optional solidPixels (art that a
// screenless job would print solid). size: width/height px and widthCM/heightCM.
function estimate(stats,size,options){
  const p=normalize(options),total=size.width*size.height,areaCM2=size.widthCM*size.heightCM;
  const fraction=Math.max(0,Math.min(1,stats.coveragePercent/100));
  const solidFraction=stats.solidPixels==null?null:Math.max(fraction,Math.min(1,stats.solidPixels/total));
  const inkCost=f=>{const m2=areaCM2*f/1e4;return {colorML:m2*p.inkColorMLm2,whiteML:m2*p.inkWhiteMLm2,
    cost:m2*p.inkColorMLm2*p.inkColorPriceL/1000+m2*p.inkWhiteMLm2*p.inkWhitePriceL/1000};};
  const now=inkCost(fraction),solid=solidFraction==null?null:inkCost(solidFraction),film=areaCM2/1e4*p.filmPriceM2;
  const priced=p.inkColorPriceL>0||p.inkWhitePriceL>0||p.filmPriceM2>0;
  return {areaCM2,printedPercent:fraction*100,solidPercent:solidFraction==null?null:solidFraction*100,colorML:now.colorML,whiteML:now.whiteML,
    inkCost:now.cost,filmCost:film,totalCost:now.cost+film,priced,
    savingsPercent:solid&&solidFraction>0?(1-fraction/solidFraction)*100:null,
    savedInkCost:solid?solid.cost-now.cost:null,solidColorML:solid?solid.colorML:null,solidWhiteML:solid?solid.whiteML:null};
}
function describe(e){
  const ml=v=>v>=10?v.toFixed(1):v.toFixed(2);
  let text=`Tinta por pieza · color ${ml(e.colorML)} ml · blanca ${ml(e.whiteML)} ml · cubre ${e.printedPercent.toFixed(0)} % del área`;
  if(e.savingsPercent!=null&&e.savingsPercent>=1)text+=` · ${e.savingsPercent.toFixed(0)} % menos tinta que sin trama`;
  if(e.priced)text+=` · costo ${e.totalCost.toFixed(2)}`+(e.filmCost>0?' (incluye film y polvo)':'');
  return text+'.';
}
module.exports={DEFAULTS,IDS,normalize,estimate,describe};
