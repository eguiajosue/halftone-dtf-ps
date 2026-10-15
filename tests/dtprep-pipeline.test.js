'use strict';
/* Techniques taken from the DTPrep study (docs/PATRONES-DTPREP.md, docs/PASOS-TRAMADO-DTPREP.md):
 * equalized euclidean dot, trimmed line, LPI-driven morphological opening,
 * coverage pre-smoothing and the tones-per-cell limit. Own matrices only. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const engine=require('../plugin/engine'),morph=require('../plugin/morph'),smooth=require('../plugin/smooth');
const {LiveRenderer,compose}=require('../plugin/live-render'),{MemoryStore,processTiles}=require('../plugin/tiles');
const diagnostics=require('../plugin/diagnostics'),recipes=require('../plugin/recipes'),{LiveController}=require('../plugin/live');
function solid(w,h,rgba){const a=new Uint8Array(w*h*4);for(let i=0;i<a.length;i+=4)a.set(rgba,i);return a;}
function art(w,h){const data=new Uint8Array(w*h*4);for(let p=0;p<w*h;p++){const x=p%w,y=(p-x)/w;data.set([(x*17+y*3)%256,(x*5+y*11)%256,(x*7+y*19)%256,p%7===0?0:p%5===0?255:(x*13+y*23)%256],p*4);}return data;}
const alphaOf=r=>{const out=new Uint8Array(r.length/4);for(let p=0;p<out.length;p++)out[p]=r[p*4+3];return out;};

test('euclidean dot: grows from the center, touches at 50 % and closes as corner holes',()=>{
 const t=(u,v)=>engine.threshold(u,v,'euclidean');
 assert.ok(t(.5,.5)<.001,'cell center prints first');
 assert.ok(t(0,0)>.999,'cell corner prints last');
 assert.ok(Math.abs(t(0,.5)-.5)<.01&&Math.abs(t(.5,0)-.5)<.01,'edge midpoints join at 50 %');
 // Monotone along the axis and along the diagonal.
 let last=-1;for(let k=0;k<=50;k++){const v=t(.5,.5+k/100);assert.ok(v>=last,'axis '+k);last=v;}
 last=-1;for(let k=0;k<=50;k++){const v=t(.5+k/100,.5+k/100);assert.ok(v>=last,'diagonal '+k);last=v;}
 // Below 50 % the dots are separate; above it they are joined through the edge midpoints.
 const cell=40,at=(tone,x,y)=>t((x+.5)/cell,(y+.5)/cell)<tone;
 assert.equal(at(.45,0,cell/2-1)||at(.45,cell-1,cell/2-1)||at(.45,cell/2-1,0),false);
 assert.equal(at(.55,0,cell/2-1)&&at(.55,cell/2-1,0),true);
});

test('euclidean dot is equalized: printed area follows the tone, as a rank-ordered matrix',()=>{
 const size=400;
 for(const tone of [.05,.2,.4,.5,.6,.8,.95]){
  let n=0;for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(engine.threshold((x+.5)/size,(y+.5)/size,'euclidean')<tone)n++;
  assert.ok(Math.abs(n/size**2-tone)<.006,tone+': '+n/size**2);
 }
});

test('line trim clips the profile: no filaments in the lights, solid shadows',async()=>{
 assert.equal(engine.threshold(.3,.5,'line',0),0);assert.equal(engine.threshold(.3,.5,'line',.03),.03);
 assert.ok(Math.abs(engine.threshold(.3,0,'line',.03)-.97)<1e-12);
 assert.equal(engine.threshold(.3,.2,'round',.03),engine.threshold(.3,.2,'round'),'trim only affects lines');
 const o={dpi:300,lpi:5,angle:0,knockout:false,cleanup:'none',shape:'line'}; // 60 px cells: fine enough for a 2 % tone
 const ink=async(alpha,lineTrim)=>{const r=await engine.processRGBA(solid(120,120,[10,20,30,alpha]),120,120,{...o,lineTrim});return alphaOf(r.data).filter(Boolean).length;};
 assert.ok(await ink(5,0)>0,'a 2 % tone prints filaments without trim');
 assert.equal(await ink(5,3),0,'and nothing with a 3 % trim');
 assert.equal(await ink(250,3),14400,'a 98 % tone is solid with a 3 % trim');
 assert.ok(await ink(250,0)<14400);
 assert.throws(()=>engine.validate({lineTrim:11}),/lineTrim/);
});

test('the screen angle is explicit: a positive angle runs the lines clockwise on screen',async()=>{
 const r=await engine.processRGBA(solid(120,120,[0,0,0,128]),120,120,{dpi:300,lpi:30,angle:45,shape:'line',knockout:false,cleanup:'none'});
 const a=alphaOf(r.data);let along=0,across=0,total=0;
 for(let y=10;y<100;y++)for(let x=10;x<100;x++){total++;if(a[y*120+x]===a[(y+1)*120+x+1])along++;if(a[y*120+x]===a[(y-1)*120+x+1])across++;}
 assert.ok(along/total>.97,'lines follow the down-right diagonal ('+along/total+')');
 assert.ok(across/total<.9);
});

test('opening cleanup: Low/Standard/High parameters follow the LPI',()=>{
 assert.equal(morph.featherFor(20,'standard'),3);assert.equal(morph.featherFor(20,'high'),3.5);
 assert.equal(morph.featherFor(30,'standard'),2);assert.equal(morph.featherFor(30,'high'),2.5);
 assert.equal(morph.featherFor(40,'standard'),1);assert.equal(morph.featherFor(60,'high'),1.5);
 const n=l=>engine.validate({dpi:300,lpi:30,cleanup:l});
 assert.equal(morph.openingParams(n('none')),null);
 assert.deepEqual(morph.openingParams(n('standard')),{radius:1,feather:2,blur:1});
 assert.equal(morph.openingParams(n('high')).radius,2);
 assert.ok(morph.reach(n('high'))>morph.reach(n('standard')));
});

test('opening removes specks and filaments, keeps solid areas, never adds ink and respects protection',async()=>{
 const w=60,h=40,mask=new Uint8Array(w*h);
 for(let y=5;y<25;y++)for(let x=5;x<25;x++)mask[y*w+x]=255;            // 20 x 20 block
 mask[10*w+40]=255;mask[20*w+50]=mask[20*w+51]=255;                    // specks
 for(let x=30;x<55;x++)mask[35*w+x]=255;                               // 1 px line
 const before=mask.slice();
 for(const level of ['low','standard','high']){
  const copy=mask.slice(),n=engine.validate({dpi:300,lpi:30,cleanup:level});
  const r=await morph.openMask(copy,w,h,morph.openingParams(n),null);
  for(let p=0;p<w*h;p++)assert.ok(!copy[p]||before[p],'ink added at '+p);
  assert.equal(copy[10*w+40]+copy[20*w+50]+copy[35*w+40],0,level+': specks and line are gone');
  assert.equal(copy[15*w+15],255,level+': block interior is intact');
  assert.ok(r.removedPixels>=27&&r.removedPixels<=27+16,level+' '+r.removedPixels);
 }
 const keep=new Uint8Array(w*h);keep[35*w+40]=255;
 const protectedCopy=mask.slice();await morph.openMask(protectedCopy,w,h,morph.openingParams(engine.validate({dpi:300,lpi:30,cleanup:'high'})),keep);
 assert.equal(protectedCopy[35*w+40],255,'protected pixels survive');
 const untouched=mask.slice();assert.deepEqual((await morph.openMask(untouched,w,h,null)).removedPixels,0);assert.deepEqual(untouched,mask);
});

test('opening is not applied at the canvas border: art touching the edge keeps its shape',async()=>{
 const w=30,h=30,mask=new Uint8Array(w*h).fill(255);
 const r=await morph.openMask(mask,w,h,morph.openingParams(engine.validate({dpi:300,lpi:30,cleanup:'high'})),null);
 assert.equal(r.removedPixels,0);
});

test('cached renderer matches the full engine with euclidean dots, trimmed lines, opening and pre-smoothing',async()=>{
 const w=150,h=110,data=art(w,h),renderer=new LiveRenderer(data,w,h);
 const cases=[{shape:'euclidean'},{shape:'line',lineTrim:3},{cleanupMode:'opening'},{cleanupMode:'opening',cleanup:'high',lpi:20},
  {presmooth:1},{presmooth:2},{presmooth:2,cleanupMode:'opening',shape:'euclidean',fillHolesMM:.25},{presmooth:1,knockout:false,halftone:false}];
 for(const c of cases){
  const o={dpi:300,lpi:30,angle:33,...c},n=engine.validate(o),reference=await engine.processRGBA(data,w,h,o);
  const {mask}=await renderer.mask(n),out=compose(await renderer.color(n),mask,w);let different=0;
  for(let p=0;p<w*h;p++)for(let k=0;k<4;k++)if(out[p*4+k]!==reference.data[p*4+k]){different++;break;}
  assert.ok(different<=Math.ceil(w*h/3000),`${JSON.stringify(c)}: ${different} px`);
  for(const v of mask)assert.ok(v===0||v===255);
 }
});

test('pre-smoothing keeps the silhouette, flattens noise and keeps edges',()=>{
 const w=90,h=60,at=(x,y)=>y*w+x;
 // Transparent half: opaque pixels do not darken near the border.
 const alpha=new Uint8Array(w*h*4),plane=new Uint16Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(x>=45){alpha[at(x,y)*4+3]=255;plane[at(x,y)]=30000;}}
 for(const mode of [1,2]){
  const copy=plane.slice();smooth.smoothCoverage(copy,w,h,{mode,alpha:{data:alpha,stride:4,offset:3}});
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)assert.ok(Math.abs(copy[at(x,y)]-(x>=45?30000:0))<=1,`mode ${mode} ${x},${y}: ${copy[at(x,y)]}`);
 }
 // Noise over a step edge.
 const noisy=new Uint16Array(w*h);let seed=7;const rnd=()=>(seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)noisy[at(x,y)]=Math.round((x<45?10000:50000)+(rnd()-.5)*8000);
 const spread=(a,x0,x1)=>{let s=0,s2=0,n=0;for(let y=15;y<45;y++)for(let x=x0;x<x1;x++){const v=a[at(x,y)];s+=v;s2+=v*v;n++;}return Math.sqrt(s2/n-(s/n)**2);};
 const g=noisy.slice(),e=noisy.slice();smooth.smoothCoverage(g,w,h,{mode:1});smooth.smoothCoverage(e,w,h,{mode:2});
 assert.ok(spread(g,10,35)<spread(noisy,10,35)*.6,'Gaussian reduces noise');
 assert.ok(spread(e,10,35)<spread(g,10,35),'the surface stage reduces it further');
 // The reduced grid softens an edge over one 4 px block, but a 40000 step keeps well over half its contrast.
 assert.ok(e[at(46,30)]-e[at(43,30)]>22000,'the step survives the edge-preserving stage');
 assert.ok(Math.abs(e[at(30,30)]-10000)<2500&&Math.abs(e[at(60,30)]-50000)<2500,'flat areas keep their level');
 
 const off=noisy.slice();smooth.smoothCoverage(off,w,h,{mode:0});assert.deepEqual(off,noisy,'mode 0 is a no-op');
});

test('smoothing and opening give identical results through tiles and whole image',async()=>{
 const w=700,h=560,data=art(w,h);
 for(const o of [{presmooth:2,cleanupMode:'opening',cleanup:'high'},{presmooth:1,fillHolesMM:.2,cleanupMode:'opening'}]){
  const options={dpi:300,lpi:30,angle:33,shape:'euclidean',...o},whole=await engine.processRGBA(data,w,h,options);
  const target=new MemoryStore(w,h);await processTiles(new MemoryStore(w,h,4,data),target,options);
  let different=0;for(let i=0;i<whole.data.length;i++)if(whole.data[i]!==target.data[i])different++;
  assert.equal(different,0,JSON.stringify(o));
 }
});

test('tones per cell: the warning appears when a cell holds fewer than 50',()=>{
 for(const [lpi,tones] of [[20,225],[30,100],[40,56],[50,36],[60,25]])assert.equal(diagnostics.tonesPerCell(lpi),tones);
 const has=lpi=>diagnostics.warnings({lpi,halftone:true}).some(m=>/tonos/.test(m));
 assert.equal(has(30),false);assert.equal(has(40),false);assert.equal(has(45),true);assert.equal(has(60),true);
 assert.equal(diagnostics.warnings({lpi:60,halftone:false}).some(m=>/tonos/.test(m)),false);
 assert.equal(diagnostics.warnings({cleanupMode:'opening',cleanup:'high',minDiameterMM:2,lpi:20}).some(m=>/limpieza puede borrar/.test(m)),false);
});

test('recipes and validation accept the new options and reject bad values',()=>{
 assert.deepEqual(recipes.options({lineTrim:3,presmooth:2,cleanupMode:'opening',shape:'euclidean'}),{lineTrim:3,presmooth:2,cleanupMode:'opening',shape:'euclidean'});
 assert.throws(()=>recipes.options({presmooth:3}),/Suavizado/);assert.throws(()=>recipes.options({cleanupMode:'x'}),/limpieza/);
 assert.equal(engine.validate({}).cleanupMode,'area');assert.equal(engine.validate({}).presmooth,0);assert.equal(engine.validate({}).lineTrim,0);
});

test('a fast request overtakes the slow wait of an earlier one',async()=>{
 const seen=[],live=new LiveController(async job=>{seen.push(job);},{delay:400});
 live.request('slow');live.request('fast',5);
 await new Promise(r=>setTimeout(r,80));
 assert.deepEqual(seen,['fast']);await live.dispose();
});
