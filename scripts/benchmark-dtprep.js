'use strict';
// CPU benchmark of the live renderer stages at 25 x 38 cm / 300 ppp (13 MP), including
// the DTPrep-style options. Native Photoshop I/O is excluded. Usage: node scripts/benchmark-dtprep.js
const {performance}=require('node:perf_hooks');
const engine=require('../plugin/engine'),{LiveRenderer}=require('../plugin/live-render');
const width=2965,height=4488,source=new Uint8Array(width*height*4);
for(let p=0;p<width*height;p++){
  const x=p%width,y=(p/width)|0,g=(Math.sin(x/90)+Math.cos(y/70)+2)/4*255+((x*7+y*13)%11);
  source[p*4]=g;source[p*4+1]=g*.8;source[p*4+2]=g*.6;source[p*4+3]=255;
}
const steps=[
  ['first calculation (coverage + screen + area cleanup)',{}],
  ['move a level',{inputBlack:20}],
  ['move a level again',{inputBlack:30}],
  ['euclidean dot (screen only)',{shape:'euclidean',inputBlack:30}],
  ['line with 3 % trim (screen only)',{shape:'line',lineTrim:3,inputBlack:30}],
  ['opening cleanup (after the area one)',{cleanupMode:'opening',inputBlack:30}],
  ['move a level with opening',{cleanupMode:'opening',inputBlack:40}],
  ['pre-smoothing 1 (coverage + opening)',{cleanupMode:'opening',presmooth:1,inputBlack:40}],
  ['pre-smoothing 2 (coverage + opening)',{cleanupMode:'opening',presmooth:2,inputBlack:40}],
  ['move a level with pre-smoothing 2 + opening',{cleanupMode:'opening',presmooth:2,inputBlack:50}]
];
(async()=>{
  const renderer=new LiveRenderer(source,width,height),rows=[];
  for(const [label,options] of steps){
    const n=engine.validate({dpi:300,lpi:30,angle:33,knockout:true,key:'#000000',...options});
    const start=performance.now(),{stats}=await renderer.mask(n);
    rows.push({step:label,ms:Math.round(performance.now()-start),inkPixels:stats.inkPixels});
  }
  console.log(JSON.stringify({node:process.version,width,height,metric:'CPU milliseconds, single run; no native Photoshop I/O',rows},null,2));
})().catch(e=>{console.error(e);process.exit(1);});
