'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {CONTROL_SELECTOR,REQUIRED,bootstrap}=require('../plugin/ui-controls');
test('missing Spectrum registration blocks an incomplete installation before initializing Photoshop',()=>{
 const controls=[{disabled:false},{disabled:false}],status={};let initialized=false;
 const document={querySelectorAll:selector=>{assert.equal(selector,CONTROL_SELECTOR);return controls;},getElementById:id=>{assert.equal(id,'status');return status;}};
 assert.equal(bootstrap(document,{get:tag=>tag==='sp-button'?undefined:function Component(){}},()=>{initialized=true;}),false);
 assert.equal(initialized,false);assert.ok(controls.every(c=>c.disabled));assert.match(status.textContent,/Reinstala el paquete completo/);
});
test('registered Spectrum controls initialize once; mixed native widgets are included in busy state',()=>{
 let starts=0;const tags=[];assert.equal(bootstrap({}, {get:tag=>{tags.push(tag);return function Registered(){};}},()=>starts++),true);
 assert.equal(starts,1);assert.deepEqual(tags,REQUIRED);
 for(const tag of ['input','select','sp-slider',...REQUIRED.filter(t=>t!=='sp-theme')])assert.ok(CONTROL_SELECTOR.split(',').includes(tag));
});
