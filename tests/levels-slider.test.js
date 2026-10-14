'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {moveHandle,midPosition,gammaAt,nearestHandle,createLevelsSlider}=require('../plugin/levels-slider');
test('midtone handle follows Photoshop: gamma 1 in the middle, 2 at a quarter',()=>{
 assert.equal(midPosition(0,255,1),127.5);assert.equal(midPosition(7,100,2),7+93/4);
 for(const g of [.25,.5,1,2,4.5])assert.ok(Math.abs(gammaAt(7,100,midPosition(7,100,g))-g)<.02);
 assert.ok(gammaAt(0,255,0)>9.9);assert.equal(gammaAt(0,255,255),.1);
});
test('black and white never cross; moving them keeps gamma',()=>{
 const v={black:7,mid:2,white:100};
 assert.deepEqual(moveHandle(v,'black',150),{black:99,mid:2,white:100});
 assert.deepEqual(moveHandle(v,'white',3),{black:7,mid:2,white:8});
 assert.deepEqual(moveHandle({black:0,white:255},'white',-20,0),{black:0,white:0});
 assert.equal(moveHandle(v,'mid',30).mid,gammaAt(7,100,30));
 assert.equal(nearestHandle(v,95),'white');assert.equal(nearestHandle(v,2),'black');assert.equal(nearestHandle(v,31),'mid');
});
test('dragging the track moves the nearest handle and renders positions',()=>{
 const listeners={},el=()=>({style:{},addEventListener:()=>{},setAttribute(){}});
 const track={addEventListener:(n,f)=>(listeners[n]||=[]).push(f),getBoundingClientRect:()=>({left:0,width:510})};
 let values={black:7,mid:1,white:100};const handles={black:el(),mid:el(),white:el()};
 createLevelsSlider({track,handles,get:()=>values,set:v=>{values=v;}});
 assert.equal(handles.mid.style.left,(53.5/255*100)+'%');
 const fire=(n,e)=>listeners[n].forEach(f=>f(e));
 fire('mousedown',{button:0,clientX:400,target:track});fire('mousemove',{clientX:420});fire('mouseup',{});
 assert.equal(values.white,210);fire('mousemove',{clientX:20});assert.equal(values.white,210,'stops after release');
});
