'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {REPO,API,INTERVAL,compare,validateRelease,createChecker}=require('../plugin/updates');
const installed={id:'com.josueeguia.halftonedtf',version:'0.6.1'};
function fixture(){
 const version='0.7.0',base=`https://github.com/${REPO}/releases/download/v${version}/`;
 const meta={schema:'halftone-update-v1',channel:'independent',pluginId:installed.id,version,minPhotoshop:'25.0.0',packaging:'adobe-udt',nativeValidated:true,ccx:{name:`Halftone-DTF-${version}.ccx`,sha256:'a'.repeat(64),size:1000}};
 const release={tag_name:`v${version}`,draft:false,prerelease:false,assets:[{name:meta.ccx.name,browser_download_url:base+meta.ccx.name,size:1000},{name:'halftone-update.json',browser_download_url:base+'halftone-update.json',size:500}]};return {meta,release};
}
test('updates compare numeric versions and refuse unsafe/malformed semver',()=>{
 assert.equal(compare('0.10.0','0.9.9'),1);assert.equal(compare('1.2.3','1.2.3'),0);
 for(const v of ['v1.2.3','1.2','1.2.3-rc.1','1.2.3/../a','9007199254740992.0.0'])assert.throws(()=>compare(v,'1.0.0'));
});
test('stable release validates identity, provenance, manifest version and asset origin',()=>{
 const {meta,release}=fixture();const result=validateRelease(release,meta,installed,'25.9.1');assert.equal(result.compatible,true);
 assert.equal(validateRelease(release,meta,installed,'24.7').compatible,false);
 for(const mutate of [m=>m.pluginId='other',m=>m.channel='marketplace',m=>m.packaging='zip',m=>m.nativeValidated=false,m=>m.ccx.sha256='bad',m=>m.ccx.size=1001,m=>m.version='0.8.0']){
  const copy=JSON.parse(JSON.stringify(meta));mutate(copy);assert.throws(()=>validateRelease(release,copy,installed,'25.9.1'));
 }
 const foreign=JSON.parse(JSON.stringify(release));foreign.assets[0].browser_download_url='https://evil.example/plugin.ccx';assert.throws(()=>validateRelease(foreign,meta,installed,'25.0.0'));
 release.assets.push(release.assets[0]);assert.throws(()=>validateRelease(release,meta,installed,'25.0.0'));
});
test('prereleases, drafts and equal/older versions never request an install',()=>{
 const {meta,release}=fixture();assert.equal(validateRelease({...release,prerelease:true},meta,installed,'25.0.0'),null);
 assert.equal(validateRelease({...release,draft:true},meta,installed,'25.0.0'),null);
 assert.equal(validateRelease(release,meta,{...installed,version:'0.7.0'},'25.0.0'),null);
 assert.equal(validateRelease(release,meta,{...installed,version:'1.0.0'},'25.0.0'),null);
});
test('checker coalesces requests, throttles successful checks and allows manual retry',async()=>{
 const {meta,release}=fixture(),cache={},urls=[];let now=10000;
 const checker=createChecker({installed,photoshop:'25.0.0',clock:()=>now,read:k=>cache[k],write:(k,v)=>cache[k]=v,fetchImpl:async(url,o)=>{assert.equal(o.credentials,'omit');urls.push(url);return {ok:true,json:async()=>url===API?release:meta};}});
 const [a,b]=await Promise.all([checker.check(),checker.check()]);assert.equal(a,b);assert.equal(a.update.version,'0.7.0');assert.equal(urls.length,2);
 assert.deepEqual(await checker.check(),{skipped:true});await checker.check(true);assert.equal(urls.length,4);
 now+=INTERVAL;await checker.check();assert.equal(urls.length,6);
});
test('no stable release, offline, rate limits and timeouts leave the document workflow usable',async()=>{
 const common={installed,photoshop:'25.0.0'};
 assert.deepEqual(await createChecker({...common,fetchImpl:async()=>({ok:false,status:404})}).check(),{update:null,empty:true});
 await assert.rejects(createChecker({...common,fetchImpl:async()=>({ok:false,status:403})}).check(),/limitó/);
 let calls=0;const c=createChecker({...common,fetchImpl:async()=>{calls++;throw Error('offline');}});await assert.rejects(c.check(),/offline/);await assert.rejects(c.check(),/offline/);assert.equal(calls,2);
 await assert.rejects(createChecker({...common,timeoutMs:5,fetchImpl:()=>new Promise(()=>{})}).check(),/demasiado/);
});
test('metadata without required assets is rejected and prerelease metadata is not fetched',async()=>{
 const {release}=fixture();let calls=0;
 const checker=createChecker({installed,photoshop:'25.0.0',fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({...release,prerelease:true})};}});
 assert.equal((await checker.check(true)).update,null);assert.equal(calls,1);
 const c=createChecker({installed,photoshop:'25.0.0',fetchImpl:async()=>({ok:true,json:async()=>({...release,assets:[]})})});await assert.rejects(c.check(true),/instalador completo/);
});
function uiFixture(preferences={}){
 const elements={},opened=[];
 for(const id of ['updateStatus','checkUpdates','autoCheckUpdates','openUpdate','pluginVersion','toggleUpdates','updatesPanel','updateNotice','updaterGuide'])elements[id]={className:'hidden',listeners:{},checked:false,disabled:false,textContent:'',addEventListener(event,fn){this.listeners[event]=fn;}};
 return {elements,opened,config:{get:id=>elements[id],preferences:{getItem:k=>preferences[k],setItem:(k,v)=>preferences[k]=v},photoshop:'25.0.0',open:async url=>{opened.push(url);return '';}}};
}
test('update UI respects opt-out, reports availability and uses only explicit external-link clicks',async()=>{
 const {meta,release}=fixture(),f=uiFixture({'halftone-auto-check-v1':'false'});let calls=0;
 const ui=require('../plugin/update-ui').initUpdates({...f.config,fetchImpl:async url=>{calls++;return {ok:true,json:async()=>url===API?release:meta};}});
 assert.equal(calls,0);assert.equal(f.elements.autoCheckUpdates.checked,false);
 await ui.check(true);assert.equal(f.elements.updateNotice.textContent,'Nueva versión 0.7.0');assert.equal(f.opened.length,0);
 await f.elements.openUpdate.listeners.click();assert.equal(f.opened[0],`https://github.com/${REPO}/releases/tag/v0.7.0`);
});
test('an update check finishing while processing never re-enables the check button',async()=>{
 const f=uiFixture({'halftone-auto-check-v1':'false'});let resolve;
 const ui=require('../plugin/update-ui').initUpdates({...f.config,fetchImpl:()=>new Promise(r=>resolve=r)});
 const pending=ui.check(true);await Promise.resolve();ui.sync(true);resolve({ok:false,status:404});await pending;
 assert.equal(f.elements.checkUpdates.disabled,true);ui.sync(false);assert.equal(f.elements.checkUpdates.disabled,false);
 assert.match(f.elements.updateStatus.textContent,/Aún no hay/);
});
