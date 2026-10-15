/* Independent clustered screen engine. All distances and HEX colors are sRGB.
 * Raster coordinates use pixel centers, globally anchored to document origin.
 * No interpolation or antialiasing is performed on final alpha. */
'use strict';
const gainLib=require('./gain'),{fillHoles,minAreaFor}=require('./holes'),morph=require('./morph'),smooth=require('./smooth');
const SHAPES = ['round', 'euclidean', 'ellipse', 'square', 'diamond', 'line'];
const CLEANUP_MODES = ['area', 'opening'];
const LEVELS = {
  none: {alphaFloor: 0, minDiameterMM: 0},
  low: {alphaFloor: 0.01, minDiameterMM: 0.12},
  standard: {alphaFloor: 0.03, minDiameterMM: 0.20},
  high: {alphaFloor: 0.06, minDiameterMM: 0.30}
};
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
function hexRGB(hex) {
  if (!/^#?[0-9a-f]{6}$/i.test(hex)) throw Error('Escribe un HEX de seis dígitos, por ejemplo #000000.');
  const v = parseInt(hex.replace('#', ''), 16);
  return [v >> 16, (v >> 8) & 255, v & 255];
}
function validate(o) {
  const n = Object.assign({dpi: 300, lpi: 35, angle: 45, shape: 'round', cleanup: 'standard',
    knockout: true, key: '#000000', tolerance: 2, softness: 35, recover: false,
    strength: 100, gamma: 1, inputBlack: 0, inputMidtone: 1, inputWhite: 255,
    outputBlack: 0, outputWhite: 255, minDiameterMM: null, originX: 0, originY: 0,
    halftone:true,alphaThreshold:128,shadowBoost:0,colorBoost:0,defringe:false,defringeRadius:2,defringeStrength:100,edgeContrast:96,edgeRadius:1,fillHolesMM:0,solidAbove:100,gainPoints:'',measureSolid:false,lineTrim:0,cleanupMode:'area',presmooth:0}, o);
  n.protection = n.protection || 'off';
  if (!['off','edges','selection'].includes(n.protection)) throw Error('Protección de detalles inválida.');
  for (const [key, lo, hi] of [['dpi', 36, 2400], ['lpi', 5, 150], ['angle', -180, 180],
    ['tolerance', 0, 99], ['softness', 0.1, 100], ['strength', 1, 100], ['gamma', 0.25, 4],
    ['inputBlack', 0, 254], ['inputMidtone', 0.1, 9.99], ['inputWhite', 1, 255],
    ['outputBlack', 0, 255], ['outputWhite', 0, 255],['alphaThreshold',1,255],['shadowBoost',0,100],['colorBoost',0,100],
    ['defringeRadius',1,4],['defringeStrength',0,100],['edgeContrast',16,255],['edgeRadius',1,4],['fillHolesMM',0,1],['solidAbove',50,100],['lineTrim',0,10]]) {
    if (!Number.isFinite(n[key]) || n[key] < lo || n[key] > hi) throw Error(`${key}: usa un valor de ${lo} a ${hi}.`);
  }
  if (n.inputBlack >= n.inputWhite) throw Error('El negro de entrada debe ser menor que el blanco.');
  if (n.outputBlack > n.outputWhite) throw Error('El negro de salida debe ser menor o igual que el blanco.');
  if (!SHAPES.includes(n.shape) || !LEVELS[n.cleanup]) throw Error('Forma o nivel de limpieza inválidos.');
  if (!CLEANUP_MODES.includes(n.cleanupMode)) throw Error('Método de limpieza inválido.');
  if (![0, 1, 2].includes(n.presmooth)) throw Error('Suavizado previo: usa 0 (sin), 1 (gaussiano) o 2 (gaussiano y superficie).');
  if (n.halftone && n.dpi / n.lpi < 4) throw Error('Resolución insuficiente: se requieren al menos 4 píxeles por celda. Reduce LPI o aumenta resolución antes de procesar.');
  n.rgb = hexRGB(n.key);
  n.gainCurve = gainLib.parseGain(n.gainPoints);n.gainMap = gainLib.inverse(n.gainCurve);
  n.minDiameterMM = n.minDiameterMM == null ? LEVELS[n.cleanup].minDiameterMM : n.minDiameterMM;
  if (!Number.isFinite(n.minDiameterMM) || n.minDiameterMM < 0 || n.minDiameterMM > 2) throw Error('Diámetro mínimo: usa 0 a 2 mm.');
  if(n.cleanup==='none')n.minDiameterMM=0;
  if(!Number.isInteger(n.edgeRadius))throw Error('Radio de protección: usa píxeles enteros.');
  if(!Number.isInteger(n.defringeRadius))throw Error('Radio de borde: usa píxeles enteros.');
  if (![n.originX, n.originY].every(Number.isFinite)) throw Error('Origen inválido.');
  return n;
}
function boostedColor(rgb,n){
  const l=(.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2])/255;
  const lift=n.shadowBoost/100*(1-l)**2;
  const lifted=rgb.map(v=>v+(255-v)*lift),mean=lifted.reduce((a,b)=>a+b)/3;
  return lifted.map(v=>Math.round(clamp(mean+(v-mean)*(1+n.colorBoost/100),0,255)));
}
function cleanedEdge(input,w,h,x,y,c,n){
  const i=(y*w+x)*4,original=Array.from(input.subarray(i,i+3));
  if(!n.defringe || c.value>=.995)return original;
  let best=null,distance=Infinity,boundary=false;
  for(let dy=-n.defringeRadius;dy<=n.defringeRadius;dy++)for(let dx=-n.defringeRadius;dx<=n.defringeRadius;dx++){
    const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h||(!dx&&!dy))continue;
    const j=(ny*w+nx)*4,a=input[j+3],v=a?coverage(input[j],input[j+1],input[j+2],a,n).value:0;
    if(v<.01)boundary=true;
    const d=dx*dx+dy*dy;
    if(a>=250&&v>=.995&&d<distance){best=Array.from(input.subarray(j,j+3));distance=d;}
  }
  return best&&boundary?original.map((v,k)=>Math.round(v+(best[k]-v)*n.defringeStrength/100)):original;
}
// RGB of a printed pixel: knockout recovery, edge cleanup and color boost.
function paintInk(input,output,i,width,height,x,y,c,n){
  const edge=n.defringe?cleanedEdge(input,width,height,x,y,c,n):null;
  for (let k = 0; k < 3; k++) output[i + k] = n.recover && n.knockout && c.matte > 0
    ? Math.round(clamp((input[i + k] - (1 - c.matte) * n.rgb[k]) / c.matte, 0, 255)) : edge?edge[k]:input[i+k];
  if(n.shadowBoost||n.colorBoost)output.set(boostedColor(Array.from(output.subarray(i,i+3)),n),i);
  output[i + 3] = 255;
}
// Levels affect coverage, not RGB. Preserve exact knockout holes even when
// the output black point is lifted; otherwise garment pixels would reappear.
function adjustLevels(value, n) {
  if (value <= 0) return 0;
  const t = clamp((value * 255 - n.inputBlack) / (n.inputWhite - n.inputBlack));
  return (n.outputBlack + Math.pow(t, 1 / n.inputMidtone) * (n.outputWhite - n.outputBlack)) / 255;
}
// Final tone: dot-gain compensation, then coverage at or above solidAbove
// prints as solid (no tiny pores that ink or powder would close anyway).
function tone(v, n) {
  if (v <= 0) return 0;
  if (n.gainMap) v = n.gainMap(v);
  if (n.solidAbove < 100 && v >= n.solidAbove / 100) return 1;
  return v;
}
// CDF of distance from center inside a unit square: correct tone at >78% too.
function circleCDF(r) {
  if (r <= 0.5) return Math.PI * r * r;
  if (r >= Math.SQRT1_2) return 1;
  return Math.PI * r * r - 4 * (r * r * Math.acos(0.5 / r) - 0.5 * Math.sqrt(r * r - 0.25));
}
let ellipseCDF;
function makeEllipseCDF() {
  if (ellipseCDF) return ellipseCDF;
  const bins = 8192, count = 512, histogram = new Uint32Array(bins);
  // ratio 2:1; CDF normalizes occupancy over periodic cell, not just ellipse area.
  for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) {
    const u = (x + 0.5) / count - 0.5, v = (y + 0.5) / count - 0.5;
    histogram[Math.min(bins - 1, Math.floor((u * u + 4 * v * v) / 1.25 * bins))]++;
  }
  ellipseCDF = new Float32Array(bins);
  let sum = 0;
  for (let i = 0; i < bins; i++) {sum += histogram[i]; ellipseCDF[i] = sum / (count * count);}
  return ellipseCDF;
}
// Euclidean dot: a round dot that grows until it touches its neighbors at 50 %
// (checkerboard), then the gaps close as rounded holes. Spot function over the
// cell [-1, 1]^2, equalized by rank so that the printed area is linear in tone.
let euclideanCDF;
function makeEuclideanCDF() {
  if (euclideanCDF) return euclideanCDF;
  const bins = 8192, count = 512, histogram = new Uint32Array(bins);
  for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) {
    const index = euclideanBin(Math.abs((x + 0.5) / count - 0.5), Math.abs((y + 0.5) / count - 0.5), bins);
    histogram[index]++;
  }
  euclideanCDF = new Float32Array(bins);
  let sum = 0;
  for (let i = 0; i < bins; i++) {sum += histogram[i]; euclideanCDF[i] = sum / (count * count);}
  return euclideanCDF;
}
// u, v in [0, 0.5] (distance to the cell center). Key grows from the center
// (0), through the touching points at the middle of the edges (1), to the
// corners (2).
function euclideanBin(u, v, bins) {
  const x = 2 * u, y = 2 * v;
  const key = x + y <= 1 ? x * x + y * y : 2 - ((x - 1) ** 2 + (y - 1) ** 2);
  return Math.min(bins - 1, Math.floor(key / 2 * bins));
}
// `trim` (0..0.5) clips the line profile: tones up to `trim` print nothing and
// tones from 1 - trim print solid, so there are no 1 px filaments.
function threshold(u, v, shape, trim = 0) {
  u = Math.abs(u - Math.floor(u) - 0.5); v = Math.abs(v - Math.floor(v) - 0.5);
  switch (shape) {
    case 'euclidean': return makeEuclideanCDF()[euclideanBin(u, v, 8192)];
    case 'line': return trim ? trim + (1 - 2 * trim) * 2 * v : 2 * v;
    case 'square': return 4 * Math.max(u, v) ** 2;
    case 'diamond': {const s = u + v; return s <= 0.5 ? 2 * s * s : 1 - 2 * (1 - s) ** 2;}
    case 'ellipse': return makeEllipseCDF()[Math.min(8191, Math.floor((u * u + 4 * v * v) / 1.25 * 8192))];
    default: return circleCDF(Math.sqrt(u * u + v * v));
  }
}
function coverage(r, g, b, a, n) {
  let opacity = a / 255, matte = 1;
  if (n.knockout) {
    const distance = Math.hypot(r - n.rgb[0], g - n.rgb[1], b - n.rgb[2]) / (255 * Math.sqrt(3));
    const t = clamp((distance - n.tolerance / 100) / (n.softness / 100));
    opacity *= t * t * (3 - 2 * t);
    if (n.recover) {
      // Minimal gamut-feasible alpha solving C = a*F + (1-a)*garment.
      const rgb = [r, g, b];
      matte = 0;
      for (let k = 0; k < 3; k++) {
        const d = rgb[k] - n.rgb[k];
        matte = Math.max(matte, d >= 0 ? d / (255 - n.rgb[k] || 1) : -d / (n.rgb[k] || 1));
      }
      matte = clamp(matte);
      opacity *= matte;
    }
  }
  const raw = Math.pow(opacity, 1 / n.gamma) * n.strength / 100;
  return {value: tone(adjustLevels(raw, n), n), matte, raw};
}
// Removes isolated solid components, using 8-connectivity. Equivalent-area
// diameter is a particle filter, NOT a guarantee of minimum line width.
async function removeParticles(data, w, h, minArea, hook, protectedMask) {
  if (minArea <= 1) return {removedPixels: 0, removedComponents: 0};
  const visited = new Uint8Array(w * h), queue = new Int32Array(w * h);
  let removedPixels = 0, removedComponents = 0;
  for (let start = 0; start < w * h; start++) {
    if (start % (w * 64) === 0 && hook) await hook('cleanup', start / (w * h));
    if (visited[start] || !data[start * 4 + 3]) continue;
    visited[start] = 1; queue[0] = start;
    let tail = 1, protectedComponent = false;
    for (let head = 0; head < tail; head++) {
      const p = queue[head], x = p % w, y = Math.floor(p / w);
      if (protectedMask && protectedMask[p]) protectedComponent = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (!visited[q] && data[q * 4 + 3]) {visited[q] = 1; queue[tail++] = q;}
      }
      if (head && head % 262144 === 0 && hook) await hook('cleanup', start / (w * h));
    }
    if (tail < minArea && !protectedComponent) {
      for (let i = 0; i < tail; i++) data.fill(0, queue[i] * 4, queue[i] * 4 + 4);
      removedPixels += tail; removedComponents++;
    }
  }
  return {removedPixels, removedComponents};
}
// Morphological opening on the printed alpha (see morph.js). Only removes ink.
async function openingCleanup(output, width, height, n, protectedMask, hook) {
  const params = morph.openingParams(n);
  if (!params) return {removedPixels: 0, removedComponents: null};
  const mask = new Uint8Array(width * height);
  for (let p = 0; p < mask.length; p++) mask[p] = output[p * 4 + 3];
  const result = await morph.openMask(mask, width, height, params, protectedMask, hook);
  for (let p = 0; p < mask.length; p++) if (!mask[p] && output[p * 4 + 3]) output.fill(0, p * 4, p * 4 + 4);
  return result;
}
// Coverage before levels, smoothed (smooth.js). Same quantization as LiveRenderer.
function smoothedPlane(input, width, height, n) {
  const plane = new Uint16Array(width * height);
  for (let p = 0; p < plane.length; p++) {
    const i = p * 4; if (!input[i + 3]) continue;
    const raw = coverage(input[i], input[i + 1], input[i + 2], input[i + 3], n).raw;
    plane[p] = raw > 0 ? Math.max(1, Math.min(65535, Math.round(raw * 65535))) : 0;
  }
  return smooth.smoothCoverage(plane, width, height, {mode: n.presmooth, alpha: {data: input, stride: 4, offset: 3}, originX: n.originX, originY: n.originY});
}
async function processRGBA(input, width, height, options = {}, hook) {
  if (!(input instanceof Uint8Array) || input.length !== width * height * 4 || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw Error('Buffer RGBA inválido.');
  const n = validate(options), output = new Uint8Array(input.length),removedMask=new Uint8Array(width*height);
  if(n.protection==='selection' && (!(n.protectMask instanceof Uint8Array)||n.protectMask.length!==width*height)) throw Error('Captura una selección del origen para proteger detalles.');
  const protectedMask=n.protection==='off'?null:new Uint8Array(width*height);
  const region=n.statsRegion||{left:0,top:0,width,height};
  let regionScreenPixels=0,regionProtectedPixels=0;
  const radians = n.angle * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians), cell = n.dpi / n.lpi;
  let inkPixels = 0,solidPixels=0;
  const holeArea=n.halftone?minAreaFor(n.fillHolesMM,n.dpi):1,candidate=holeArea>1?new Uint8Array(width*height):null;
  const plane=n.presmooth?smoothedPlane(input,width,height,n):null;
  for (let y = 0; y < height; y++) {
    if (hook && y % 32 === 0) await hook('screen', y / height);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!input[i + 3]) continue;
      const c = coverage(input[i], input[i + 1], input[i + 2], input[i + 3], n);
      const solidRaw = c.raw;
      if (plane) {c.raw = plane[y * width + x] / 65535; c.value = tone(adjustLevels(c.raw, n), n);}
      const inRegion=x>=region.left&&x<region.left+region.width&&y>=region.top&&y<region.top+region.height;
      if(n.measureSolid&&inRegion&&solidRaw>=.5)solidPixels++;
      let protectedPixel=n.protection==='selection' && n.protectMask[y*width+x]>=128 && input[i+3]>=128;
      if(n.protection==='edges' && input[i+3]>=250 && c.value>0) {
        // Only hard source edges, not halftone edges. Exact knockout colors
        // stay removed. Semi-transparent gradients keep their normal screen.
        for(let dy=-n.edgeRadius;dy<=n.edgeRadius&&!protectedPixel;dy++)for(let dx=-n.edgeRadius;dx<=n.edgeRadius;dx++) {
          const nx=x+dx,ny=y+dy;if((!dx&&!dy)||nx<0||ny<0||nx>=width||ny>=height)continue;
          const j=(ny*width+nx)*4;
          if(input[j+3]<128 || (input[j+3]>=250&&Math.hypot(input[i]-input[j],input[i+1]-input[j+1],input[i+2]-input[j+2])>=n.edgeContrast)){protectedPixel=true;break;}
        }
      }
      if(protectedPixel) {
        output[i]=input[i];output[i+1]=input[i+1];output[i+2]=input[i+2];output[i+3]=255;removedMask[y*width+x]=1;protectedMask[y*width+x]=255;inkPixels++;
        if(inRegion){regionScreenPixels++;regionProtectedPixels++;}continue;
      }
      if (c.value < LEVELS[n.cleanup].alphaFloor || c.value <= 0) continue;
      if(candidate)candidate[y*width+x]=1;
      if(n.halftone) {
        // Solid coverage does not need a screen threshold; preserve exact tones.
        if(c.value<1) {
          const gx=x+n.originX+0.5,gy=y+n.originY+0.5;
          if(c.value<=threshold((gx*cos+gy*sin)/cell,(-gx*sin+gy*cos)/cell,n.shape,n.lineTrim/100))continue;
        }
      } else if(c.value*255<n.alphaThreshold)continue;
      paintInk(input,output,i,width,height,x,y,c,n);removedMask[y*width+x]=1; inkPixels++;
      if(inRegion)regionScreenPixels++;
    }
  }
  const diameterPX = n.minDiameterMM / 25.4 * n.dpi;
  const minArea = n.cleanupMode === 'opening' ? 1 : Math.max(1, Math.ceil(Math.PI * (diameterPX / 2) ** 2));
  const cleanup = n.cleanupMode === 'opening' ? await openingCleanup(output, width, height, n, protectedMask, hook)
    : await removeParticles(output, width, height, minArea, hook, protectedMask);
  let filled=0;
  if(candidate){
    const result=await fillHoles({data:output,stride:4,offset:3,candidate,width,height,minArea:holeArea,hook,onFill:p=>{
      const x=p%width,y=(p-x)/width,i=p*4;paintInk(input,output,i,width,height,x,y,coverage(input[i],input[i+1],input[i+2],input[i+3],n),n);
      removedMask[p]=1;if(x>=region.left&&x<region.left+region.width&&y>=region.top&&y<region.top+region.height)regionScreenPixels++;
    }});filled=result.filledPixels;
  }
  for(let p=0;p<width*height;p++)if(output[p*4+3])removedMask[p]=0;
  let regionInkPixels=0;
  for(let y=region.top;y<region.top+region.height;y++)for(let x=region.left;x<region.left+region.width;x++)if(output[(y*width+x)*4+3])regionInkPixels++;
  return {data: output,removedMask,protectedMask, width, height, stats: Object.assign({cellPX: cell, minArea,
    minDiameterMM: n.minDiameterMM, inkPixels: inkPixels - cleanup.removedPixels + filled,
    protectedPixels:regionProtectedPixels,regionInkPixels,regionProtectedPixels,regionScreenPixels,regionRemovedPixels:regionScreenPixels-regionInkPixels,
    coveragePercent: (inkPixels - cleanup.removedPixels + filled) / (width * height) * 100}, candidate?{filledPixels:filled}:null, n.measureSolid?{solidPixels}:null, cleanup)};
}
function composite(rgba, width, height, background) {
  const out = new Uint8Array(width * height * 3);
  for (let p = 0; p < width * height; p++) {
    const checker=background?0:(Math.floor((p%width)/12)%2===Math.floor(Math.floor(p/width)/12)%2?190:230);
    const a=rgba[p*4+3]/255;
    for(let k=0;k<3;k++)out[p*3+k]=Math.round(rgba[p*4+k]*a+(background?background[k]:checker)*(1-a));
  }
  return out;
}
module.exports = {SHAPES, CLEANUP_MODES, LEVELS, hexRGB, validate, adjustLevels, tone, threshold, coverage, cleanedEdge, processRGBA, composite, boostedColor};
