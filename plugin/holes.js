'use strict';
/* Fills small transparent pores inside printed areas (typically shadows where
 * dots almost touch and the ink/powder would close the gaps anyway). Only
 * pixels flagged `candidate` can be filled: knockout color and source
 * transparency are never printed. Pores are 4-connected, the complement of the
 * 8-connected ink, and are filled when smaller than minArea pixels.
 * `data` is read with a stride, so it works on a 1-channel mask (stride 1,
 * offset 0) and on RGBA (stride 4, offset 3). Search stops at minArea pixels. */
async function fillHoles({data,stride=1,offset=0,candidate,width:w,height:h,minArea,hook,onFill}){
  if(minArea<=1)return {filledPixels:0,filledComponents:0};
  const count=w*h,KEPT=2,state=new Uint8Array(count),queue=new Int32Array(minArea+4);
  const open=p=>!data[p*stride+offset]&&candidate[p]!==0;
  let filledPixels=0,filledComponents=0;
  for(let start=0;start<count;start++){
    if(hook&&start%(w*256)===0)await hook('holes',start/count);
    if(state[start]||!open(start))continue;
    state[start]=1;queue[0]=start;let tail=1,big=false;
    for(let head=0;head<tail&&!big;head++){
      const p=queue[head],x=p%w,y=(p-x)/w;
      for(let k=0;k<4&&!big;k++){
        let q;
        if(k===0){if(x===0)continue;q=p-1;}else if(k===1){if(x===w-1)continue;q=p+1;}
        else if(k===2){if(y===0)continue;q=p-w;}else{if(y===h-1)continue;q=p+w;}
        if(!open(q))continue;
        if(state[q]===KEPT){big=true;break;}
        if(!state[q]){state[q]=1;queue[tail++]=q;if(tail>=minArea){big=true;break;}}
      }
    }
    if(big){for(let i=0;i<tail;i++)state[queue[i]]=KEPT;continue;}
    for(let i=0;i<tail;i++){const p=queue[i];data[p*stride+offset]=255;if(onFill)onFill(p);}
    filledPixels+=tail;filledComponents++;
  }
  return {filledPixels,filledComponents};
}
const minAreaFor=(mm,dpi)=>mm<=0?1:Math.max(1,Math.ceil(Math.PI*(mm/25.4*dpi/2)**2));
module.exports={fillHoles,minAreaFor};
