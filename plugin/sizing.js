'use strict';
const OUTPUT_DPI = 300;
const MAX_OUTPUT_PIXELS = 128000000;
const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
// Adjustable workshop starting points, NOT a manufacturer-issued size chart.
// General area references: STAHLS 12x14 in and Transfer Express standard/jumbo.
const PRESETS = {
  front: {label: 'Frontal completo', areas: [[22,28],[24,30],[27,33],[29,35],[30,35.5],[31,38],[31.5,40]]},
  back: {label: 'Espalda completa', areas: [[24,30],[26,32],[28,34],[30,35.5],[30,35.5],[31,38],[31.5,40]]}
};
// Workshop starting points for additional positions; verify on the garment.
for(const [key,label,area] of [['chest','Pecho izquierdo',[10,10]],['sleeve','Manga',[8,10]],['neck','Nuca',[8,5]]])
  PRESETS[key]={label,areas:SIZES.map(()=>area.slice())};
const CHILD_SIZES=['2','4','6','8','10','12'];
function garmentArea(placement,size,garment='adult',custom){
  if(!PRESETS[placement])throw Error('Posición inválida.');
  if(!['adult','child'].includes(garment))throw Error('Tipo de prenda inválido.');
  if(!(garment==='child'?CHILD_SIZES:SIZES).includes(size))throw Error('Talla inválida para la prenda.');
  if(custom)return custom;
  if(garment==='child'){
    const i=CHILD_SIZES.indexOf(size);if(i<0)throw Error('Talla infantil inválida.');
    return ['front','back'].includes(placement)?[16+i*1.5,20+i*2]:PRESETS[placement].areas[0].map(v=>v*.75);
  }
  const i=SIZES.indexOf(size);if(i<0)throw Error('Talla inválida.');
  return PRESETS[placement].areas[i].slice();
}
function axisWeights(position,scale,limit){
  if(scale>1){
    const start=position*scale,end=Math.min(limit,(position+1)*scale),out=[];
    for(let p=Math.floor(start);p<Math.ceil(end);p++)out.push([p,(Math.min(end,p+1)-Math.max(start,p))/scale]);
    return out;
  }
  const f=Math.max(0,Math.min(limit-1,(position+.5)*scale-.5)),p=Math.floor(f),d=f-p;
  return [[p,1-d],[Math.min(limit-1,p+1),d]];
}
function aspect(width, height) {
  if (![width,height].every(n=>Number.isFinite(n) && n>0)) throw Error('Dimensiones de origen inválidas.');
  return width / height;
}
function proportional(width, height, axis, cm) {
  const ratio=aspect(width,height);
  if (!Number.isFinite(cm) || cm <= 0 || cm > 100) throw Error('Medida final: usa más de 0 y hasta 100 cm.');
  return axis === 'height' ? {widthCM:cm*ratio,heightCM:cm} : {widthCM:cm,heightCM:cm/ratio};
}
function fitPreset(width, height, placement, size) {
  const p=PRESETS[placement], index=SIZES.indexOf(size);
  if (!p || index<0) throw Error('Talla o posición inválidas.');
  const [maxWidthCM,maxHeightCM]=p.areas[index];
  const scale=Math.min(maxWidthCM/width,maxHeightCM/height);
  return {widthCM:width*scale,heightCM:height*scale,maxWidthCM,maxHeightCM,
    label:`${p.label} · ${size} · área ${maxWidthCM} × ${maxHeightCM} cm`};
}
function plan(width,height,sourceDPI,options={}) {
  aspect(width,height);
  if(!Number.isFinite(sourceDPI) || sourceDPI<=0) throw Error('Resolución de origen inválida.');
  const axis=options.sizeAxis==='height'?'height':'width';
  const value=axis==='height'?options.heightCM:options.widthCM;
  const cm=value==null ? (axis==='height'?height:width)/sourceDPI*2.54 : value;
  const physical=proportional(width,height,axis,cm);
  // Round the driver first and derive the other dimension from exact source ratio.
  const outWidth=axis==='height' ? Math.max(1,Math.round(Math.round(physical.heightCM/2.54*OUTPUT_DPI)*width/height)) : Math.max(1,Math.round(physical.widthCM/2.54*OUTPUT_DPI));
  const outHeight=axis==='height' ? Math.max(1,Math.round(physical.heightCM/2.54*OUTPUT_DPI)) : Math.max(1,Math.round(outWidth*height/width));
  if(outWidth>300000||outHeight>300000)throw Error('Una dimensión excede el límite de 300000 píxeles de Photoshop.');
  if(outWidth*outHeight>MAX_OUTPUT_PIXELS) throw Error('El tamaño final supera 128 megapíxeles a 300 ppp. Reduce la medida o divide el diseño.');
  return {width:outWidth,height:outHeight,dpi:OUTPUT_DPI,
    widthCM:outWidth/OUTPUT_DPI*2.54,heightCM:outHeight/OUTPUT_DPI*2.54,
    requestedWidthCM:physical.widthCM,requestedHeightCM:physical.heightCM,
    scaleX:outWidth/width,scaleY:outHeight/height,
    upscaled:outWidth>width || outHeight>height};
}
// Area integration on shrinking axes; bilinear on enlarging axes.
// Premultiplied alpha avoids contaminated transparent fringes.
// Source can be a trimmed native-resolution tile. Output crop uses global final pixels.
async function resampleCrop(source,canvasWidth,canvasHeight,targetWidth,targetHeight,crop,hook) {
  const out=new Uint8Array(crop.width*crop.height*4);
  if(!source.width||!source.height)return {data:out,width:crop.width,height:crop.height,bounds:{left:crop.left,top:crop.top}};
  const sx=canvasWidth/targetWidth,sy=canvasHeight/targetHeight;
  const left=source.bounds.left,top=source.bounds.top;
  const xs=Array.from({length:crop.width},(_,x)=>axisWeights(crop.left+x,sx,canvasWidth).filter(([p])=>p>=left&&p<left+source.width));
  for(let y=0;y<crop.height;y++) {
    if(hook && y%32===0) await hook('resize',y/crop.height);
    const ys=axisWeights(crop.top+y,sy,canvasHeight).filter(([p])=>p>=top&&p<top+source.height);
    for(let x=0;x<crop.width;x++) {
      let alpha=0,r=0,g=0,b=0;
      for(const [py,wy] of ys) for(const [px,wx] of xs[x]) {
        const xx=px-left,yy=py-top;
        if(xx<0 || yy<0 || xx>=source.width || yy>=source.height) continue;
        const i=(yy*source.width+xx)*4,weight=wx*wy,a=source.data[i+3]/255*weight;
        alpha+=a;r+=source.data[i]*a;g+=source.data[i+1]*a;b+=source.data[i+2]*a;
      }
      const i=(y*crop.width+x)*4;
      if(alpha>0) {out[i]=Math.round(r/alpha);out[i+1]=Math.round(g/alpha);out[i+2]=Math.round(b/alpha);out[i+3]=Math.round(alpha*255);}
    }
  }
  return {data:out,width:crop.width,height:crop.height,bounds:{left:crop.left,top:crop.top}};
}
function sourceBoundsForCrop(width,height,targetWidth,targetHeight,crop) {
  const sx=width/targetWidth,sy=height/targetHeight;
  return {left:Math.max(0,Math.floor(sx>1?crop.left*sx:(crop.left+.5)*sx-.5)-1),top:Math.max(0,Math.floor(sy>1?crop.top*sy:(crop.top+.5)*sy-.5)-1),
    right:Math.min(width,Math.ceil(sx>1?(crop.left+crop.width)*sx:(crop.left+crop.width-.5)*sx-.5)+2),
    bottom:Math.min(height,Math.ceil(sy>1?(crop.top+crop.height)*sy:(crop.top+crop.height-.5)*sy-.5)+2)};
}
module.exports={OUTPUT_DPI,MAX_OUTPUT_PIXELS,SIZES,CHILD_SIZES,PRESETS,garmentArea,axisWeights,proportional,fitPreset,plan,resampleCrop,sourceBoundsForCrop};
