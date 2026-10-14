'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {CONTROL_SELECTOR,REQUIRED,bootstrap}=require('../plugin/ui-controls');
function page(){const banner={textContent:''},status={textContent:''},controls=[{disabled:false},{disabled:false}];
 return {banner,status,controls,document:{querySelectorAll:()=>controls,getElementById:id=>({errorBanner:banner,status}[id])}};}
test('missing Spectrum registration never blocks the panel: it starts, keeps controls enabled and explains itself',()=>{
 const p=page();let initialized=false;
 assert.equal(bootstrap(p.document,{get:tag=>tag==='sp-button'?undefined:function Component(){}},()=>{initialized=true;}),true);
 assert.equal(initialized,true);assert.ok(p.controls.every(c=>c.disabled===false),'no control is disabled');
 assert.match(p.banner.textContent,/Modo compatible.*sp-button.*controles nativos de Photoshop/);
 const q=page();bootstrap(q.document,null,()=>{});assert.match(q.banner.textContent,/Modo compatible/,'no registry at all');
});
test('a crash while starting is shown in the red banner and the status line, with where it happened',()=>{
 const p=page();let attempts=0;
 assert.equal(bootstrap(p.document,{get:()=>function Registered(){}},()=>{attempts++;throw Error('x is not a function');}),false);
 assert.equal(attempts,1);assert.match(p.banner.textContent,/^Error al iniciar el panel: x is not a function/);assert.equal(p.status.textContent,p.banner.textContent);
 assert.ok(p.controls.every(c=>c.disabled===false));
});
test('registered Spectrum controls initialize once, silently; mixed native widgets are included in busy state',()=>{
 let starts=0;const tags=[],p=page();
 assert.equal(bootstrap(p.document,{get:tag=>{tags.push(tag);return function Registered(){};}},()=>starts++),true);
 assert.equal(starts,1);assert.deepEqual(tags,REQUIRED);assert.equal(p.banner.textContent,'');
 for(const tag of ['input','select','sp-slider',...REQUIRED.filter(t=>t!=='sp-theme')])assert.ok(CONTROL_SELECTOR.split(',').includes(tag));
});
test('boot.js writes script errors and unhandled rejections to the banner without overwriting the first one',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),listeners={},banner={textContent:''},status={textContent:''};
 const window={addEventListener:(name,fn)=>{listeners[name]=fn;}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../plugin/boot.js'),'utf8'),{window,document:{getElementById:id=>({errorBanner:banner,status}[id])}});
 listeners.error({message:'Unexpected token',filename:'plugin://x/main.js',lineno:42});
 assert.equal(banner.textContent,'Error: Unexpected token (main.js:42)');
 listeners.unhandledrejection({reason:Error('segundo')});assert.equal(banner.textContent,'Error: Unexpected token (main.js:42)');assert.equal(status.textContent,'Error: segundo');
});
