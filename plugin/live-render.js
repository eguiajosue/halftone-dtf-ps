'use strict';
/* Cached renderer for live editing. Splits the work of engine.processRGBA in
 * independent stages so a slider only redoes what it changes:
 *  - base coverage (alpha + knockout, before levels) -> 16-bit per pixel;
 *  - screen thresholds (shape, LPI, angle)            -> 16-bit per pixel;
 *  - levels                                            -> 65536-entry table;
 *  - color (RGB written to the art layer)             -> only when color options change.
 * The mask is lut[coverage] > threshold: no trigonometry per slider move.
 * Values are quantized to 1/65535, so a pixel exactly on a dot edge may differ
 * from processRGBA; protection modes keep using processRGBA. */
const {LEVELS,validate,adjustLevels,tone,threshold,coverage,cleanedEdge,boostedColor}=require('./engine');
const {fillHoles,minAreaFor}=require('./holes');
const morph=require('./morph'),smooth=require('./smooth');
const SOLID=65536;
const clamp=(x,lo=0,hi=1)=>Math.max(lo,Math.min(hi,x));
// `smoothed` adds the pre-smoothing to the key: RGB recovery and edge cleanup read the raw coverage.
function coverageKey(n,smoothed=true){return JSON.stringify([n.knockout,n.knockout?[n.key,n.tolerance,n.softness,n.recover]:0,n.gamma,n.strength,smoothed?n.presmooth:0]);}
function screenKey(n){return n.halftone?JSON.stringify([n.dpi,n.lpi,n.angle,n.shape,n.shape==='line'?n.lineTrim:0]):'none';}
function colorKey(n){
  const recovering=n.recover&&n.knockout;
  if(!recovering&&!n.defringe&&!n.shadowBoost&&!n.colorBoost)return 'plain';
  // Only the edge cleanup reads leveled coverage; recovery and boosts do not.
  return JSON.stringify([recovering?coverageKey(n,false):0,n.defringe?[coverageKey(n,false),n.cleanup,n.inputBlack,n.inputMidtone,n.inputWhite,n.outputBlack,n.outputWhite,n.defringeRadius,n.defringeStrength]:0,
    n.shadowBoost,n.colorBoost]);
}
// Same decisions as processRGBA: alpha floor, solid coverage, threshold mode.
function levelsTable(n){
  const lut=new Int32Array(65536),floor=LEVELS[n.cleanup].alphaFloor;
  for(let q=1;q<65536;q++){
    const v=tone(adjustLevels(q/65535,n),n);
    if(v<floor||v<=0)continue;
    if(!n.halftone)lut[q]=v*255<n.alphaThreshold?0:SOLID;
    else lut[q]=v>=1?SOLID:clamp(Math.round(v*65535),1,65535);
  }
  return lut;
}
class LiveRenderer{
  constructor(source,width,height){
    if(!(source instanceof Uint8Array)||source.length!==width*height*4)throw Error('Buffer RGBA inválido.');
    Object.assign(this,{source,width,height});
    this.cov=null;this.covKey=null;this.thr=null;this.thrKey=null;this.visited=null;this.queue=null;
  }
  async coverage(n,hook){
    const key=coverageKey(n);if(key===this.covKey)return this.cov;
    const {source,width,height}=this,cov=this.cov||new Uint16Array(width*height);
    const byAlpha=new Uint16Array(256);
    for(let a=1;a<256;a++)byAlpha[a]=Math.max(1,Math.round(Math.pow(a/255,1/n.gamma)*n.strength/100*65535));
    const scale=1/(255*Math.sqrt(3)),[kr,kg,kb]=n.rgb,low=n.tolerance/100,range=n.softness/100;
    for(let y=0;y<height;y++){
      if(hook&&y%256===0)await hook('screen',y/height*.5);
      for(let p=y*width,end=p+width;p<end;p++){
        const i=p*4,a=source[i+3];
        if(!a){cov[p]=0;continue;}
        if(!n.knockout){cov[p]=byAlpha[a];continue;}
        const r=source[i],g=source[i+1],b=source[i+2];
        const dr=r-kr,dg=g-kg,db=b-kb,t=clamp((Math.sqrt(dr*dr+dg*dg+db*db)*scale-low)/range);
        let opacity=a/255*(t*t*(3-2*t));
        if(n.recover){
          let matte=0;const rgb=[r,g,b];
          for(let k=0;k<3;k++){const d=rgb[k]-n.rgb[k];matte=Math.max(matte,d>=0?d/(255-n.rgb[k]||1):-d/(n.rgb[k]||1));}
          opacity*=clamp(matte);
        }
        if(opacity<=0){cov[p]=0;continue;}
        const base=Math.pow(opacity,1/n.gamma)*n.strength/100;
        cov[p]=base>0?Math.max(1,Math.min(65535,Math.round(base*65535))):0;
      }
    }
    // Art that a screenless job would print solid: raw coverage of at least 50 %.
    let solid=0;for(let p=0;p<cov.length;p++)if(cov[p]>=32768)solid++;
    if(n.presmooth){
      if(hook)await hook('screen',.5);
      smooth.smoothCoverage(cov,width,height,{mode:n.presmooth,alpha:{data:source,stride:4,offset:3}});
    }
    this.solidCount=solid;this.cov=cov;this.covKey=key;return cov;
  }
  async thresholds(n,hook){
    const key=screenKey(n);if(key==='none')return null;if(key===this.thrKey)return this.thr;
    const {width,height}=this,thr=this.thr||new Uint16Array(width*height);
    const radians=n.angle*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians),cell=n.dpi/n.lpi,trim=n.lineTrim/100;
    for(let y=0;y<height;y++){
      if(hook&&y%128===0)await hook('screen',.5+y/height*.5);
      const gy=y+.5;
      for(let x=0,p=y*width;x<width;x++,p++){
        const gx=x+.5;
        thr[p]=Math.round(threshold((gx*cos+gy*sin)/cell,(-gx*sin+gy*cos)/cell,n.shape,trim)*65535);
      }
    }
    this.thr=thr;this.thrKey=key;return thr;
  }
  // Binary user mask (0/255), after particle cleanup. Reuses scratch buffers.
  async mask(options,hook,target){
    const n=options.rgb?options:validate(options),{width,height}=this,count=width*height;
    if(n.protection&&n.protection!=='off')throw Error('La protección de detalles usa el motor completo.');
    const cov=await this.coverage(n,hook),thr=await this.thresholds(n,hook),lut=levelsTable(n);
    const mask=target||new Uint8Array(count);let screened=0;
    const holeArea=n.halftone?minAreaFor(n.fillHolesMM,n.dpi):1,cand=holeArea>1?(this.cand&&this.cand.length===count?this.cand:(this.cand=new Uint8Array(count))):null;
    for(let y=0;y<height;y++){
      if(hook&&y%512===0)await hook('screen',y/height);
      let p=y*width;const end=p+width;
      if(cand)for(;p<end;p++){const v=lut[cov[p]];cand[p]=v?1:0;if(v>thr[p]){mask[p]=255;screened++;}else mask[p]=0;}
      else if(thr)for(;p<end;p++){const v=lut[cov[p]];if(v>thr[p]){mask[p]=255;screened++;}else mask[p]=0;}
      else for(;p<end;p++){if(lut[cov[p]]){mask[p]=255;screened++;}else mask[p]=0;}
    }
    const opening=n.cleanupMode==='opening',diameterPX=n.minDiameterMM/25.4*n.dpi,minArea=opening?1:Math.max(1,Math.ceil(Math.PI*(diameterPX/2)**2));
    const cleanup=opening?await morph.openMask(mask,width,height,morph.openingParams(n),null,hook,this.pool||(this.pool={})):await this.particles(mask,minArea,hook);
    const filled=cand?(await fillHoles({data:mask,candidate:cand,width,height,minArea:holeArea,hook})).filledPixels:0;
    const inkPixels=screened-cleanup.removedPixels+filled;
    return {mask,stats:Object.assign({cellPX:n.dpi/n.lpi,minArea,minDiameterMM:n.minDiameterMM,inkPixels,
      protectedPixels:0,regionInkPixels:inkPixels,regionProtectedPixels:0,regionScreenPixels:screened+filled,regionRemovedPixels:cleanup.removedPixels,
      coveragePercent:inkPixels/count*100,solidPixels:this.solidCount},cand?{filledPixels:filled}:null,cleanup)};
  }
  // 8-connected islands smaller than minArea are cleared, as in engine.removeParticles.
  // The search stops once a component reaches minArea pixels or touches a pixel
  // already known to be kept (same connected component), so the cost does not
  // grow with large solid areas. Removed islands are exactly the same.
  async particles(mask,minArea,hook){
    if(minArea<=1)return {removedPixels:0,removedComponents:0};
    const {width:w,height:h}=this,count=w*h,KEPT=2;
    const state=this.visited&&this.visited.length===count?this.visited.fill(0):(this.visited=new Uint8Array(count));
    const queue=this.queue&&this.queue.length>=minArea+8?this.queue:(this.queue=new Int32Array(minArea+8));
    let removedPixels=0,removedComponents=0;
    for(let start=0;start<count;start++){
      if(hook&&start%(w*256)===0)await hook('cleanup',start/count);
      if(state[start]||!mask[start])continue;
      state[start]=1;queue[0]=start;let tail=1,big=false;
      for(let head=0;head<tail&&!big;head++){
        const p=queue[head],x=p%w,y=(p-x)/w;
        for(let dy=-1;dy<=1&&!big;dy++){
          const ny=y+dy;if(ny<0||ny>=h)continue;
          for(let dx=-1;dx<=1;dx++){
            const nx=x+dx;if((!dx&&!dy)||nx<0||nx>=w)continue;
            const q=ny*w+nx;if(!mask[q])continue;
            if(state[q]===KEPT){big=true;break;}
            if(!state[q]){state[q]=1;queue[tail++]=q;if(tail>=minArea){big=true;break;}}
          }
        }
      }
      if(big)for(let i=0;i<tail;i++)state[queue[i]]=KEPT;
      else{for(let i=0;i<tail;i++)mask[queue[i]]=0;removedPixels+=tail;removedComponents++;}
    }
    return {removedPixels,removedComponents};
  }
  // RGB for the art layer, opaque wherever the source has any alpha. The mask
  // decides what prints; this layer only changes with color options.
  async color(options,hook,target){
    const n=options.rgb?options:validate(options),{source,width,height}=this,out=target||new Uint8Array(width*height*4);
    const plain=colorKey(n)==='plain';
    for(let y=0;y<height;y++){
      if(hook&&y%(plain?512:64)===0)await hook('color',y/height);
      for(let x=0;x<width;x++){
        const i=(y*width+x)*4;
        if(!source[i+3]){out[i]=out[i+1]=out[i+2]=out[i+3]=0;continue;}
        out[i+3]=255;
        if(plain){out[i]=source[i];out[i+1]=source[i+1];out[i+2]=source[i+2];continue;}
        const c=coverage(source[i],source[i+1],source[i+2],source[i+3],n);
        const edge=n.defringe?cleanedEdge(source,width,height,x,y,c,n):null;
        for(let k=0;k<3;k++)out[i+k]=n.recover&&n.knockout&&c.matte>0
          ?Math.round(clamp((source[i+k]-(1-c.matte)*n.rgb[k])/c.matte,0,255)):edge?edge[k]:source[i+k];
        if(n.shadowBoost||n.colorBoost)out.set(boostedColor([out[i],out[i+1],out[i+2]],n),i);
      }
    }
    return out;
  }
  dispose(){this.source=null;this.cov=null;this.thr=null;this.cand=null;this.visited=null;this.queue=null;this.pool=null;}
}
// Printable RGBA: color where the mask prints, fully transparent elsewhere.
function compose(color,mask,width,crop){
  crop=crop||{left:0,top:0,width,height:mask.length/width};
  const out=new Uint8Array(crop.width*crop.height*4);
  for(let y=0;y<crop.height;y++)for(let x=0;x<crop.width;x++){
    const p=(crop.top+y)*width+crop.left+x;if(!mask[p])continue;
    const o=(y*crop.width+x)*4;out[o]=color[p*4];out[o+1]=color[p*4+1];out[o+2]=color[p*4+2];out[o+3]=255;
  }
  return out;
}
module.exports={LiveRenderer,compose,colorKey,coverageKey,screenKey,levelsTable};
