'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const white=require('../plugin/white'),sheet=require('../plugin/sheet'),engine=require('../plugin/engine');

function maskOf(w,h,fn){const m=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(fn(x,y))m[y*w+x]=255;return m;}
function components(mask,w,h){
  const seen=new Uint8Array(w*h),list=[];
  for(let s=0;s<w*h;s++){if(seen[s]||!mask[s])continue;const q=[s];seen[s]=1;
    for(let i=0;i<q.length;i++){const p=q[i],x=p%w,y=(p-x)/w;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const n=ny*w+nx;if(!seen[n]&&mask[n]){seen[n]=1;q.push(n);}}}
    list.push(q);}
  return list;
}

test('distance is exact Chebyshev distance to the nearest empty pixel',()=>{
 const w=23,h=17;let seed=7;const rnd=()=>(seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff;
 const mask=maskOf(w,h,()=>rnd()>.25),d=white.distance(mask,w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(!mask[y*w+x]){assert.equal(d[y*w+x],0);continue;}
  let best=127;for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if(!mask[yy*w+xx])best=Math.min(best,Math.max(Math.abs(xx-x),Math.abs(yy-y)));
  assert.equal(d[y*w+x],best,`${x},${y}`);
 }
});
test('choke shrinks large shapes but keeps white under small dots and thin lines',async()=>{
 const w=120,h=80,mask=maskOf(w,h,(x,y)=>
  (x>=10&&x<50&&y>=10&&y<50)                       // 40×40 block
  ||(x>=70&&x<73&&y>=10&&y<13)                     // 3×3 dot
  ||(x>=80&&x<82&&y>=10&&y<12)                     // 2×2 dot
  ||(x>=70&&x<100&&y===30)                         // 1 px line
  ||(x>=70&&x<100&&y>=40&&y<44)),                  // 4 px band
  before=mask.slice(),r=await white.whiteMask(mask,w,h,{chokePX:3});
 const at=(x,y)=>r.data[y*w+x]===255;
 assert.ok(at(30,30)&&at(13,13)&&at(46,46),'interior kept');assert.ok(!at(10,10)&&!at(11,30)&&!at(12,12),'3 px ring removed');
 let block=0;for(let y=10;y<50;y++)for(let x=10;x<50;x++)block+=at(x,y);assert.equal(block,34*34);
 assert.ok(at(71,11),'3×3 dot keeps its center');assert.ok(at(80,10)&&at(81,11),'2×2 dot kept');
 for(let x=70;x<100;x++)assert.ok(at(x,30),'1 px line kept at '+x);
 assert.ok([40,41,42,43].some(y=>at(85,y)),'thin band keeps its ridge');
 for(let p=0;p<w*h;p++)if(r.data[p])assert.ok(before[p],'white never outside color');
 assert.equal(r.colorPixels,before.reduce((n,v)=>n+(v?1:0),0));assert.equal(r.whitePixels,r.data.reduce((n,v)=>n+(v?1:0),0));
});
test('a small dot keeps about 60 % of its diameter; large shapes take the full choke',async()=>{
 const w=70,h=30,dot=(cx,cy,r)=>(x,y)=>Math.max(Math.abs(x-cx),Math.abs(y-cy))<=r;
 const mask=maskOf(w,h,(x,y)=>dot(10,15,3)(x,y)||dot(30,15,5)(x,y)||(x>=42&&x<64&&y>=4&&y<26)),r=await white.whiteMask(mask,w,h,{chokePX:3}),width=y=>{let n=0;for(let x=0;x<w;x++)if(r.data[y*w+x]&&x<20)n++;return n;};
 assert.equal(width(15),5,'7 px dot keeps 5');                                // peak 4 -> reach 1
 let mid=0;for(let x=20;x<40;x++)mid+=r.data[15*w+x]?1:0;assert.equal(mid,11-2*2,'11 px dot: peak 6 -> reach 2');
 let big=0;for(let x=42;x<64;x++)big+=r.data[15*w+x]?1:0;assert.equal(big,22-2*3,'a block 11 px thick at its peak takes the full 3 px choke');
});
test('every halftone dot keeps white and choke 0 is the identity',async()=>{
 const w=240,h=120,src=new Uint8Array(w*h*4);for(let p=0;p<w*h;p++)src.set([200,50,90,Math.round(255*((p%w)/w)*.9+10)],p*4);
 const screened=(await engine.processRGBA(src,w,h,{dpi:300,lpi:45,angle:45,knockout:false,cleanup:'none',minDiameterMM:0})).data,mask=new Uint8Array(w*h);
 for(let p=0;p<w*h;p++)mask[p]=screened[p*4+3];
 const original=mask.slice(),parts=components(original,w,h);assert.ok(parts.length>200);
 const same=await white.whiteMask(mask.slice(),w,h,{chokePX:0});assert.deepEqual(same.data,original);
 const r=await white.whiteMask(mask.slice(),w,h,{chokePX:2});
 for(const comp of parts)assert.ok(comp.some(p=>r.data[p]),'a dot lost all its white');
 assert.ok(r.whitePixels<r.colorPixels,'solid areas contract');
});
test('white file formats and validation',()=>{
 const m=new Uint8Array([255,0]);
 assert.deepEqual([...white.tileRGBA(m,2,{left:0,top:0,width:2,height:1},'alpha')],[255,255,255,255,0,0,0,0]);
 assert.deepEqual([...white.tileRGBA(m,2,{left:0,top:0,width:2,height:1},'blackOnWhite')],[0,0,0,255,255,255,255,255]);
 assert.deepEqual([...white.tileRGBA(m,2,{left:0,top:0,width:2,height:1},'whiteOnBlack')],[255,255,255,255,0,0,0,255]);
 assert.equal(white.validate({}).chokePX,2);assert.equal(white.validate({chokeMM:0}).chokePX,0);
 assert.throws(()=>white.validate({chokeMM:9}),/0 a 5 mm/);assert.throws(()=>white.validate({format:'x'}),/Formato/);
});

const px=cm=>Math.round(cm/2.54*300);
const rectsOverlap=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
function sample(){return [
 {id:0,name:'frente',width:px(30),height:px(40),copies:2},{id:1,name:'pecho',width:px(10),height:px(10),copies:6},
 {id:2,name:'manga',width:px(8),height:px(25),copies:4},{id:3,name:'nuca',width:px(8),height:px(5),copies:5}];}
test('sheet plan: inside the roll, never overlapping, gaps respected, reproducible',()=>{
 const o={widthCM:58,spacingMM:5,marginMM:5},p=sheet.plan(sample(),o),again=sheet.plan(sample(),o);
 assert.deepEqual(p.sheets.map(s=>s.placements),again.sheets.map(s=>s.placements));
 assert.equal(p.pieces,17);assert.equal(p.sheets.reduce((n,s)=>n+s.pieces,0),17);
 const gap=sheet.mmToPx(5),margin=sheet.mmToPx(5);
 for(const s of p.sheets){
  assert.equal(s.width,px(58));
  for(const a of s.placements){
   assert.ok(a.x>=margin&&a.y>=margin&&a.x+a.width<=s.width-margin&&a.y+a.height<=s.height-margin,'inside margins');
   assert.equal(a.rotated?a.height:a.width,a.sourceWidth);
   const grown={x:a.x-gap+1,y:a.y-gap+1,width:a.width+2*gap-2,height:a.height+2*gap-2};
   for(const b of s.placements)if(b!==a)assert.ok(!rectsOverlap(grown,b),`${a.name} too close to ${b.name}`);
  }
  assert.ok(s.usedPercent>0&&s.usedPercent<=100);
 }
 assert.ok(p.usedPercent>55,'reasonable packing: '+p.usedPercent);
});
test('sheet plan: rotation helps narrow rolls, long sheets split, impossible pieces are explained',()=>{
 const tall=[{id:0,name:'banner',width:px(10),height:px(50),copies:1}];
 assert.equal(sheet.plan(tall,{widthCM:30,rotate:true}).sheets[0].placements[0].rotated,false);
 assert.throws(()=>sheet.plan([{id:0,name:'ancho',width:px(70),height:px(70),copies:1}],{widthCM:58,rotate:true}),/ancho.*no cabe en el ancho/);
 const wide=[{id:0,name:'larga',width:px(55),height:px(8),copies:3}],noTurn=sheet.plan(wide,{widthCM:58,rotate:false}),narrow=sheet.plan([{id:0,name:'x',width:px(50),height:px(20),copies:1}],{widthCM:21,rotate:true});
 assert.equal(narrow.sheets[0].placements[0].rotated,true);assert.equal(noTurn.sheets.length,1);
 const split=sheet.plan([{id:0,name:'a',width:px(50),height:px(30),copies:4}],{widthCM:58,maxLengthCM:70});
 assert.equal(split.sheets.length,2);for(const s of split.sheets)assert.ok(s.heightCM<=70.01,'sheet '+s.heightCM);
 assert.throws(()=>sheet.plan([{id:0,name:'alta',width:px(10),height:px(90),copies:1}],{widthCM:12,maxLengthCM:50,rotate:false}),/largo máximo/);
 assert.throws(()=>sheet.plan(sample().map(i=>({...i,copies:-1})),{}),/Copias/);assert.throws(()=>sheet.plan(sample().map(i=>({...i,copies:0})),{}),/al menos un diseño/);
 assert.throws(()=>sheet.plan(sample(),{marks:true,spacingMM:3}),/separación/);assert.throws(()=>sheet.plan(sample(),{widthCM:5}),/Ancho del rollo/);
});
test('the 128 MP document limit splits very long sheets automatically',()=>{
 const p=sheet.plan([{id:0,name:'a',width:px(55),height:px(100),copies:12}],{widthCM:58});
 for(const s of p.sheets)assert.ok(s.width*s.height<=sheet.MAX_PIXELS);assert.ok(p.sheets.length>=2);
});
test('cut marks stay outside designs, inside the sheet and clear of every other design',()=>{
 const p=sheet.plan(sample(),{widthCM:58,spacingMM:6,marginMM:5,marks:true});
 for(const s of p.sheets)for(const a of s.placements){
  const list=sheet.marks(a);assert.equal(list.length,8);
  for(const m of list){
   assert.ok(m.left>=0&&m.top>=0&&m.left+m.width<=s.width&&m.top+m.height<=s.height,'inside sheet');
   const r={x:m.left,y:m.top,width:m.width,height:m.height};
   for(const b of s.placements){
    if(b===a)continue;assert.ok(!rectsOverlap(r,b),'mark of '+a.name+' hits '+b.name);
   }
   const own={x:a.x,y:a.y,width:a.width,height:a.height},inter=rectsOverlap(r,own);
   if(inter){const ox=Math.min(r.x+r.width,own.x+own.width)-Math.max(r.x,own.x),oy=Math.min(r.y+r.height,own.y+own.height)-Math.max(r.y,own.y);assert.ok(ox<=3&&oy<=3||false,'tick only touches the corner');}
  }
 }
});
test('rotateCW turns a tile 90° clockwise',()=>{
 const w=3,h=2,src=new Uint8Array(w*h*4);for(let i=0;i<w*h;i++)src.set([i+1,0,0,255],i*4);   // 1 2 3 / 4 5 6
 const out=sheet.rotateCW(src,w,h);const reds=Array.from({length:w*h},(_,i)=>out[i*4]);
 assert.deepEqual(reds,[4,1,5,2,6,3]);                                                       // 4 1 / 5 2 / 6 3
});
