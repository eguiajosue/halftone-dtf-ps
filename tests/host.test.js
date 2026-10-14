'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function fixture({empty=false,cancel=false,semiExport=false,nativeLayers=false,failNative=false}={}) {
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
  let action;
  if(nativeLayers){
    constants.ElementPlacement={PLACEAFTER:'placeAfter'};let selected=null;
    const find=id=>result.layers.find(l=>l.id===id);
    imaging.putLayerMask=async o=>{calls.push(['mask',o]);const layer=find(o.layerID);assert.ok(layer.mask,'mask exists before writing');assert.equal(o.imageData.data.length,result.width*result.height);layer.mask=o.imageData.data.slice();};
    action={batchPlay:async descriptors=>{
      calls.push(['batchPlay',descriptors]);
      return descriptors.map(d=>{
        if(failNative&&d._obj==='make')throw Error('make not supported');
        const ref=d._target&&d._target[0];
        if(d._obj==='select'&&ref._ref==='layer'){selected=ref._id;return {};}
        if(d._obj==='make'&&d.new&&d.new._class==='channel'){find(selected).mask=new Uint8Array(result.width*result.height).fill(255);find(selected).maskEnabled=true;return {};}
        if(d._obj==='make'&&ref&&ref._ref==='contentLayer'){
          const layer={id:nextLayer++,kind:'fill',visible:true,color:d.using.type.color,
            move:(relative,placement)=>{assert.equal(placement,'placeAfter');const rest=result.layers.filter(l=>l.id!==layer.id),i=rest.indexOf(relative);rest.splice(i+1,0,layer);result.layers=rest;},
            delete:()=>{result.layers=result.layers.filter(l=>l.id!==layer.id);}};
          result.layers=[layer,...result.layers];selected=layer.id;return {};
        }
        if(d._obj==='set'&&d.to._obj==='layer'){find(ref._id).maskEnabled=d.to.userMaskEnabled;return {};}
        if(d._obj==='set'&&d.to._obj==='solidColorLayer'){find(selected).color=d.to.color;return {};}
        if(d._obj==='delete'&&ref._value==='mask'){find(selected).mask=null;return {};}
        if(d._obj==='get'){const layer=find(ref._id);return {hasUserMask:!!(layer&&layer.mask)};}
        throw Error('Unexpected descriptor '+JSON.stringify(d));
      });
    }};
  }
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../plugin/host'),'utf8'),{module,
    require:name=>name==='photoshop'?{app,imaging,core,constants,action}:name==='./tiles'?tiles:require('../plugin/'+name.replace('./','')),
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

test('workspace-only updates skip provisional processing and pause, reuse output and keep no full-result cache',async()=>{
 for(const memoryMode of ['ram','disk']){
  const f=fixture(),o={memoryMode,knockout:false,cleanup:'none',focusX:50,focusY:50,detailPreview:false};
  const s=await f.host.beginSession('layer',o),reads=f.calls.filter(c=>c[0]==='get').length;
  let pauses=0,previews=0,output;
  await f.host.updateSession(s,{...o,outputWhite:160},{check:()=>{},current:()=>true,pause:async()=>{pauses++;}},async p=>{
   previews++;assert.equal(p.exact,true);assert.ok(p.workspaceResultStore);
   output=(await p.workspaceResultStore.read({left:0,top:0,width:s.size.width,height:s.size.height})).data;
   if(s.sourceStore)s.sourceStore.read=async()=>{throw Error('Unused source read');};
   await f.host.workspaceView(s,'mask',o,()=>{},p.workspaceResultStore);
  });
  assert.equal(pauses,0);assert.equal(previews,1);assert.equal(f.calls.filter(c=>c[0]==='get').length,reads);
  assert.equal(s.preview.workspaceResultStore,undefined);
  assert.ok(s.metrics.updateMs>=s.metrics.processingAndWriteMs);assert.ok(s.metrics.presentationMs>=0);
  const overlay=f.result.layers.find(l=>l.id===s.workspaceLayerID).data;
  for(let p=0;p<output.length/4;p++)assert.deepEqual([...overlay.subarray(p*4,p*4+4)],[output[p*4+3]?255:0,output[p*4+3]?255:0,output[p*4+3]?255:0,255]);
  await f.host.cancelSession(s);
 }
});
test('original workspace view never reads printable output; fast updates still cancel before committing',async()=>{
 const f=fixture(),o={knockout:false,cleanup:'none',focusX:50,focusY:50},s=await f.host.beginSession('layer',o);
 const reads=f.calls.filter(c=>c[0]==='get').length;
 await f.host.workspaceView(s,'original',o);assert.equal(f.calls.filter(c=>c[0]==='get').length,reads);
 const layerID=s.layerID;let checks=0;
 await assert.rejects(f.host.updateSession(s,{...o,detailPreview:false},{check:()=>{if(++checks>6)throw Error('superseded');},pause:async()=>{throw Error('Unneeded pause');}},()=>{}),/superseded/);
 assert.equal(s.layerID,layerID);await f.host.cancelSession(s);
});

const {processRGBA}=require('../plugin/engine');
const ctxOK={check:()=>{},pause:async()=>{},current:()=>true};
test('native session: art layer + user mask + garment fill; sliders rewrite only the mask',async()=>{
 const f=fixture({nativeLayers:true}),o={knockout:false,minDiameterMM:0,focusX:50,focusY:50,key:'#102030',detailPreview:false};
 const s=await f.host.beginSession('layer',o);
 assert.equal(s.native,true);assert.deepEqual(f.result.layers.map(l=>l.kind||'art'),['art','fill']);
 const art=f.result.layers[0],fill=f.result.layers[1];assert.equal(fill.id,s.fillLayerID);assert.deepEqual(fill.color,{_obj:'RGBColor',red:16,grain:32,blue:48});
 // RGB keeps every source pixel opaque; the mask decides what prints.
 assert.equal(art.data[(17*80+13)*4+3],255);assert.equal(art.data[3],0);assert.equal(art.mask[17*80+13],255);assert.equal(art.mask[0],0);
 const puts=f.calls.filter(c=>c[0]==='put').length,masks=f.calls.filter(c=>c[0]==='mask').length;
 await f.host.updateSession(s,{...o,outputWhite:100},ctxOK,()=>{});
 assert.equal(f.calls.filter(c=>c[0]==='put').length,puts,'levels do not rewrite RGB');
 assert.equal(f.calls.filter(c=>c[0]==='mask').length,masks+1);
 const ink=art.mask.reduce((n,v)=>n+(v===255),0);assert.ok(ink>0&&ink<150);assert.ok(art.mask.every(v=>v===0||v===255));
 await f.host.updateSession(s,{...o,outputWhite:100,shadowBoost:40},ctxOK,()=>{});
 assert.equal(f.calls.filter(c=>c[0]==='put').length,puts+1,'color options rewrite RGB once');
 await f.host.updateSession(s,{...o,outputWhite:120,shadowBoost:40},ctxOK,()=>{});
 assert.equal(f.calls.filter(c=>c[0]==='put').length,puts+1);
 await f.host.cancelSession(s);assert.deepEqual(f.app.documents.map(d=>d.id),[7]);assert.equal(s.mask,null);
});
test('native views toggle layers without writing pixels; compare and mask use a temporary layer',async()=>{
 const f=fixture({nativeLayers:true}),o={knockout:false,minDiameterMM:0,focusX:50,focusY:50,key:'#000000'};
 const s=await f.host.beginSession('layer',o),art=f.result.layers[0],fill=f.result.layers[1],puts=f.calls.filter(c=>c[0]==='put').length;
 await f.host.workspaceView(s,'transparent',o);assert.equal(fill.visible,false);assert.equal(art.maskEnabled,true);
 await f.host.workspaceView(s,'original',o);assert.equal(fill.visible,false);assert.equal(art.maskEnabled,false);
 await f.host.workspaceView(s,'beforeGarment',o);assert.equal(fill.visible,true);assert.equal(art.maskEnabled,false);
 await f.host.workspaceView(s,'garment',{...o,linkBackground:false,previewColor:'#ff0000'});assert.equal(art.maskEnabled,true);assert.deepEqual(fill.color,{_obj:'RGBColor',red:255,grain:0,blue:0});
 assert.equal(f.calls.filter(c=>c[0]==='put').length,puts);
 await f.host.workspaceView(s,'mask',o);assert.equal(f.result.layers.length,3);
 const overlay=f.result.layers.find(l=>l.id===s.workspaceLayerID).data;
 for(let p=0;p<80*90;p++)assert.equal(overlay[p*4],art.mask[p]);
 await f.host.workspaceView(s,'garment',o);assert.equal(f.result.layers.length,2);assert.equal(s.workspaceLayerID,null);
 await f.host.cancelSession(s);
});
test('applying a native session leaves one layer with binary alpha equal to the full engine',async()=>{
 const f=fixture({nativeLayers:true}),o={knockout:false,minDiameterMM:0,focusX:50,focusY:50,detailPreview:false};
 const s=await f.host.beginSession('layer',o);await f.host.updateSession(s,{...o,outputWhite:140},ctxOK,()=>{});
 await f.host.workspaceView(s,'mask',o);
 await f.host.clearWorkspace(s);
 assert.equal(f.result.layers.length,1);assert.equal(f.result.layers[0].id,s.layerID);assert.equal(f.result.layers[0].mask,null);
 const reference=await processRGBA(s.source,80,90,{...o,outputWhite:140,dpi:300});
 assert.deepEqual(f.result.layers[0].data,reference.data);
 await f.host.releaseSession(s);assert.equal(s.closed,true);
});
test('protection modes on a native session use the full engine and keep protected color',async()=>{
 const f=fixture({nativeLayers:true}),o={knockout:false,minDiameterMM:0,focusX:50,focusY:50,detailPreview:false};const s=await f.host.beginSession('layer',o);
 f.original.selection.bounds={left:13,top:17,right:14,bottom:18};await f.host.captureProtection(s);
 const n={...o,knockout:true,key:'#e62878',protection:'selection',outputWhite:0,cleanup:'high',minDiameterMM:.3};
 await f.host.updateSession(s,n,ctxOK,()=>{});
 const art=f.result.layers[0];assert.equal(art.mask[17*80+13],255);assert.equal(s.stats.inkPixels,1);
 await f.host.clearWorkspace(s);const reference=await processRGBA(s.source,80,90,{...n,dpi:300,protectMask:s.protectStore.data});
 assert.deepEqual(f.result.layers[0].data,reference.data);await f.host.cancelSession(s);
});
test('if native layer operations fail, the session falls back to full-layer updates',async()=>{
 const f=fixture({nativeLayers:true,failNative:true}),o={knockout:false,minDiameterMM:0,focusX:50,focusY:50};
 const s=await f.host.beginSession('layer',o);assert.ok(!s.native);assert.match(s.nativeWarning,/máscara nativa/);
 assert.deepEqual(f.app.documents.map(d=>d.id),[7,20]);assert.equal(f.result.layers.length,1);
 await f.host.updateSession(s,{...o,outputWhite:140},ctxOK,()=>{});await f.host.cancelSession(s);
});

// ── white channel and gang sheets ──
function multiDoc(f){
  // The shared fixture reuses one result document; give every new document its own pixels.
  let id=40;const calls=f.calls;
  f.app.createDocument=async o=>{
    const doc={id:id++,name:o.name,width:o.width,height:o.height,resolution:o.resolution,mode:'rgb',bitsPerChannel:8,pixelAspectRatio:1,layers:[],
      saveAs:{png:async(...a)=>calls.push(['png',doc.id,...a])},closeWithoutSaving:()=>{calls.push(['close',doc.id]);f.app.documents=f.app.documents.filter(d=>d.id!==doc.id);},
      createPixelLayer:async()=>{const l={id:doc.id*100+doc.layers.length,delete(){}};doc.layers.push(l);return l;}};
    doc.layers.push({id:doc.id*100,delete(){}});f.app.documents.push(doc);calls.push(['create',o]);return doc;
  };
  f.imaging.putPixels=async o=>{
    calls.push(['put',o]);const doc=f.app.documents.find(d=>d.id===o.documentID),layer=doc.layers.find(l=>l.id===o.layerID);
    if(o.replace||!layer.data)layer.data=new Uint8Array(doc.width*doc.height*4);
    for(let y=0;y<o.imageData.height;y++)for(let x=0;x<o.imageData.width;x++){
      const dst=((o.targetBounds.top+y)*doc.width+o.targetBounds.left+x)*4,src=(y*o.imageData.width+x)*4;
      assert.ok(o.targetBounds.left+x>=0&&o.targetBounds.left+x<doc.width&&o.targetBounds.top+y>=0&&o.targetBounds.top+y<doc.height,'write inside document');
      layer.data.set(o.imageData.data.subarray(src,src+4),dst);
    }
  };
}
const pixelAt=(doc,x,y)=>Array.from(doc.layers[0].data.subarray((y*doc.width+x)*4,(y*doc.width+x)*4+4));
async function colorResult(f){const r=await f.host.apply('layer',{knockout:false,minDiameterMM:0});multiDoc(f);return r;}
test('white channel exports a contracted PNG without erasing the color layer and reports its pixels',async()=>{
 const f=fixture(),color=await colorResult(f);f.app.documents.push(f.result);
 const before=f.calls.filter(c=>c[0]==='put').length;
 const r=await f.host.exportWhite(color.documentID,{name:'blanco.png'},{chokeMM:25.4/300,format:'blackOnWhite'});
 assert.equal(r.colorPixels,150);assert.equal(r.whitePixels,8*13);assert.equal(r.chokePX,1);
 const white=f.app.documents.find(d=>d.id===40)||f.calls.filter(c=>c[0]==='create').length;
 const png=f.calls.find(c=>c[0]==='png');assert.ok(png&&png[2].name==='blanco.png'&&png[4]===true);
 assert.ok(f.calls.some(c=>c[0]==='close'&&c[1]===40),'white document closed');
 assert.ok(f.calls.filter(c=>c[0]==='put').length>before);
 const made=f.calls.find(c=>c[0]==='create'&&c[1].name.startsWith('DTF blanco'));assert.equal(made[1].width,80);assert.equal(made[1].height,90);
});
test('white channel pixels: inner block is ink, ring and background are not, for every file format',async()=>{
 for(const [format,ink,empty] of [['blackOnWhite',[0,0,0,255],[255,255,255,255]],['alpha',[255,255,255,255],[0,0,0,0]],['whiteOnBlack',[255,255,255,255],[0,0,0,255]]]){
  const f=fixture(),color=await colorResult(f);f.app.documents.push(f.result);
  let docRef;const create=f.app.createDocument;f.app.createDocument=async o=>{docRef=await create(o);return docRef;};
  // keep the document readable after the export closes it
  const closing=[];const origPut=f.imaging.putPixels;f.imaging.putPixels=async o=>{await origPut(o);const d=f.app.documents.find(x=>x.id===o.documentID);if(d&&d.name.startsWith('DTF blanco'))closing[0]=d;};
  await f.host.exportWhite(color.documentID,{name:'b.png'},{chokeMM:25.4/300,format});
  assert.deepEqual(pixelAt(closing[0],18,24),ink,format+' inside');assert.deepEqual(pixelAt(closing[0],13,17),empty,format+' contracted corner');assert.deepEqual(pixelAt(closing[0],0,0),empty,format+' background');
 }
});
test('white channel refuses semitransparent, empty or resized results and invalid options before writing',async()=>{
 const g=fixture({semiExport:true}),c=await g.host.apply('layer',{knockout:false,minDiameterMM:0});g.app.documents.push(g.result);
 await assert.rejects(g.host.exportWhite(c.documentID,{name:'x.png'},{}),/semitrans/);assert.ok(!g.calls.some(x=>x[0]==='png'));
 const e=fixture(),ce=await e.host.apply('layer',{knockout:false,minDiameterMM:0});e.app.documents.push(e.result);e.imaging.getPixels=async o=>({level:0,sourceBounds:o.sourceBounds,imageData:{width:0,height:0,components:4,getData:async()=>new Uint8Array(0),dispose(){}}});
 await assert.rejects(e.host.exportWhite(ce.documentID,{name:'x.png'},{}),/vacío/);
 const h=fixture(),ch=await h.host.apply('layer',{knockout:false,minDiameterMM:0});h.app.documents.push(h.result);
 await assert.rejects(h.host.exportWhite(ch.documentID,{name:'x.png'},{chokeMM:9}),/0 a 5 mm/);h.result.width=40;
 await assert.rejects(h.host.exportWhite(ch.documentID,{name:'x.png'},{}),/tamaño cambió/);assert.ok(!h.calls.some(x=>x[0]==='png'));
});

function designs(f){
  const make=(id,w,h,extra={})=>({id,name:'diseño'+id,width:w,height:h,resolution:300,mode:'rgb',bitsPerChannel:8,pixelAspectRatio:1,...extra,
    closeWithoutSaving(){f.calls.push(['closeDesign',id]);f.app.documents=f.app.documents.filter(d=>d.id!==id);}});
  f.app.open=async file=>{f.app.documents.push(file.doc);return file.doc;};
  f.imaging.getPixels=async o=>{
    const doc=f.app.documents.find(d=>d.id===o.documentID),b=o.sourceBounds,l=Math.max(0,b.left),t=Math.max(0,b.top),r=Math.min(doc.width,b.right),bt=Math.min(doc.height,b.bottom);
    const w=r-l,h=bt-t,data=new Uint8Array(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set([(l+x)%256,(t+y)%256,doc.id,255],(y*w+x)*4);
    return {level:0,sourceBounds:{left:l,top:t,right:r,bottom:bt},imageData:{width:w,height:h,components:4,getData:async()=>data,dispose(){}}};
  };
  return make;
}
const sheetPlan=()=>({index:0,width:400,height:300,widthCM:33.9,heightCM:25.4,placements:[
 {id:0,name:'A',x:100,y:100,width:20,height:30,rotated:false,sourceWidth:20,sourceHeight:30},
 {id:1,name:'B',x:200,y:100,width:30,height:20,rotated:true,sourceWidth:20,sourceHeight:30}]});
test('sheet is assembled tile by tile, rotating designs, drawing cut marks and closing every source',async()=>{
 const f=fixture();multiDoc(f);const make=designs(f);
 const files=[{doc:make(31,20,30)},{doc:make(32,20,30)}],plan=sheetPlan(),progress=[];
 const sheet=await f.host.buildSheet(plan,files,{marks:true,onProgress:(p,v)=>progress.push([p,v])});
 const doc=f.app.documents.find(d=>d.id===sheet.documentID);assert.equal(doc.width,400);assert.equal(doc.height,300);assert.equal(doc.resolution,300);
 assert.deepEqual(pixelAt(doc,100,100),[0,0,31,255]);assert.deepEqual(pixelAt(doc,119,129),[19,29,31,255]);assert.deepEqual(pixelAt(doc,99,100),[0,0,0,0]);
 // B is rotated 90° clockwise: source (x,y) -> (200+29-y, 100+x)
 for(const [x,y] of [[0,0],[19,0],[0,29],[7,11],[19,29]])assert.deepEqual(pixelAt(doc,200+29-y,100+x),[x,y,32,255],`rot ${x},${y}`);
 const {marks}=require('../plugin/sheet');
 for(const p of plan.placements)for(const m of marks(p)){assert.deepEqual(pixelAt(doc,m.left,m.top),[0,0,0,255]);assert.deepEqual(pixelAt(doc,m.left+m.width-1,m.top+m.height-1),[0,0,0,255]);}
 assert.deepEqual(f.app.documents.map(d=>d.id).sort(),[7,sheet.documentID].sort(),'design documents closed');
 assert.deepEqual(progress.at(-1),['place',1]);
 await f.host.exportPNG(sheet.documentID,{name:'pliego.png'});assert.ok(f.calls.some(c=>c[0]==='png'));
 await f.host.closeDocument(sheet.documentID);assert.deepEqual(f.app.documents.map(d=>d.id),[7]);
});
test('sheet building cleans up on a changed, low-resolution or missing design',async()=>{
 for(const [label,files,pattern] of [
  ['size',make=>[{doc:make(31,21,30)},{doc:make(32,20,30)}],/cambió de tamaño/],
  ['ppi',make=>[{doc:make(31,20,30,{resolution:150})},{doc:make(32,20,30)}],/300 ppp/],
  ['missing',make=>[{doc:make(31,20,30)}],/Falta el archivo/]]){
  const f=fixture();multiDoc(f);const make=designs(f);
  await assert.rejects(f.host.buildSheet(sheetPlan(),files(make),{}),pattern,label);
  assert.deepEqual(f.app.documents.map(d=>d.id),[7],label+': no document left open');
 }
 const g=fixture();multiDoc(g);await assert.rejects(g.host.buildSheet({...sheetPlan(),width:12000,height:12000},[],{}),/128 megap/);assert.ok(!g.calls.some(c=>c[0]==='create'));
});
test('measuring files reports size and ppi, and keeps going after an unreadable file',async()=>{
 const f=fixture(),make=designs(f);
 const list=await f.host.measureFiles([{name:'a.png',doc:make(31,2953,3543)},{name:'b.png',doc:make(32,10,10,{mode:'cmyk'})},{name:'c.png',doc:make(33,50,60,{resolution:150})}]);
 assert.deepEqual(JSON.parse(JSON.stringify(list[0])),{name:'a.png',width:2953,height:3543,dpi:300});assert.match(list[1].error,/RGB/);assert.equal(list[2].dpi,150);
 assert.deepEqual(f.app.documents.map(d=>d.id),[7],'all measured files closed');
});
test('nativeMask:false (batch and self-test) keeps a single flat printable layer even when native layers are available',async()=>{
 const f=fixture({nativeLayers:true}),o={knockout:false,minDiameterMM:0,focusX:50,focusY:50,nativeMask:false};
 const s=await f.host.beginSession('layer',o);assert.ok(!s.native);assert.equal(f.result.layers.length,1);assert.equal(f.result.layers[0].mask,undefined);
 assert.ok(!f.calls.some(c=>c[0]==='batchPlay'),'no layer structure was created');
 f.app.documents.push(f.result);await f.host.exportPNG(s.documentID,{name:'lote.png'},()=>{},s.size);assert.ok(f.calls.some(c=>c[0]==='png'));
 const g=fixture({nativeLayers:true}),live=await g.host.beginSession('layer',{...o,nativeMask:true});assert.equal(live.native,true,'interactive sessions still use the mask');
});
