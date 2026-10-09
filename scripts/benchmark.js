'use strict';
// Comparative CPU benchmark. Native Photoshop I/O is deliberately excluded.
const {performance}=require('node:perf_hooks'),path=require('node:path'),crypto=require('node:crypto');
const current=require('../plugin/engine');
const previous=process.argv[2]?require(path.resolve(process.argv[2])):null;
const width=2048,height=2048,source=new Uint8Array(width*height*4);
for(let p=0;p<width*height;p++){const x=p%width,y=Math.floor(p/width);source[p*4]=(x*17+y*3)%256;source[p*4+1]=(x*5+y*11)%256;source[p*4+2]=(x*7+y*19)%256;source[p*4+3]=255;}
const scenarios=[['solid',{knockout:false,cleanup:'none'}],['knockout',{key:'#000000',inputBlack:7,inputMidtone:2,inputWhite:100,cleanup:'none'}],['gradient',{key:'#000000',cleanup:'none'}],['checkerboard',null]];
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
async function run(engine,o){return o?(await engine.processRGBA(source,width,height,o)).data:engine.composite(source,width,height,null);}
(async()=>{
 const rows=[];for(const [scenario,options]of scenarios){
  const timings={before:[],after:[]};let beforeHash,afterHash;
  for(const [label,engine]of [['before',previous],['after',current]])if(engine)await run(engine,options);
  for(let round=0;round<5;round++)for(const [label,engine]of (round%2?[['after',current],['before',previous]]:[['before',previous],['after',current]]))if(engine){
   const start=performance.now(),data=await run(engine,options);timings[label].push(performance.now()-start);
   if(label==='before')beforeHash=hash(data);else afterHash=hash(data);
  }
  if(previous&&beforeHash!==afterHash)throw Error('Output changed: '+scenario);
  const median=a=>a.length?a.sort((a,b)=>a-b)[Math.floor(a.length/2)]:null;
  const beforeMs=median(timings.before),afterMs=median(timings.after);
  rows.push({scenario,beforeMs,afterMs,speedup:beforeMs?beforeMs/afterMs:null,identical:previous?beforeHash===afterHash:null});
 }
 console.log(JSON.stringify({node:process.version,width,height,runs:5,metric:'median CPU milliseconds; no native Photoshop I/O',rows},null,2));
})().catch(e=>{console.error(e);process.exit(1);});
