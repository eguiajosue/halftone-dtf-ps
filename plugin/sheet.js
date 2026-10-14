'use strict';
/* Gang-sheet layout: place 300 ppp designs on a roll of fixed width, any
 * length, with spacing, margins, optional 90° turns and cut marks. Skyline
 * bottom-left packing over designs sorted by size. Pure geometry in pixels. */
const DPI=300,MAX_PIECES=2000,MAX_PIXELS=128000000;
const mmToPx=mm=>Math.round(mm/25.4*DPI),cmToPx=cm=>Math.round(cm/2.54*DPI),pxToCM=px=>px/DPI*2.54;
const MARK={offsetMM:1,lengthMM:3,thicknessMM:.3,minSpacingMM:6,minMarginMM:5};
function options(o={}){
  const n={widthCM:58,maxLengthCM:0,spacingMM:5,marginMM:5,rotate:true,marks:false,...o};
  const range=(key,lo,hi,label)=>{if(!Number.isFinite(n[key])||n[key]<lo||n[key]>hi)throw Error(`${label}: usa ${lo} a ${hi}.`);};
  range('widthCM',10,200,'Ancho del rollo (cm)');
  range('maxLengthCM',0,2000,'Largo máximo (cm)');range('spacingMM',0,50,'Separación (mm)');range('marginMM',0,50,'Margen (mm)');
  if(n.maxLengthCM>0&&n.maxLengthCM<10)throw Error('Largo máximo (cm): usa 0 (sin límite) o al menos 10.');
  if(n.marks&&n.spacingMM<MARK.minSpacingMM)throw Error(`Con marcas de corte la separación debe ser de al menos ${MARK.minSpacingMM} mm.`);
  if(n.marks&&n.marginMM<MARK.minMarginMM)throw Error(`Con marcas de corte el margen debe ser de al menos ${MARK.minMarginMM} mm.`);
  const widthPX=cmToPx(n.widthCM),gap=mmToPx(n.spacingMM),margin=mmToPx(n.marginMM);
  const limit=Math.floor(MAX_PIXELS/widthPX),maxHeightPX=Math.min(n.maxLengthCM>0?cmToPx(n.maxLengthCM):Infinity,limit);
  if(widthPX-2*margin<=0)throw Error('El margen deja el rollo sin ancho útil.');
  return {...n,widthPX,gap,margin,maxHeightPX};
}
// items: [{id,name,width,height,copies}] in px at 300 ppp.
function expand(items){
  const pieces=[];
  for(const item of items){
    const copies=Number.isInteger(item.copies)?item.copies:Number(item.copies);
    if(!Number.isInteger(copies)||copies<0||copies>999)throw Error(`Copias de «${item.name}»: usa un entero de 0 a 999.`);
    if(!(item.width>0&&item.height>0))throw Error(`«${item.name}» no tiene medidas válidas.`);
    for(let c=0;c<copies;c++)pieces.push({id:item.id,name:item.name,w:item.width,h:item.height,copy:c+1});
    if(pieces.length>MAX_PIECES)throw Error(`Máximo ${MAX_PIECES} piezas por pliego.`);
  }
  return pieces;
}
function newSheet(innerWidth){return {skyline:[{x:0,y:0,w:innerWidth}],placed:[]};}
function fitY(sheet,i,w,innerWidth){
  const sky=sheet.skyline;let x=sky[i].x;if(x+w>innerWidth)return -1;
  let y=sky[i].y,left=w;
  for(let j=i;left>0&&j<sky.length;j++){y=Math.max(y,sky[j].y);left-=sky[j].w;}
  return y;
}
function addLevel(sheet,i,x,y,w,h){
  const sky=sheet.skyline;sky.splice(i,0,{x,y:y+h,w});
  for(let j=i+1;j<sky.length;){
    const prev=sky[j-1],cur=sky[j];
    if(cur.x<prev.x+prev.w){const shrink=prev.x+prev.w-cur.x;cur.x+=shrink;cur.w-=shrink;if(cur.w<=0){sky.splice(j,1);continue;}}
    break;
  }
  for(let j=0;j<sky.length-1;){if(sky[j].y===sky[j+1].y){sky[j].w+=sky[j+1].w;sky.splice(j+1,1);}else j++;}
}
function place(sheet,piece,c){
  const orientations=[{w:piece.w,h:piece.h,rotated:false}];
  if(c.rotate&&piece.w!==piece.h)orientations.push({w:piece.h,h:piece.w,rotated:true});
  let best=null;
  for(const o of orientations){
    const w=o.w+c.gap,h=o.h+c.gap;
    for(let i=0;i<sheet.skyline.length;i++){
      const y=fitY(sheet,i,w,c.innerWidth);if(y<0||y+h>c.limit)continue;
      const x=sheet.skyline[i].x;
      if(!best||y+h<best.bottom||(y+h===best.bottom&&x<best.x))best={i,x,y,w,h,bottom:y+h,o};
    }
  }
  if(!best)return false;
  addLevel(sheet,best.i,best.x,best.y,best.w,best.h);
  sheet.placed.push({id:piece.id,name:piece.name,copy:piece.copy,x:c.margin+best.x,y:c.margin+best.y,width:best.o.w,height:best.o.h,rotated:best.o.rotated,
    sourceWidth:piece.w,sourceHeight:piece.h});
  return true;
}
function plan(items,o){
  const c=options(o),pieces=expand(items);
  if(!pieces.length)throw Error('Elige al menos un diseño con una o más copias.');
  const context={...c,innerWidth:c.widthPX-2*c.margin+c.gap,limit:(Number.isFinite(c.maxHeightPX)?c.maxHeightPX-2*c.margin:Infinity)+c.gap};
  pieces.sort((a,b)=>Math.max(b.w,b.h)-Math.max(a.w,a.h)||b.w*b.h-a.w*a.h||(a.name<b.name?-1:a.name>b.name?1:a.copy-b.copy));
  const sheets=[];
  for(const piece of pieces){
    if(sheets.some(s=>place(s,piece,context)))continue;
    const sheet=newSheet(context.innerWidth);
    if(!place(sheet,piece,context)){
      const need=Math.min(piece.w,piece.h);
      throw Error(need+2*c.margin>c.widthPX?`«${piece.name}» (${pxToCM(need).toFixed(1)} cm) no cabe en el ancho del rollo.`:`«${piece.name}» no cabe en el largo máximo del pliego.`);
    }
    sheets.push(sheet);
  }
  const result=sheets.map((s,index)=>{
    const bottom=Math.max(...s.placed.map(p=>p.y+p.height)),height=bottom+c.margin;
    s.placed.sort((a,b)=>a.y-b.y||a.x-b.x);
    const used=s.placed.reduce((n,p)=>n+p.width*p.height,0);
    return {index,width:c.widthPX,height,widthCM:pxToCM(c.widthPX),heightCM:pxToCM(height),placements:s.placed,
      usedPercent:used/(c.widthPX*height)*100,pieces:s.placed.length};
  });
  return {options:c,sheets:result,pieces:pieces.length,
    totalAreaM2:result.reduce((n,s)=>n+s.widthCM*s.heightCM,0)/1e4,
    usedPercent:result.reduce((n,s)=>n+s.usedPercent*s.width*s.height,0)/result.reduce((n,s)=>n+s.width*s.height,0)};
}
// Eight solid ticks per design, outside its corners and on the extension of its edges.
function marks(p,o={}){
  const off=Math.max(1,mmToPx(o.offsetMM??MARK.offsetMM)),len=Math.max(4,mmToPx(o.lengthMM??MARK.lengthMM)),t=Math.max(2,mmToPx(o.thicknessMM??MARK.thicknessMM));
  const {x,y,width:w,height:h}=p,r=[];
  for(const top of [y,y+h-t])for(const left of [x-off-len,x+w+off])r.push({left,top,width:len,height:t});
  for(const left of [x,x+w-t])for(const top of [y-off-len,y+h+off])r.push({left,top,width:t,height:len});
  return r;
}
// Rotates RGBA 90° clockwise: pixel (x,y) of a w×h tile goes to (h-1-y, x) of a h×w tile.
function rotateCW(data,w,h){
  const out=new Uint8Array(data.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const s=(y*w+x)*4,d=(x*h+(h-1-y))*4;out[d]=data[s];out[d+1]=data[s+1];out[d+2]=data[s+2];out[d+3]=data[s+3];}
  return out;
}
module.exports={DPI,MARK,MAX_PIECES,MAX_PIXELS,options,expand,plan,marks,rotateCW,mmToPx,cmToPx,pxToCM};
