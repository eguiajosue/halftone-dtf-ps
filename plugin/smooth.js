'use strict';
/* Pre-smoothing of the coverage plane, applied before levels and the screen
 * threshold. It flattens fine texture (paper grain, JPEG noise, hair-thin
 * detail) so it does not turn into stray dots, while edges stay sharp.
 *
 *   mode 1 : Gaussian, sigma 1.4 px
 *   mode 2 : mode 1, then an edge-preserving smoothing equivalent to a surface
 *            blur of radius 20 px and threshold 24 (fast guided filter on a
 *            4x reduced grid; an approximation, not Photoshop's filter)
 *
 * Works in place on a Uint16 plane (0..65535). Transparent source pixels
 * (alpha 0) take no part in the Gaussian, so the silhouette does not erode.
 * Both stages are local and the reduced grid is anchored to document
 * coordinates, so a tile with `haloFor(mode)` pixels of context gives exactly
 * the same values as the whole image. */
const SIGMA = 1.4, RADIUS = Math.ceil(SIGMA * 3), BLOCK = 4, GUIDE_RADIUS = 5;
const EPS = (24 / 255) ** 2;
const KERNEL = Float32Array.from({length: 2 * RADIUS + 1}, (_, i) => Math.exp(-((i - RADIUS) ** 2) / (2 * SIGMA * SIGMA)));
// A pixel depends on 1 block (bilinear) + 2 chained boxes of GUIDE_RADIUS blocks,
// plus one block for the grid alignment.
function haloFor(mode) {
  return mode >= 2 ? RADIUS + (2 * GUIDE_RADIUS + 2) * BLOCK + BLOCK : mode === 1 ? RADIUS : 0;
}
function gaussian(cov, w, h, alpha) {
  const R = RADIUS, slots = 2 * R + 1;
  const num = Array.from({length: slots}, () => new Float32Array(w)), den = Array.from({length: slots}, () => new Float32Array(w));
  const A = alpha && alpha.data, stride = alpha ? alpha.stride : 1, offset = alpha ? alpha.offset : 0;
  let next = 0;
  const rowPass = y => {
    const nu = num[y % slots], de = den[y % slots], base = y * w;
    for (let x = 0; x < w; x++) {
      let sn = 0, sd = 0;
      const x0 = Math.max(0, x - R), x1 = Math.min(w - 1, x + R);
      for (let xx = x0; xx <= x1; xx++) {
        const p = base + xx;
        if (A && !A[p * stride + offset]) continue;
        const k = KERNEL[xx - x + R]; sn += k * cov[p]; sd += k;
      }
      nu[x] = sn; de[x] = sd;
    }
  };
  for (let y = 0; y < h; y++) {
    while (next <= Math.min(h - 1, y + R)) rowPass(next++);
    const y0 = Math.max(0, y - R), y1 = Math.min(h - 1, y + R), base = y * w;
    for (let x = 0; x < w; x++) {
      const p = base + x;
      if (A && !A[p * stride + offset]) {cov[p] = 0; continue;}
      let sn = 0, sd = 0;
      for (let yy = y0; yy <= y1; yy++) {const k = KERNEL[yy - y + R]; sn += k * num[yy % slots][x]; sd += k * den[yy % slots][x];}
      cov[p] = sd > 0 ? Math.max(0, Math.min(65535, Math.round(sn / sd))) : 0;
    }
  }
}
// Window sums over a (2r+1)^2 box, clipped at the borders.
function boxSum(values, lw, lh, r) {
  const sat = new Float64Array((lw + 1) * (lh + 1)), out = new Float64Array(lw * lh);
  for (let y = 0; y < lh; y++) {
    let run = 0;
    for (let x = 0; x < lw; x++) {run += values[y * lw + x]; sat[(y + 1) * (lw + 1) + x + 1] = sat[y * (lw + 1) + x + 1] + run;}
  }
  for (let y = 0; y < lh; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(lh, y + r + 1);
    for (let x = 0; x < lw; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(lw, x + r + 1);
      out[y * lw + x] = sat[y1 * (lw + 1) + x1] - sat[y0 * (lw + 1) + x1] - sat[y1 * (lw + 1) + x0] + sat[y0 * (lw + 1) + x0];
    }
  }
  return out;
}
// Self-guided filter (He et al.) on a grid of 4 x 4 blocks aligned to the
// document origin, with per-pixel bilinear upsampling of its coefficients.
// Transparent pixels weigh nothing, so the silhouette border is not diluted.
function guided(cov, w, h, alpha, originX, originY) {
  const bx0 = Math.floor(originX / BLOCK), by0 = Math.floor(originY / BLOCK);
  const lw = Math.floor((w - 1 + originX) / BLOCK) - bx0 + 1, lh = Math.floor((h - 1 + originY) / BLOCK) - by0 + 1;
  const A = alpha && alpha.data, stride = alpha ? alpha.stride : 1, offset = alpha ? alpha.offset : 0;
  const sum = new Float64Array(lw * lh), count = new Uint16Array(lw * lh);
  for (let y = 0; y < h; y++) {
    const row = (Math.floor((y + originY) / BLOCK) - by0) * lw;
    for (let x = 0; x < w; x++) {
      const p = y * w + x; if (A && !A[p * stride + offset]) continue;
      const i = row + Math.floor((x + originX) / BLOCK) - bx0; sum[i] += cov[p] / 65535; count[i]++;
    }
  }
  const mean = new Float64Array(lw * lh), weighted = new Float64Array(lw * lh), weightedSquare = new Float64Array(lw * lh);
  for (let i = 0; i < mean.length; i++) if (count[i]) {mean[i] = sum[i] / count[i]; weighted[i] = sum[i]; weightedSquare[i] = sum[i] * mean[i];}
  const W = boxSum(count, lw, lh, GUIDE_RADIUS), SI = boxSum(weighted, lw, lh, GUIDE_RADIUS), SII = boxSum(weightedSquare, lw, lh, GUIDE_RADIUS);
  const a = new Float64Array(lw * lh), b = new Float64Array(lw * lh);
  for (let i = 0; i < a.length; i++) {
    if (!W[i]) continue;
    const mI = SI[i] / W[i], v = Math.max(0, SII[i] / W[i] - mI * mI);
    a[i] = v / (v + EPS); b[i] = mI - a[i] * mI;
  }
  const wa = new Float64Array(lw * lh), wb = new Float64Array(lw * lh);
  for (let i = 0; i < a.length; i++) {wa[i] = a[i] * count[i]; wb[i] = b[i] * count[i];}
  const SA = boxSum(wa, lw, lh, GUIDE_RADIUS), SB = boxSum(wb, lw, lh, GUIDE_RADIUS);
  const mA = new Float32Array(lw * lh), mB = new Float32Array(lw * lh);
  for (let i = 0; i < mA.length; i++) if (W[i]) {mA[i] = SA[i] / W[i]; mB[i] = SB[i] / W[i];}
// Bilinear taps in the reduced grid for each column / row.
  const taps = (n, origin, base, size) => {
    const i0 = new Int32Array(n), i1 = new Int32Array(n), t = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const c = (k + origin + 0.5) / BLOCK - 0.5 - base, f = Math.floor(c);
      i0[k] = Math.max(0, Math.min(size - 1, f)); i1[k] = Math.max(0, Math.min(size - 1, f + 1)); t[k] = f < 0 ? 0 : Math.min(1, c - f);
    }
    return {i0, i1, t};
  };
  const X = taps(w, originX, bx0, lw), Y = taps(h, originY, by0, lh);
  for (let y = 0; y < h; y++) {
    const r0 = Y.i0[y] * lw, r1 = Y.i1[y] * lw, ty = Y.t[y];
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (A && !A[p * stride + offset]) {cov[p] = 0; continue;}
      const x0 = X.i0[x], x1 = X.i1[x], tx = X.t[x];
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      const ca = mA[r0 + x0] * w00 + mA[r0 + x1] * w10 + mA[r1 + x0] * w01 + mA[r1 + x1] * w11;
      const cb = mB[r0 + x0] * w00 + mB[r0 + x1] * w10 + mB[r1 + x0] * w01 + mB[r1 + x1] * w11;
      cov[p] = Math.max(0, Math.min(65535, Math.round((ca * cov[p] / 65535 + cb) * 65535)));
    }
  }
}
// `alpha` = {data, stride, offset} of the source RGBA; omit when fully opaque.
function smoothCoverage(cov, w, h, {mode = 0, alpha = null, originX = 0, originY = 0} = {}) {
  if (!(mode >= 1)) return cov;
  gaussian(cov, w, h, alpha);
  if (mode >= 2) guided(cov, w, h, alpha, originX, originY);
  return cov;
}
module.exports = {SIGMA, haloFor, smoothCoverage};
