'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function fixture({empty=false,cancel=false,semiExport=false}={}) {
  const calls=[],constants={DocumentMode:{RGB:'rgb'},BitsPerChannelType:{EIGHT:8},NewDocumentMode:{RGB:'rgb-new'},DocumentFill:{TRANSPARENT:'transparent'}};
  const original={id:7,name:'Art.psd',width:80,height:90,resolution:300,mode:'rgb',bitsPerChannel:8,pixelAspectRatio:1,activeLayers:[{id:11}]};
  const result={id:20,layers:[{id:21}],width:80,height:90,resolution:300,mode:'rgb',bitsPerChannel:8,saveAs:{png:async(...a)=>calls.push(['png',...a])}};
  const app={documents:[original],activeDocument:original,createDocument:async o=>{calls.push(['create',o]);Object.assign(result,{width:o.width,height:o.height,resolution:o.resolution});app.documents.push(result);return result;}};
  let nextLayer=22;result.createPixelLayer=async()=>{const layer={id:nextLayer++,visible:true,bringToFront:()=>{result.layers=[layer,...result.layers.filter(l=>l.id!==layer.id)];},delete:()=>{result.layers=result.layers.filter(l=>l.id!==layer.id);}};result.layers.push(layer);return layer;};
  result.layers[0].delete=()=>{result.layers=result.layers.filter(l=>l.id!==21);};
  result.closeWithoutSaving=()=>{calls.push(['close',20]);app.documents=app.documents.filter(d=>d.id!==20);};
  const imaging={getPixels:async o=>{
    if(Object.prototype.hasOwnProperty.call(o,'layerID')&&!Number.isSafeInteger(o.layerID))throw Error('Incorrect type for key: layerID. Expected: number');
    calls.push(['get',o]);
    const b=o.sourceBounds;
    const left=Math.max(b.left,13),top=Math.max(b.top,17),right=Math.min(b.right,23),bottom=Math.min(b.bottom,32);
    const width=Math.max(0,right-left),height=Math.max(0,bottom-top),data=new Uint8Array(width*height*4);
    for(let i=0;i<data.length;i+=4)data.set([230,40,120,empty?0:semiExport&&o.documentID===20?128:255],i);
    return {level:0,sourceBounds:{left,top,right,bottom},imageData:{width,height,components:4,getData:async()=>data,dispose:()=>calls.push(['dispose-read'])}};
  },createImageDataFromBuffer:async(data,o)=>{calls.push(['buffer',o,data.slice()]);return {data:data.slice(),width:o.width,height:o.height,dispose:()=>calls.push(['dispose-write'])};},
  putPixels:async o=>{calls.push(['put',o]);const layer=result.layers.find(l=>l.id===o.layerID);if(o.replace||!layer.data)layer.data=new Uint8Array(result.width*result.height*4);for(let y=0;y<o.imageData.height;y++){const start=((o.targetBounds.top+y)*result.width+o.targetBounds.left)*4;layer.data.set(o.imageData.data.subarray(y*o.imageData.width*4,(y+1)*o.imageData.width*4),start);}},encodeImageData:async()=> 'jpeg'};
  const autoClose=new Set();let historyLayers;
  original.selection={bounds:null};
  imaging.getSelection=async o=>{const b=o.sourceBounds,data=new Uint8Array((b.right-b.left)*(b.bottom-b.top));if(b.left<=13&&b.right>13&&b.top<=17&&b.bottom>17)data[(17-b.top)*(b.right-b.left)+13-b.left]=255;return {sourceBounds:b,imageData:{width:b.right-b.left,height:b.bottom-b.top,components:1,getData:async()=>data,dispose:()=>{}}};};
  const ctx={isCancelled:cancel,reportProgress:()=>{},hostControl:{registerAutoCloseDocument:async id=>{calls.push(['register',id]);autoClose.add(id);},unregisterAutoCloseDocument:async id=>{calls.push(['unregister',id]);autoClose.delete(id);},suspendHistory:async()=>{historyLayers=result.layers.slice();return 'history';},resumeHistory:async(id,commit)=>{calls.push(['history',commit]);if(!commit)result.layers=historyLayers;}}};
  const core={executeAsModal:async(fn,o)=>{calls.push(['modal',o]);try{return await fn(ctx);}finally{for(const id of autoClose)if(id===result.id)result.closeWithoutSaving();autoClose.clear();}}};
  const realTiles=require('../plugin/tiles'),stores=[];
  const tiles={...realTiles,createDiskStore:async(w,h,c=4)=>{const store=new realTiles.MemoryStore(w,h,c);store.kind='disk';stores.push(store);return store;}};
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../plugin/host'),'utf8'),{module,
    require:name=>name==='photoshop'?{app,imaging,core,constants}:name==='./tiles'?tiles:require('../plugin/'+name.replace('./','')),
    Uint8Array,Array,setTimeout,Promise});
  return {host:module.exports,calls,app,original,result,stores,imaging};
}
test('native composite reads omit layerID during preparation and PNG export',async()=>{
 const f=fixture(),o={knockout:false,minDiameterMM:0};
 const result=await f.host.apply('composite',o);
 await f.host.exportPNG(result.documentID,{name:'result.png'});
 const reads=f.calls.filter(c=>c[0]==='get');assert.ok(reads.length>=2);
 for(const [,request]of reads)assert.equal(Object.prototype.hasOwnProperty.call(request,'layerID'),false);
 assert.ok(f.calls.some(c=>c[0]==='png'));
});
test('native layer reads retain numeric ID; invalid IDs fail before Imaging API',async()=>{
 const f=fixture();await f.host.apply('layer',{knockout:false,minDiameterMM:0});
 assert.equal(f.calls.find(c=>c[0]==='get')[1].layerID,11);
 const g=fixture();g.original.activeLayers[0].id='11';
 await assert.rejects(g.host.apply('layer',{knockout:false,minDiameterMM:0}),/no es numérico/);
 assert.equal(g.calls.filter(c=>c[0]==='get').length,0);
});
test('host writes full resized canvas at origin; preserves layer offset; source untouched',async()=>{
  const f=fixture();const r=await f.host.apply('layer',{knockout:false,minDiameterMM:0});
  assert.equal(r.documentID,20);
  const create=f.calls.find(c=>c[0]==='create')[1];
  assert.equal(create.width,80);assert.equal(create.height,90);assert.equal(create.resolution,300);assert.equal(create.fill,'transparent');
  const put=f.calls.find(c=>c[0]==='put')[1];assert.equal(put.targetBounds.left,0);assert.equal(put.targetBounds.top,0);
  const data=f.calls.find(c=>c[0]==='buffer')[2];assert.equal(data[(17*80+13)*4+3],255);assert.equal(data[3],0);
  assert.equal(f.original.width,80);assert.equal(f.original.resolution,300);
  assert.equal(f.calls.filter(c=>c[0]==='dispose-read').length,1);assert.equal(f.calls.filter(c=>c[0]==='dispose-write').length,1);
  assert.ok(f.calls.some(c=>c[0]==='unregister'));
});
test('staged session captures pristine resized source once and updates existing output only',async()=>{
  const f=fixture();f.original.resolution=150;
  const o={documentID:7,knockout:false,minDiameterMM:0,focusX:50,focusY:50};
  const session=await f.host.beginSession('layer',o);
  assert.equal(session.size.width,160);assert.equal(session.size.height,180);assert.equal(session.documentID,20);assert.equal(session.preview.exact,true);
  const reads=f.calls.filter(c=>c[0]==='get').length,source=session.source.slice(),previews=[];
  const ctx={check:()=>{},current:()=>true,pause:async()=>{}};
  f.app.activeDocument=f.result;
  await f.host.updateSession(session,{...o,outputWhite:128},ctx,p=>previews.push(p));
  assert.deepEqual(previews.map(p=>p.exact),[false,true]);
  assert.equal(f.calls.filter(c=>c[0]==='get').length,reads);
  assert.equal(f.calls.filter(c=>c[0]==='create').length,1);
  assert.equal(f.calls.filter(c=>c[0]==='put').length,2);
  assert.deepEqual(session.source,source);assert.ok(session.stats.inkPixels>0);
  await f.host.updateSession(session,o,ctx,()=>{});
  const buffers=f.calls.filter(c=>c[0]==='buffer');assert.deepEqual(buffers[0][2],buffers[2][2]);
  for(let i=3;i<buffers[1][2].length;i+=4)assert.ok([0,255].includes(buffers[1][2][i]));
});
test('superseded session work never writes pixels; cancel closes only the working document',async()=>{
  const f=fixture(),o={knockout:false,minDiameterMM:0,focusX:50,focusY:50};
  const session=await f.host.beginSession('layer',o);const writes=f.calls.filter(c=>c[0]==='put').length;
  let current=true;const ctx={check:()=>{if(!current)throw Error('replaced');},current:()=>current,pause:async()=>{current=false;}};
  await assert.rejects(f.host.updateSession(session,{...o,inputMidtone:2},ctx,()=>{}),/replaced/);
  assert.equal(f.calls.filter(c=>c[0]==='put').length,writes);
  await f.host.cancelSession(session);assert.equal(session.source,null);assert.equal(session.closed,true);
  assert.deepEqual(f.app.documents.map(d=>d.id),[7]);await f.host.cancelSession(session);
  assert.equal(f.calls.filter(c=>c[0]==='close').length,1);
});
test('stage creation accepts an empty knockout for correction; invalid focus is rejected before reads',async()=>{
  const f=fixture({empty:true});const s=await f.host.beginSession('layer',{knockout:false,minDiameterMM:0});assert.equal(s.stats.inkPixels,0);
  await f.host.cancelSession(s);
  const g=fixture();await assert.rejects(g.host.beginSession('layer',{focusX:NaN}),/Centro/);assert.equal(g.calls.length,0);
});
test('closed or externally resized working document blocks live update',async()=>{
  const f=fixture(),o={knockout:false,minDiameterMM:0,focusX:50,focusY:50};
  const s=await f.host.beginSession('layer',o),ctx={check:()=>{},pause:async()=>{}};
  f.result.resolution=72;await assert.rejects(f.host.updateSession(s,o,ctx),/cambió/);
  f.result.resolution=300;f.app.documents=[f.original];await assert.rejects(f.host.updateSession(s,o,ctx),/cerrado/);
});
test('host resamples to 300 ppi BEFORE creating a 300 ppi document',async()=>{
  const f=fixture();f.original.resolution=150;
  const r=await f.host.apply('layer',{knockout:false,minDiameterMM:0});
  const create=f.calls.find(c=>c[0]==='create')[1];assert.equal(create.width,160);assert.equal(create.height,180);assert.equal(create.resolution,300);
  assert.equal(r.stats.cellPX,300/35);assert.equal(f.original.resolution,150);
  const data=f.calls.find(c=>c[0]==='buffer')[2];for(let i=3;i<data.length;i+=4)assert.ok(data[i]===0||data[i]===255);
});
test('pinned source survives active document changes after output creation',async()=>{
  const f=fixture();f.app.activeDocument=f.result;
  const r=await f.host.apply('layer',{documentID:7,knockout:false,minDiameterMM:0});
  assert.equal(r.documentID,20);assert.equal(f.calls.find(c=>c[0]==='get')[1].documentID,7);
});
test('empty output and cancellation do not create output document',async()=>{
  for(const config of [{empty:true},{cancel:true}]){
    const f=fixture(config);await assert.rejects(f.host.apply('layer',{knockout:false,minDiameterMM:0}));assert.ok(!f.calls.some(c=>c[0]==='create'));
  }
});
test('host rejects unsupported mode and excessive final canvas before allocating pixels',async()=>{
  const f=fixture();f.original.mode='cmyk';await assert.rejects(f.host.apply('layer',{}),/RGB/);
  f.original.mode='rgb';f.original.width=11800;f.original.height=11800;
  await assert.rejects(f.host.apply('layer',{}),/128 megap/);assert.ok(!f.calls.some(c=>c[0]==='get'));
});
test('export validates current alpha and resolution and saves as PNG copy',async()=>{
  const f=fixture();f.app.documents.push(f.result);await f.host.exportPNG(20,{name:'test.png'});
  assert.equal(f.calls.find(c=>c[0]==='png')[3],true);
  const g=fixture({semiExport:true});g.app.documents.push(g.result);
  await assert.rejects(g.host.exportPNG(20,{name:'test.png'}),/semitrans/);assert.ok(!g.calls.some(c=>c[0]==='png'));
  f.result.resolution=72;await assert.rejects(f.host.exportPNG(20,{name:'test.png'}),/300 ppp/);
});
test('preview rejects invalid focus before entering Photoshop modal',async()=>{
  const f=fixture();await assert.rejects(f.host.preview('layer',{}, {x:NaN,y:50}),/Centro/);assert.equal(f.calls.length,0);
});
test('preview uses final scale; renders alternate views without re-reading Photoshop',async()=>{
  const f=fixture();f.original.resolution=150;
  const p=await f.host.preview('layer',{knockout:false,minDiameterMM:0,key:'#000000',viewMode:'mask'},{x:50,y:50});
  assert.equal(p.dpi,300);assert.equal(p.size.width,160);assert.equal(p.src.width,160);
  const reads=f.calls.filter(c=>c[0]==='get').length;
  for(const view of ['original','garment','transparent','mask']) assert.match(await f.host.renderPreview(p,view,{key:'#ff0000',linkBackground:true}),/^data:image\/jpeg/);
  assert.equal(f.calls.filter(c=>c[0]==='get').length,reads);
});

test('disk-mode host assembles offset tiles and atomically replaces layers; superseded writes roll back',async()=>{
  const f=fixture();f.original.width=640;f.original.height=600;
  const o={knockout:false,minDiameterMM:0,focusX:50,focusY:50,memoryMode:'disk'};
  const s=await f.host.beginSession('layer',o);assert.equal(s.memoryMode,'disk');assert.equal(s.source,null);
  assert.equal(f.calls.filter(c=>c[0]==='put').length,4);assert.equal(f.result.layers[0].data[(17*640+13)*4+3],255);
  const base=f.result.layers[0].data.slice();const ctx={check:()=>{},pause:async()=>{},current:()=>true};
  await f.host.updateSession(s,{...o,outputWhite:128},ctx,()=>{});assert.notEqual(s.layerID,21);assert.equal(f.result.layers.length,1);
  const committedID=s.layerID,committed=f.result.layers[0].data.slice();let writes=f.calls.filter(c=>c[0]==='put').length;
  const interrupted={...ctx,check:()=>{if(f.calls.filter(c=>c[0]==='put').length>writes)throw Error('superseded');}};
  await assert.rejects(f.host.updateSession(s,o,interrupted,()=>{}),/superseded/);
  assert.equal(s.layerID,committedID);assert.equal(f.result.layers.length,1);assert.deepEqual(f.result.layers[0].data,committed);assert.ok(f.calls.some(c=>c[0]==='history'&&c[1]===false));
  await f.host.updateSession(s,o,ctx,()=>{});assert.deepEqual(f.result.layers[0].data,base);
  await f.host.cancelSession(s);assert.ok(f.stores.every(store=>store.data===null));assert.deepEqual(f.app.documents.map(d=>d.id),[7]);
});
test('selection capture uses source coordinates and preserves a selected knockout-colored pixel',async()=>{
 const f=fixture(),o={knockout:false,minDiameterMM:0,focusX:50,focusY:50};const s=await f.host.beginSession('layer',o);
 await assert.rejects(f.host.captureProtection(s),/Haz una selección/);f.original.selection.bounds={left:13,top:17,right:14,bottom:18};
 await f.host.captureProtection(s);assert.equal(s.protectStore.data[17*80+13],255);
 await f.host.updateSession(s,{...o,knockout:true,key:'#e62878',protection:'selection',outputWhite:0,cleanup:'high',minDiameterMM:.3},{check:()=>{},pause:async()=>{},current:()=>true},()=>{});
 assert.equal(f.result.layers[0].data[(17*80+13)*4+3],255);assert.equal(s.stats.inkPixels,1);await f.host.cancelSession(s);
});
test('huge native source is adaptively subdivided before reading, without raising native tile budget',async()=>{
 const f=fixture();f.original.width=10000;f.original.height=10000;
 const s=await f.host.beginSession('layer',{widthCM:2.54,knockout:false,minDiameterMM:0});
 assert.equal(s.size.width,300);for(const call of f.calls.filter(c=>c[0]==='get')){const b=call[1].sourceBounds;assert.ok((b.right-b.left)*(b.bottom-b.top)<=16000000);}
 assert.ok(f.calls.filter(c=>c[0]==='get').length>3);await f.host.cancelSession(s);
});
test('batch opening protects documents already open and closes only owned sources, including invalid modes',async()=>{
 const f=fixture();f.app.open=async()=>f.original;
 const existing=await f.host.openBatchSource({name:'Art.psd'});assert.equal(existing.owned,false);await f.host.closeBatchSource(existing);assert.equal(f.app.documents.length,1);
 const owned={...f.original,id:30,closeWithoutSaving:()=>{f.calls.push(['closeOwned']);f.app.documents=f.app.documents.filter(d=>d.id!==30);}};
 f.app.open=async()=>{f.app.documents.push(owned);return owned;};
 const source=await f.host.openBatchSource({name:'other.psd'});assert.equal(source.owned,true);await f.host.closeBatchSource(source);assert.deepEqual(f.app.documents.map(d=>d.id),[7]);
 owned.mode='cmyk';await assert.rejects(f.host.openBatchSource({name:'bad.psd'}),/RGB/);assert.deepEqual(f.app.documents.map(d=>d.id),[7]);
});
test('cancelling initial tiled write closes incomplete output and disposes source/result caches',async()=>{
 const f=fixture();await assert.rejects(f.host.beginSession('layer',{memoryMode:'disk',knockout:false,minDiameterMM:0},(phase,p)=>{if(phase==='write'&&p>0)throw Error('stop');}),/stop/);
 assert.deepEqual(f.app.documents.map(d=>d.id),[7]);assert.ok(f.stores.every(store=>store.data===null));
});

test('audit regressions: empty current composite and altered approved dimensions cannot export',async()=>{
 const empty=fixture({empty:true}),session=await empty.host.beginSession('layer',{knockout:false,minDiameterMM:0});
 await assert.rejects(empty.host.exportPNG(session.documentID,{}),/vacío/);assert.equal(empty.calls.filter(c=>c[0]==='png').length,0);
 const f=fixture(),s=await f.host.beginSession('layer',{knockout:false,minDiameterMM:0});f.result.width=40;f.result.height=45;
 await assert.rejects(f.host.exportPNG(s.documentID,{}),/tamaño cambió/);assert.equal(f.calls.filter(c=>c[0]==='png').length,0);
});
test('pinned layer and source geometry are checked before preparing pixels',async()=>{
 const f=fixture();f.original.layers=[{id:11},{id:12}];f.original.activeLayers=[{id:12}];
 const s=await f.host.beginSession('layer',{layerID:11,sourceWidth:80,sourceHeight:90,knockout:false,minDiameterMM:0});assert.equal(f.calls.find(c=>c[0]==='get')[1].layerID,11);await f.host.cancelSession(s);
 const g=fixture();await assert.rejects(g.host.beginSession('layer',{sourceWidth:79,sourceHeight:90}),/origen cambió/);assert.equal(g.calls.filter(c=>c[0]==='get').length,0);
});
test('trimmed art dimensions and captured selection retain native source coordinates',async()=>{
 const f=fixture(),o={trimArt:true,widthCM:2.54,knockout:false,minDiameterMM:0},s=await f.host.beginSession('layer',o);
 assert.equal(s.size.width,300);assert.equal(s.size.height,450);assert.deepEqual([s.size.frame.left,s.size.frame.top,s.size.frame.width,s.size.frame.height],[13,17,10,15]);
 assert.equal(f.original.width,80);f.original.selection.bounds={left:13,top:17,right:14,bottom:18};await f.host.captureProtection(s);assert.equal(s.protectStore.data[0],255);await f.host.cancelSession(s);
});
test('initial compute cancellation creates no output; manually hidden or translucent working layers block updates',async()=>{
 const f=fixture();await assert.rejects(f.host.beginSession('layer',{knockout:false},phase=>{if(phase==='screen'){const e=Error('stopped');e.cancelled=true;throw e;}}),/stopped/);assert.equal(f.app.documents.length,1);
 const g=fixture(),s=await g.host.beginSession('layer',{knockout:false,minDiameterMM:0}),ctx={check:()=>{},pause:async()=>{},current:()=>true};
 g.result.layers[0].opacity=50;await assert.rejects(g.host.updateSession(s,{focusX:50,focusY:50},ctx),/opacidad/);
 g.result.layers[0].opacity=100;g.result.layers[0].visible=false;await assert.rejects(g.host.updateSession(s,{focusX:50,focusY:50},ctx),/visibilidad/);
});
test('recoverable project snapshot opens without the original document and supports further edits',async()=>{
 const f=fixture(),source=new (require('../plugin/tiles').MemoryStore)(16,16),data=new Uint8Array(16*16*4);for(let i=0;i<data.length;i+=4)data.set([255,100,40,255],i);await source.put({left:0,top:0,width:16,height:16},data);
 const size=require('../plugin/sizing').plan(16,16,300),s=await f.host.beginFromSnapshot({sourceStore:source,size},{knockout:false,minDiameterMM:0});assert.equal(s.sourceID,null);assert.equal(s.stats.inkPixels,256);
 await f.host.updateSession(s,{knockout:false,outputWhite:150,minDiameterMM:0,focusX:50,focusY:50},{check:()=>{},pause:async()=>{},current:()=>true});assert.ok(s.stats.inkPixels<256);await f.host.cancelSession(s);assert.equal(source.data,null);
});

test('extreme area reduction streams a single output pixel from more than 16 MP of native data',async()=>{
 const f=fixture();f.original.width=6000;f.original.height=3000;
 f.imaging.getPixels=async o=>{const b=o.sourceBounds,w=b.right-b.left,h=b.bottom-b.top;f.calls.push(['get',o]);assert.ok(w*h<=512*512);const data=new Uint8Array(w*h*4).fill(255);return {level:0,sourceBounds:b,imageData:{width:w,height:h,components:4,getData:async()=>data,dispose:()=>{}}};};
 const p=await f.host.preview('composite',{widthCM:2.54/300,knockout:false,cleanup:'none'},{x:50,y:50});
 assert.equal(p.src.width,1);assert.equal(p.src.height,1);assert.deepEqual(Array.from(p.src.data),[255,255,255,255]);assert.ok(f.calls.filter(c=>c[0]==='get').length>60);
});

test('native views preserve the printable layer and are removed before releasing for export',async()=>{
 const f=fixture(),o={knockout:false,minDiameterMM:0,focusX:50,focusY:50,key:'#000000'},s=await f.host.beginSession('layer',o);
 const original=f.result.layers[0],pixels=original.data.slice();
 for(const mode of ['original','garment','mask','compare']){
  await f.host.workspaceView(s,mode,{...o,comparePosition:50});assert.equal(f.result.layers.length,2);assert.notEqual(s.workspaceLayerID,s.layerID);assert.deepEqual(original.data,pixels);
 }
 await f.host.workspaceView(s,'transparent',o);assert.equal(f.result.layers.length,1);assert.equal(s.workspaceLayerID,null);
 await f.host.workspaceView(s,'mask',o);
 await f.host.updateSession(s,{...o,outputWhite:160},{check:()=>{},pause:async()=>{},current:()=>true},()=>{});
 assert.equal(f.result.layers.length,2);await f.host.releaseSession(s);assert.equal(f.result.layers.length,1);assert.equal(s.closed,true);assert.equal(f.result.layers[0].id,s.layerID);
});
test('a failed workspace presentation rolls back its layer and keeps the last view and source',async()=>{
 const f=fixture(),o={knockout:false,minDiameterMM:0,focusX:50,focusY:50,key:'#000000'},s=await f.host.beginSession('layer',o);
 await f.host.workspaceView(s,'garment',o);const id=s.workspaceLayerID,before=f.result.layers.map(l=>l.id);let calls=0;
 await assert.rejects(f.host.workspaceView(s,'mask',o,()=>{if(++calls>3)throw Error('replaced view');}),/replaced view/);
 assert.equal(s.workspaceLayerID,id);assert.deepEqual(f.result.layers.map(l=>l.id),before);assert.equal(s.closed,false);await f.host.cancelSession(s);assert.deepEqual(f.app.documents.map(d=>d.id),[7]);
});
