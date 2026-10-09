'use strict';
const {composite,hexRGB}=require('./engine');
function backgroundColor(options) {return hexRGB(options.linkBackground===false?(options.previewColor||'#000000'):(options.key||'#000000'));}
function maskRGB(rgba) {
  const rgb=new Uint8Array(rgba.length/4*3);
  for(let p=0;p<rgba.length/4;p++) {const value=rgba[p*4+3]?255:0;rgb.fill(value,p*3,p*3+3);}
  return rgb;
}
function viewRGB(mode,original,result,width,height,options) {
  switch(mode) {
    case 'original':return composite(original,width,height,null);
    case 'garment':return composite(result,width,height,backgroundColor(options));
    case 'beforeGarment':return composite(original,width,height,backgroundColor(options));
    case 'compare': {
      const position=options.comparePosition==null?50:options.comparePosition;
      if(!Number.isFinite(position)||position<0||position>100)throw Error('Comparación: usa 0 a 100%.');
      const before=composite(original,width,height,backgroundColor(options)),after=composite(result,width,height,backgroundColor(options));
      const split=Math.round(width*position/100);
      for(let y=0;y<height;y++)after.set(before.subarray(y*width*3,(y*width+split)*3),y*width*3);
      if(split>0&&split<width)for(let y=0;y<height;y++)after.fill(255,(y*width+split)*3,(y*width+split+1)*3);
      return after;
    }
    case 'transparent':return composite(result,width,height,null);
    case 'removed':{const out=new Uint8Array(width*height*3);for(let p=0;p<width*height;p++)if(options.removedMask&&options.removedMask[p])out.set([255,110,70],p*3);return out;}
    case 'protection':{const out=new Uint8Array(width*height*3);for(let p=0;p<width*height;p++)if(options.protectMask&&options.protectMask[p]>=128)out.set([240,240,240],p*3);return out;}
    case 'mask':return maskRGB(result);
    default:throw Error('Modo de vista inválido.');
  }
}
module.exports={backgroundColor,maskRGB,viewRGB};

function mockupRGB(cached,mode,options){
 const width=420,height=540,out=new Uint8Array(width*height*3),shirt=backgroundColor(options);
 const chest=Number(options.mockupChestCM??52),garmentHeight=Number(options.mockupHeightCM??72);
 if(!Number.isFinite(chest)||chest<15||chest>100||!Number.isFinite(garmentHeight)||garmentHeight<20||garmentHeight>140)throw Error('Medidas de prenda inválidas.');
 const positionX=Number(options.mockupX??50),positionY=Number(options.mockupY??18),compare=Number(options.comparePosition??50);
 if(![positionX,positionY,compare].every(v=>Number.isFinite(v)&&v>=0&&v<=100))throw Error('Posición y comparación: usa 0 a 100%.');
 if(![cached.size.widthCM,cached.size.heightCM].every(v=>Number.isFinite(v)&&v>0))throw Error('Medidas de impresión inválidas.');
 const scale=Math.min(260/chest,450/garmentHeight),bodyWidth=chest*scale,bodyHeight=garmentHeight*scale,left=(width-bodyWidth)/2,top=30;
 const inside=(x,y)=>{
  if(y<top||y>top+bodyHeight)return false;
  if(y<top+bodyHeight*.24){const extension=bodyWidth*.25*(1-(y-top)/(bodyHeight*.24));return x>=left-extension&&x<=left+bodyWidth+extension;}
  return x>=left&&x<=left+bodyWidth;
 };
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)out.set(inside(x,y)?shirt:[24,27,26],(y*width+x)*3);
 const artWidth=cached.size.widthCM*scale,artHeight=cached.size.heightCM*scale,artLeft=left+bodyWidth*(positionX/100)-artWidth/2,artTop=top+bodyHeight*positionY/100;
 const split=width*compare/100;
 for(let y=Math.max(0,Math.floor(artTop));y<Math.min(height,Math.ceil(artTop+artHeight));y++)for(let x=Math.max(0,Math.floor(artLeft));x<Math.min(width,Math.ceil(artLeft+artWidth));x++){
  if(!inside(x,y))continue;const src=mode==='original'||mode==='beforeGarment'||mode==='compare'&&x<split?cached.src:cached.result;
  const xx=Math.min(src.width-1,Math.max(0,Math.floor((x-artLeft)/artWidth*src.width))),yy=Math.min(src.height-1,Math.max(0,Math.floor((y-artTop)/artHeight*src.height))),i=(yy*src.width+xx)*4,a=src.data[i+3]/255;
  for(let k=0;k<3;k++)out[(y*width+x)*3+k]=Math.round(src.data[i+k]*a+shirt[k]*(1-a));
 }
 if(mode==='compare')for(let y=top;y<top+bodyHeight;y++)if(inside(Math.round(split),y))out.set([215,226,219],(y*width+Math.round(split))*3);
 return {data:out,width,height};
}
module.exports.mockupRGB=mockupRGB;
