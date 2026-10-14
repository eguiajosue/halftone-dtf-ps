'use strict';
/* White-ink channel from the printable color mask (alpha 0/255).
 * The white layer matches the color layer, contracted ("choke") by N px so no
 * white peeks out at the edges after film alignment tolerance. Small shapes
 * must keep white under them: each shape's choke is limited to a fraction of
 * its own half-thickness (KEEP_SHARE), so a dot keeps about 60 % of its
 * diameter, and the medial ridge always survives. Distance is Chebyshev
 * (square structuring element), computed in two passes. */
const CAP=127,MAX_CHOKE_PX=120,DPI=300,KEEP_SHARE=.35;
const FORMATS=['blackOnWhite','alpha','whiteOnBlack'];
const chokeToPX=mm=>Math.round(mm/25.4*DPI);
function validate(o={}){
  const chokeMM=o.chokeMM==null?.15:Number(o.chokeMM),format=o.format||'blackOnWhite';
  if(!Number.isFinite(chokeMM)||chokeMM<0||chokeMM>5)throw Error('Contracción del blanco: usa 0 a 5 mm.');
  if(!FORMATS.includes(format))throw Error('Formato del canal blanco inválido.');
  return {chokeMM,chokePX:Math.min(MAX_CHOKE_PX,chokeToPX(chokeMM)),format};
}
// Distance of every ink pixel to the nearest empty pixel (1 = touching empty).
// The image border does not count as empty. Capped at CAP.
function distance(mask,w,h){
  const d=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0,p=y*w;x<w;x++,p++){
    if(!mask[p])continue;
    let m=CAP;
    if(x>0)m=Math.min(m,d[p-1]);
    if(y>0){m=Math.min(m,d[p-w]);if(x>0)m=Math.min(m,d[p-w-1]);if(x<w-1)m=Math.min(m,d[p-w+1]);}
    d[p]=Math.min(CAP,m+1);
  }
  for(let y=h-1;y>=0;y--)for(let x=w-1,p=y*w+x;x>=0;x--,p--){
    if(!d[p])continue;
    let m=d[p]-1;
    if(x<w-1)m=Math.min(m,d[p+1]);
    if(y<h-1){m=Math.min(m,d[p+w]);if(x>0)m=Math.min(m,d[p+w-1]);if(x<w-1)m=Math.min(m,d[p+w+1]);}
    d[p]=Math.min(d[p],m+1);
  }
  return d;
}
// Highest distance reachable by climbing strictly uphill from each pixel: the
// half-thickness of the shape (or lobe of a connected mesh) the pixel belongs to.
function peak(d,w,h){
  const top=d.slice();
  for(let round=0;round<8;round++){
    let changed=false;
    for(let y=0;y<h;y++)for(let x=0,p=y*w;x<w;x++,p++){
      const v=d[p];if(!v)continue;let m=top[p];
      if(x>0&&d[p-1]>v&&top[p-1]>m)m=top[p-1];
      if(y>0){if(d[p-w]>v&&top[p-w]>m)m=top[p-w];if(x>0&&d[p-w-1]>v&&top[p-w-1]>m)m=top[p-w-1];if(x<w-1&&d[p-w+1]>v&&top[p-w+1]>m)m=top[p-w+1];}
      if(m!==top[p]){top[p]=m;changed=true;}
    }
    for(let y=h-1;y>=0;y--)for(let x=w-1,p=y*w+x;x>=0;x--,p--){
      const v=d[p];if(!v)continue;let m=top[p];
      if(x<w-1&&d[p+1]>v&&top[p+1]>m)m=top[p+1];
      if(y<h-1){if(d[p+w]>v&&top[p+w]>m)m=top[p+w];if(x>0&&d[p+w-1]>v&&top[p+w-1]>m)m=top[p+w-1];if(x<w-1&&d[p+w+1]>v&&top[p+w+1]>m)m=top[p+w+1];}
      if(m!==top[p]){top[p]=m;changed=true;}
    }
    if(!changed)break;
  }
  return top;
}
// mask: Uint8Array 0/255, rewritten in place as the white mask.
async function whiteMask(mask,w,h,{chokePX=0}={},hook){
  const colorPixels=mask.reduce((n,v)=>n+(v?1:0),0);
  if(chokePX<=0)return {data:mask,colorPixels,whitePixels:colorPixels,chokePX:0};
  const d=distance(mask,w,h),top=peak(d,w,h);let white=0;
  for(let y=0;y<h;y++){
    if(hook&&y%256===0)await hook('white',y/h);
    for(let x=0,p=y*w;x<w;x++,p++){
      const v=d[p],reach=Math.min(chokePX,Math.floor(top[p]*KEEP_SHARE));let keep=v>reach;
      if(!keep&&v>0){
        // Local maximum of the distance: the ridge of a small or thin shape.
        keep=true;
        for(let dy=-1;dy<=1&&keep;dy++){const yy=y+dy;if(yy<0||yy>=h)continue;
          for(let dx=-1;dx<=1;dx++){const xx=x+dx;if((!dx&&!dy)||xx<0||xx>=w)continue;if(d[yy*w+xx]>v){keep=false;break;}}}
      }
      mask[p]=keep?255:0;if(keep)white++;
    }
  }
  return {data:mask,colorPixels,whitePixels:white,chokePX};
}
// RGBA tile of the white mask in the chosen file format.
function tileRGBA(mask,width,crop,format){
  const out=new Uint8Array(crop.width*crop.height*4);
  for(let y=0;y<crop.height;y++)for(let x=0;x<crop.width;x++){
    const ink=mask[(crop.top+y)*width+crop.left+x]!==0,o=(y*crop.width+x)*4;
    if(format==='alpha'){if(ink)out.fill(255,o,o+4);}
    else if(format==='blackOnWhite'){out[o+3]=255;if(!ink)out.fill(255,o,o+3);}
    else{out[o+3]=255;if(ink)out.fill(255,o,o+3);}
  }
  return out;
}
module.exports={validate,distance,peak,whiteMask,tileRGBA,chokeToPX,FORMATS,MAX_CHOKE_PX,KEEP_SHARE};
