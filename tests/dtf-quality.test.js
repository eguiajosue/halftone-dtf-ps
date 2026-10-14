'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const engine=require('../plugin/engine'),gain=require('../plugin/gain'),{fillHoles,minAreaFor}=require('../plugin/holes');
const {LiveRenderer,compose}=require('../plugin/live-render'),{MemoryStore,processTiles}=require('../plugin/tiles');
const solid=(w,h,rgba)=>{const a=new Uint8Array(w*h*4);for(let i=0;i<a.length;i+=4)a.set(rgba,i);return a;};
const ink=a=>{let n=0;for(let i=3;i<a.length;i+=4)n+=a[i]===255;return n;};
const base={dpi:300,lpi:30,angle:45,shape:'round',knockout:false,cleanup:'none',minDiameterMM:0};

test('dot-gain curve: parsing, validation and exact inverse',()=>{
 const points=gain.parseGain('90:94, 10:14, 30:41, 50:63, 70:80');
 assert.deepEqual(points.map(p=>p[0]),[10,30,50,70,90]);
 const f=gain.inverse(points);
 assert.equal(f(0),0);assert.equal(f(1),1);assert.ok(Math.abs(f(.41)-.30)<1e-12);assert.ok(Math.abs(f(.63)-.50)<1e-12);
 for(let v=0;v<1;v+=.01)assert.ok(f(v+.01)>=f(v),'monotone');
 assert.equal(gain.parseGain(''),null);assert.equal(gain.inverse(null),null);
 for(const bad of ['10','10:14,10:20','10:30,20:25','0:5','100:100','10:14,20:100','a:b','10:14,20:30,30:40,40:50,50:60,60:70,70:80,80:85,85:90,88:92,89:93'])
  assert.throws(()=>gain.parseGain(bad),/Calibración/,bad);
 assert.match(gain.summary(points),/10 \/ 30 \/ 50 \/ 70 \/ 90 % se pedirá 7 \/ 22 \/ 38 \/ 58 \/ 84 %/);
});
test('gain compensation requests less coverage so the printed tone matches the desired one',async()=>{
 const input=solid(300,300,[40,90,200,128]);
 const plain=ink((await engine.processRGBA(input,300,300,base)).data)/90000;
 const comp=ink((await engine.processRGBA(input,300,300,{...base,gainPoints:'50:63'})).data)/90000;
 assert.ok(Math.abs(plain-.5)<.03,'plain '+plain);
 assert.ok(Math.abs(comp-.5*50/63)<.03,'compensated '+comp);
 assert.throws(()=>engine.validate({gainPoints:'50:40,60:30'}),/crecer/);
});
test('solidAbove turns near-solid shadows into solid; 100 keeps the screen',async()=>{
 const input=solid(300,300,[40,90,200,230]);
 const screened=ink((await engine.processRGBA(input,300,300,base)).data)/90000,capped=ink((await engine.processRGBA(input,300,300,{...base,solidAbove:85})).data)/90000;
 assert.ok(screened<.93&&screened>.85,'screened '+screened);assert.equal(capped,1);
 assert.throws(()=>engine.validate({solidAbove:40}),/solidAbove/);
});
function shadow(){ // opaque shadow with knockout-colored specks and a transparent hole
 const w=200,h=160,a=solid(w,h,[60,120,180,235]);
 for(const [x,y] of [[50,50],[51,50],[120,90]])a.set([0,0,0,255],(y*w+x)*4);
 for(let y=100;y<120;y++)for(let x=140;x<160;x++)a.set([60,120,180,0],(y*w+x)*4);
 return {w,h,a};
}
test('hole fill closes small shadow pores but never prints knockout color or transparency',async()=>{
 const {w,h,a}=shadow(),o={...base,knockout:true,key:'#000000',tolerance:2,softness:5,fillHolesMM:.3,lpi:35};
 const off=await engine.processRGBA(a,w,h,{...o,fillHolesMM:0}),on=await engine.processRGBA(a,w,h,o);
 assert.ok(ink(on.data)>ink(off.data)+200,'ink grew '+ink(off.data)+' -> '+ink(on.data));
 assert.equal(on.stats.filledPixels,ink(on.data)-ink(off.data));
 for(const [x,y] of [[50,50],[51,50],[120,90],[150,110]])assert.equal(on.data[(y*w+x)*4+3],0,`${x},${y} stays empty`);
 for(let p=0;p<w*h;p++)if(on.data[p*4+3]&&!off.data[p*4+3])assert.deepEqual(Array.from(on.data.subarray(p*4,p*4+3)),[60,120,180]);
 // No remaining pore (4-connected empty candidates) is smaller than the minimum.
 const minArea=minAreaFor(.3,300),seen=new Uint8Array(w*h);let smallest=Infinity;
 for(let s=0;s<w*h;s++){if(seen[s]||on.data[s*4+3]||!(a[s*4+3]&&!(a[s*4]===0&&a[s*4+1]===0&&a[s*4+2]===0)))continue;
  const q=[s];seen[s]=1;for(let i=0;i<q.length;i++){const p=q[i],x=p%w,y=(p-x)/w;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const n=ny*w+nx;
   if(!seen[n]&&!on.data[n*4+3]&&a[n*4+3]&&!(a[n*4]===0&&a[n*4+1]===0&&a[n*4+2]===0)){seen[n]=1;q.push(n);}}}smallest=Math.min(smallest,q.length);}
 assert.ok(smallest>=minArea||smallest===Infinity,'smallest pore '+smallest+' vs '+minArea);
 assert.equal(engine.validate({fillHolesMM:0}).fillHolesMM,0);
});
test('fillHoles stops early on large pores and ignores non-candidates',async()=>{
 const w=40,h=40,mask=new Uint8Array(w*h).fill(255),cand=new Uint8Array(w*h);
 for(let y=5;y<9;y++)for(let x=5;x<9;x++){mask[y*w+x]=0;cand[y*w+x]=1;}   // 16 px pore
 for(let y=20;y<22;y++)for(let x=20;x<22;x++){mask[y*w+x]=0;cand[y*w+x]=1;} // 4 px pore
 mask[30*w+30]=0;                                                       // not a candidate
 const r=await fillHoles({data:mask,candidate:cand,width:w,height:h,minArea:10});
 assert.deepEqual(r,{filledPixels:4,filledComponents:1});assert.equal(mask[20*w+20],255);assert.equal(mask[5*w+5],0);assert.equal(mask[30*w+30],0);
});
test('live renderer matches the full engine with gain, solidAbove and hole fill',async()=>{
 const {w,h,a}=shadow(),renderer=new LiveRenderer(a,w,h);
 for(const extra of [{fillHolesMM:.3},{solidAbove:90},{gainPoints:'10:14,30:41,50:63,70:80,90:94'},{fillHolesMM:.25,solidAbove:95,gainPoints:'30:41,70:80',cleanup:'standard',minDiameterMM:.2}]){
  const o={...base,knockout:true,key:'#000000',lpi:35,...extra},n=engine.validate(o),ref=await engine.processRGBA(a,w,h,o);
  const {mask,stats}=await renderer.mask(n),out=compose(await renderer.color(n),mask,w);let diff=0;
  for(let p=0;p<w*h;p++)for(let k=0;k<4;k++)if(out[p*4+k]!==ref.data[p*4+k]){diff++;break;}
  assert.ok(diff<=Math.max(4,w*h*.0005),JSON.stringify(extra)+' diff '+diff);
  assert.ok(Math.abs(stats.inkPixels-ref.stats.inkPixels)<=Math.max(4,w*h*.0005));
 }
});
test('tiled processing with hole fill matches the full image across tile corners',async()=>{
 const w=1100,h=1030,a=new Uint8Array(w*h*4);
 for(let p=0;p<w*h;p++){const x=p%w,y=(p-x)/w;a.set([200,60,90,(x*7+y*13)%11===0?0:236],p*4);}
 const o={...base,lpi:40,fillHolesMM:.3,cleanup:'standard',minDiameterMM:.2,solidAbove:96,gainPoints:'50:60'};
 const full=await engine.processRGBA(a,w,h,o),src=new MemoryStore(w,h,4,a),target=new MemoryStore(w,h,4);
 await processTiles(src,target,o);
 let diff=0;for(let i=0;i<w*h*4;i+=4)if(target.data[i+3]!==full.data[i+3])diff++;
 assert.equal(diff,0,'tile seams differ at '+diff+' pixels');
});
