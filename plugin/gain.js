'use strict';
/* Dot-gain compensation. The user prints the calibration chart, measures the
 * coverage that actually prints for each nominal tone and enters pairs
 * "nominal:measured" (percent), e.g. "10:14, 30:41, 50:63, 70:80, 90:94".
 * The inverse of that curve is applied to the desired coverage, so asking for
 * 30 % prints about 30 % instead of 41 %. Pure functions, no host access. */
const MAX_POINTS=10;
function parseGain(source){
  if(source==null)return null;
  const text=Array.isArray(source)?source.map(p=>p.join(':')).join(','):String(source);
  if(!text.trim())return null;
  const parts=text.split(/[\s,;]+/).filter(Boolean);
  if(parts.length>MAX_POINTS)throw Error(`Calibración: usa como máximo ${MAX_POINTS} pares nominal:medido.`);
  const points=parts.map(part=>{
    const m=/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(part);
    if(!m)throw Error(`Calibración: «${part}» no es un par nominal:medido, por ejemplo 30:41.`);
    return [Number(m[1]),Number(m[2])];
  }).sort((a,b)=>a[0]-b[0]);
  let previous=[0,0];
  for(const [nominal,measured] of points){
    if(!(nominal>0&&nominal<100))throw Error('Calibración: el tono nominal debe estar entre 0 y 100 (sin incluir).');
    if(!(measured>=0&&measured<=100))throw Error('Calibración: el valor medido debe estar entre 0 y 100.');
    if(nominal<=previous[0])throw Error('Calibración: no repitas el mismo tono nominal.');
    if(measured<=previous[1])throw Error('Calibración: el valor medido debe crecer con el tono (revisa '+nominal+':'+measured+').');
    previous=[nominal,measured];
  }
  if(previous[1]>=100)throw Error('Calibración: el último valor medido debe ser menor que 100.');
  return points;
}
// Desired printed coverage (0..1) -> nominal coverage (0..1) to request.
function inverse(points){
  if(!points||!points.length)return null;
  const xs=[0,...points.map(p=>p[1]),100],ys=[0,...points.map(p=>p[0]),100];
  return v=>{
    const d=v*100;if(d<=0)return 0;if(d>=100)return 1;
    let i=1;while(xs[i]<d)i++;
    return (ys[i-1]+(ys[i]-ys[i-1])*(d-xs[i-1])/(xs[i]-xs[i-1]))/100;
  };
}
// Table for the settings panel: what will be requested for common tones.
function summary(points,tones=[10,30,50,70,90]){
  const f=inverse(points);if(!f)return '';
  return 'Para imprimir '+tones.join(' / ')+' % se pedirá '+tones.map(t=>(f(t/100)*100).toFixed(0)).join(' / ')+' %.';
}
module.exports={parseGain,inverse,summary,MAX_POINTS};
