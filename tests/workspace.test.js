'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {tileView}=require('../plugin/workspace');
const {pickerHex}=require('../plugin/color-picker');
test('native workspace masks use final alpha and never mutate printable pixels',()=>{
 const source=new Uint8Array([30,40,50,128,100,120,150,255]),result=new Uint8Array([30,40,50,0,100,120,150,255]),before=result.slice();
 const mask=tileView('mask',source,result,{left:0,top:0,width:2,height:1},{width:2},{key:'#000000'});
 assert.deepEqual([...mask],[0,0,0,255,255,255,255,255]);assert.deepEqual(result,before);
 const shirt=tileView('garment',source,result,{left:0,top:0,width:2,height:1},{width:2},{key:'#123456'});
 assert.deepEqual([...shirt],[18,52,86,255,100,120,150,255]);assert.deepEqual(result,before);
});
test('comparison split is anchored to the full workspace across tile boundaries',()=>{
 const source=new Uint8Array(16*4),result=new Uint8Array(16*4);for(let i=0;i<16;i++){source.set([255,0,0,255],i*4);result.set([0,0,255,255],i*4);}
 for(const position of [0,25,37.5,50,100]){
 const options={key:'#000000',comparePosition:position};
 const full=tileView('compare',source,result,{left:0,top:0,width:16,height:1},{width:16},options),parts=new Uint8Array(64);
 for(let left=0;left<16;left+=4)parts.set(tileView('compare',source.slice(left*4,(left+4)*4),result.slice(left*4,(left+4)*4),{left,top:0,width:4,height:1},{width:16},options),left*4);
 assert.deepEqual(parts,full);}
});
test('native picker handles legacy green, float components and cancellation precisely',()=>{
 assert.equal(pickerHex({RGBFloatColor:{red:255,grain:128.2,blue:0}}),'#ff8000');
 assert.equal(pickerHex({RGBFloatColor:{red:0,green:1,blue:2}}),'#000102');
 assert.equal(pickerHex({RGBFloatColor:{redFloat:1,greenFloat:.5,blueFloat:0}}),'#ff8000');
 assert.equal(pickerHex({result:-128}),null);assert.equal(pickerHex({}),null);
 assert.throws(()=>pickerHex({_obj:'error',message:'Picker failed'}),/Picker failed/);
 assert.throws(()=>pickerHex({RGBFloatColor:{red:5,blue:3}}),/no compatible/);
});
