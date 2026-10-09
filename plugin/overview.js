'use strict';
const {tiles}=require('./tiles'),{resampleCrop}=require('./sizing');
async function thumbnail(store,max=360,check=()=>{}){
  const scale=Math.min(1,max/Math.max(store.width,store.height)),width=Math.max(1,Math.round(store.width*scale)),height=Math.max(1,Math.round(store.height*scale));
  const sums=new Float32Array(width*height*4),sx=store.width/width,sy=store.height/height;
  for(const tile of tiles(store.width,store.height)){
    check();const part=await store.read(tile),left=Math.floor(tile.left/sx),top=Math.floor(tile.top/sy);
    const crop={left,top,width:Math.min(width,Math.ceil((tile.left+tile.width)/sx))-left,height:Math.min(height,Math.ceil((tile.top+tile.height)/sy))-top};
    const sampled=await resampleCrop({...part,bounds:{left:tile.left,top:tile.top}},store.width,store.height,width,height,crop);
    for(let y=0;y<crop.height;y++)for(let x=0;x<crop.width;x++){
      const i=(y*crop.width+x)*4,j=((crop.top+y)*width+crop.left+x)*4,a=sampled.data[i+3]/255;
      for(let k=0;k<3;k++)sums[j+k]+=sampled.data[i+k]*a;sums[j+3]+=a;
    }await new Promise(r=>setTimeout(r,0));
  }
  const data=new Uint8Array(width*height*4);for(let i=0;i<data.length;i+=4){if(sums[i+3])for(let k=0;k<3;k++)data[i+k]=Math.round(sums[i+k]/sums[i+3]);data[i+3]=Math.round(Math.min(1,sums[i+3])*255);}
  check();return {data,width,height};
}
module.exports={thumbnail};
