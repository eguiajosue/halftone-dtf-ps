'use strict';
/* Cleanup by morphological opening, with a radius that follows the screen
 * frequency. A coarse screen has big dots and tolerates a stronger smoothing;
 * a fine screen needs a lighter one.
 *
 *   feather  = lpi >= 40 ? 1 : 1 + 0.1 * (40 - lpi)      (+0.5 when High)
 *   radius   = 1 px (Low, Normal) or 2 px (High)
 *
 * Steps on the binary printed mask:
 *   1. feather  : box blur of half-width round(feather / 2), kept where at
 *                 least half of the window is printed (rounds corners and drops
 *                 features thinner than the blur);
 *   2. contract : erosion with a disc of `radius`;
 *   3. expand   : dilation with the same disc  -> opened shape;
 *   4. the result is the original mask AND the opened shape, so cleanup only
 *      ever removes pixels, never adds them.
 * Pixels in `keep` (protected details) are never removed. The canvas border is
 * not eroded: outside pixels count as printed for contract and as empty for
 * expand. */
const LEVEL_RADIUS = {low: 1, standard: 1, high: 2};
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function featherFor(lpi, level) {
  const base = lpi >= 40 ? 1 : 1 + 0.1 * (40 - lpi);
  return Math.round((base + (level === 'high' ? 0.5 : 0)) * 100) / 100;
}
// Parameters for a validated options object, or null when cleanup is off.
function openingParams(n) {
  if (!n.cleanup || n.cleanup === 'none') return null;
  const radius = LEVEL_RADIUS[n.cleanup];
  const feather = n.cleanup === 'low' ? 0 : featherFor(n.lpi, n.cleanup);
  return {radius, feather, blur: feather ? Math.max(1, Math.round(feather / 2)) : 0};
}
// Pixels that change a pixel's result: blur reach plus erosion plus dilation.
function reach(n) {
  const p = openingParams(n);
  return p ? p.blur + 2 * p.radius : 0;
}
// dst[x] = 1 when every (all) / any (!all) pixel of src in [x-hw, x+hw] is set.
function horizontal(src, dst, w, h, hw, all) {
  // Counts the pixels that decide the window: unset ones for erosion (any
  // makes it fail), set ones for dilation (any makes it succeed).
  const prefix = new Int32Array(w + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) prefix[x + 1] = prefix[x] + ((src[row + x] !== 0) === all ? 0 : 1);
    for (let x = 0; x < w; x++) {
      const count = prefix[Math.min(w, x + hw + 1)] - prefix[Math.max(0, x - hw)];
      dst[row + x] = (all ? count === 0 : count > 0) ? 1 : 0;
    }
  }
}
// Disc of `radius`: the horizontal half-width at each row offset.
function discRows(radius) {
  const rows = [];
  for (let dy = -radius; dy <= radius; dy++) rows.push([dy, Math.floor(Math.sqrt(radius * radius - dy * dy))]);
  return rows;
}
// Scratch buffers survive between calls when the caller keeps a `pool`
// ({} per renderer): at 13 MP one cleanup would otherwise allocate ~80 MB.
function take(pool, key, length) {
  if (!pool) return new Uint8Array(length);
  if (!pool[key] || pool[key].length !== length) pool[key] = new Uint8Array(length);
  return pool[key];
}
function morph(src, w, h, radius, all, pool, slot) {
  const rows = discRows(radius), byHalf = new Map();
  for (const [, hw] of rows) if (!byHalf.has(hw)) {
    if (hw === 0) byHalf.set(0, src);
    else {const dst = take(pool, 'h' + hw, w * h); horizontal(src, dst, w, h, hw, all); byHalf.set(hw, dst);}
  }
  const out = take(pool, slot, w * h);
  for (let y = 0; y < h; y++) {
    const base = y * w;
    out.fill(all ? 1 : 0, base, base + w); // erosion: AND of rows, dilation: OR; outside rows ignored
    for (const [dy, hw] of rows) {
      const yy = y + dy; if (yy < 0 || yy >= h) continue;
      const row = byHalf.get(hw), from = yy * w;
      if (all) for (let x = 0; x < w; x++) {if (!row[from + x]) out[base + x] = 0;}
      else for (let x = 0; x < w; x++) {if (row[from + x]) out[base + x] = 1;}
    }
  }
  return out;
}
// Binary box blur, thresholded at 50 %. Window is clamped at the borders.
function feathered(mask, w, h, blur, pool) {
  const side = 2 * blur + 1, sums = take(pool, 'sums', w * h), out = take(pool, 'blur', w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -blur; k <= blur; k++) s += mask[row + clamp(x + k, 0, w - 1)] ? 1 : 0;
      sums[row + x] = s;
    }
  }
  const half = side * side;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -blur; k <= blur; k++) s += sums[clamp(y + k, 0, h - 1) * w + x];
      out[y * w + x] = 2 * s >= half ? 1 : 0;
    }
  }
  return out;
}
// Clears in place the pixels of `mask` (0/255 or any non-zero) removed by the
// opening. Returns how many were removed.
async function openMask(mask, w, h, params, keep, hook, pool) {
  if (!params) return {removedPixels: 0, removedComponents: null};
  if (hook) await hook('cleanup', 0);
  const base = params.blur ? feathered(mask, w, h, params.blur, pool) : mask;
  if (hook) await hook('cleanup', .35);
  const eroded = morph(base, w, h, params.radius, true, pool, 'eroded');
  if (hook) await hook('cleanup', .65);
  const opened = morph(eroded, w, h, params.radius, false, pool, 'opened');
  let removedPixels = 0;
  for (let p = 0; p < w * h; p++) {
    if (mask[p] && !opened[p] && !(keep && keep[p])) {mask[p] = 0; removedPixels++;}
  }
  if (hook) await hook('cleanup', 1);
  return {removedPixels, removedComponents: null};
}
module.exports = {featherFor, openingParams, reach, openMask};
