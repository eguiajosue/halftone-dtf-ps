'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {processRGBA, threshold, validate, SHAPES} = require('../plugin/engine');
const opts = {knockout: false, minDiameterMM: 0, dpi: 300, lpi: 30, angle: 0};
function solid(w, h, rgba) {const a = new Uint8Array(w * h * 4); for (let i = 0; i < a.length; i += 4) a.set(rgba, i); return a;}
function ink(a) {let n = 0; for (let i = 3; i < a.length; i += 4) {assert.ok(a[i] === 0 || a[i] === 255); n += a[i] === 255;} return n;}
test('all shapes preserve empty and fully opaque endpoints, RGB, and source', async () => {
  for (const shape of SHAPES) {
    const src = solid(70, 70, [90, 150, 245, 255]), copy = src.slice();
    const a = await processRGBA(src, 70, 70, {...opts, shape});
    assert.equal(ink(a.data), 4900); assert.deepEqual(src, copy); assert.deepEqual(a.data, src);
    const b = await processRGBA(solid(70, 70, [90, 150, 245, 0]), 70, 70, {...opts, shape});
    assert.equal(ink(b.data), 0);
  }
});
test('shape thresholds represent area coverage, including shadows above 80%', () => {
  const size = 320;
  for (const shape of SHAPES) for (const tone of [.1, .25, .5, .75, .9, .98]) {
    let n = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
      if (threshold((x + .5) / size, (y + .5) / size, shape) < tone) n++;
    assert.ok(Math.abs(n / size ** 2 - tone) < .01, `${shape} ${tone}: ${n / size ** 2}`);
  }
});
test('alpha fades become binary dots at roughly requested coverage', async () => {
  const result = await processRGBA(solid(300, 300, [50, 100, 150, 128]), 300, 300,
    {...opts, angle: 37, lpi: 35});
  assert.ok(Math.abs(ink(result.data) / 90000 - 128 / 255) < .025);
});
test('exact garment color vanishes; far colors remain', async () => {
  for (const key of ['#000000', '#ffffff', '#3579a1']) {
    const rgb = require('../plugin/engine').hexRGB(key);
    const r = await processRGBA(solid(40, 40, [...rgb, 255]), 40, 40, {...opts, knockout: true, key});
    assert.equal(ink(r.data), 0);
  }
  const r = await processRGBA(solid(40, 40, [255, 255, 255, 255]), 40, 40, {...opts, knockout: true});
  assert.equal(ink(r.data), 1600);
});
test('black matte reconstruction recovers saturated red while reducing coverage', async () => {
  const r = await processRGBA(solid(200, 200, [128, 0, 0, 255]), 200, 200,
    {...opts, knockout: true, key: '#000000', tolerance: 0, softness: .1, recover: true});
  assert.ok(Math.abs(ink(r.data) / 40000 - 128 / 255) < .05);
  for (let i = 0; i < r.data.length; i += 4) if (r.data[i + 3]) assert.deepEqual(Array.from(r.data.slice(i, i + 3)), [255, 0, 0]);
});
test('screen phase stays aligned between full image and offset crop', async () => {
  const full = await processRGBA(solid(140, 120, [240, 110, 70, 130]), 140, 120, {...opts, angle: 45});
  const crop = await processRGBA(solid(60, 50, [240, 110, 70, 130]), 60, 50, {...opts, angle: 45, originX: 17, originY: 23});
  for (let y = 0; y < 50; y++) for (let x = 0; x < 60; x++)
    assert.equal(crop.data[(y * 60 + x) * 4 + 3], full.data[((y + 23) * 140 + x + 17) * 4 + 3]);
});
test('physical LPI remains consistent when resolution doubles', async () => {
  const a = await processRGBA(solid(100, 100, [10, 20, 30, 128]), 100, 100, {...opts});
  const b = await processRGBA(solid(200, 200, [10, 20, 30, 128]), 200, 200, {...opts, dpi: 600});
  assert.equal(a.stats.cellPX, 10); assert.equal(b.stats.cellPX, 20);
  assert.ok(Math.abs(ink(a.data) / 10000 - ink(b.data) / 40000) < .04);
});
test('cleanup removes islands and preserves large artwork and diagonal connectivity', async () => {
  const w = 80, src = solid(w, w, [0, 0, 0, 0]);
  const dot = (x,y) => src.set([90, 120, 160, 255], (y*w+x)*4);
  dot(3,3); for (let y=20;y<40;y++) for(let x=20;x<40;x++) dot(x,y);
  for(let j=0;j<10;j++) dot(55+j,55+j);
  const r = await processRGBA(src,w,w,{...opts,minDiameterMM:.20});
  assert.equal(r.stats.removedComponents, 1); assert.equal(r.stats.removedPixels, 1);
  assert.equal(ink(r.data), 410);
});
test('Low / Standard / High have monotonically stronger particle removal', async () => {
  const src = solid(50, 50, [0,0,0,0]);
  for(let y=10;y<12;y++) for(let x=10;x<12;x++) src.set([100,100,100,255],(y*50+x)*4);
  const counts=[];
  for(const cleanup of ['low','standard','high']) counts.push(ink((await processRGBA(src,50,50,{knockout:false,cleanup})).data));
  assert.ok(counts[0]>=counts[1] && counts[1]>=counts[2]); assert.equal(counts[0],4); assert.equal(counts[1],0);
});
test('angle changes the pattern; strength can screen opaque areas', async () => {
  const src = solid(100,100,[55,125,225,255]);
  const a=await processRGBA(src,100,100,{...opts,strength:50});
  const b=await processRGBA(src,100,100,{...opts,strength:50,angle:45});
  assert.notDeepEqual(a.data,b.data); assert.ok(ink(a.data)<10000);
});
test('invalid configuration rejected and cancellation propagates', async () => {
  for(const o of [{lpi:0},{lpi:100,dpi:300},{key:'xyz'},{shape:'hex'},{gamma:0},{minDiameterMM:-1}]) assert.throws(()=>validate(o));
  await assert.rejects(processRGBA(solid(50,50,[1,2,3,255]),50,50,opts,()=>{throw Error('cancelled');}), /cancelled/);
});
