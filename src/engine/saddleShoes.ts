import * as THREE from 'three';

/**
 * Letha's saddle shoes, repainted onto the base model's sneaker texture.
 *
 * Every shoe triangle is rasterised into texture space with barycentric
 * interpolation, so each texel knows its 3D position on the shoe. The design
 * is then drawn in shoe-local coordinates (along = heel→toe, h = height):
 *  - a curved saddle across the instep that widens as it sweeps down to the
 *    sole (dark brown), with light stitching just inside both edges,
 *  - white toe cap with a row of broguing holes along its edge, white heel,
 *  - red-brown sole with a darker welt line, white laces.
 * The original texture's luminance is kept as subtle leather shading.
 */
export function saddleShoeTexture(meshes: THREE.Mesh[], orig: THREE.Texture) {
  const img = orig.image as CanvasImageSource & { width: number; height: number };
  const W = img.width, H = img.height;
  const P = new Float32Array(W * H * 3); // texel → 3D position
  const side = new Int8Array(W * H); // 0 = unused, ±1 = foot

  for (const mesh of meshes) {
    const g = mesh.geometry;
    const pos = g.getAttribute('position'), uv = g.getAttribute('uv'), idx = g.index;
    if (!uv || !idx) continue;
    const a = idx.array as ArrayLike<number>;
    for (let t = 0; t < a.length; t += 3) {
      const ids = [a[t], a[t + 1], a[t + 2]];
      const px = ids.map((i) => uv.getX(i) * W), py = ids.map((i) => uv.getY(i) * H);
      const x0 = Math.max(0, Math.floor(Math.min(...px)) - 1), x1 = Math.min(W - 1, Math.ceil(Math.max(...px)) + 1);
      const y0 = Math.max(0, Math.floor(Math.min(...py)) - 1), y1 = Math.min(H - 1, Math.ceil(Math.max(...py)) + 1);
      const den = (py[1] - py[2]) * (px[0] - px[2]) + (px[2] - px[1]) * (py[0] - py[2]);
      if (Math.abs(den) < 1e-9) continue;
      const s = pos.getX(ids[0]) >= 0 ? 1 : -1;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const cx = x + 0.5, cy = y + 0.5;
          const l0 = ((py[1] - py[2]) * (cx - px[2]) + (px[2] - px[1]) * (cy - py[2])) / den;
          const l1 = ((py[2] - py[0]) * (cx - px[2]) + (px[0] - px[2]) * (cy - py[2])) / den;
          const l2 = 1 - l0 - l1;
          if (l0 < -0.02 || l1 < -0.02 || l2 < -0.02) continue; // small dilation hides seams
          const o = (y * W + x) * 3;
          P[o] = l0 * pos.getX(ids[0]) + l1 * pos.getX(ids[1]) + l2 * pos.getX(ids[2]);
          P[o + 1] = l0 * pos.getY(ids[0]) + l1 * pos.getY(ids[1]) + l2 * pos.getY(ids[2]);
          P[o + 2] = l0 * pos.getZ(ids[0]) + l1 * pos.getZ(ids[1]) + l2 * pos.getZ(ids[2]);
          side[y * W + x] = s;
        }
    }
  }

  // per-foot frame
  const box: Record<number, { zmin: number; zmax: number; ymin: number; ymax: number }> = {
    1: { zmin: 9, zmax: -9, ymin: 9, ymax: -9 }, [-1]: { zmin: 9, zmax: -9, ymin: 9, ymax: -9 },
  };
  for (let i = 0; i < W * H; i++) {
    if (!side[i]) continue;
    const b = box[side[i]];
    b.zmin = Math.min(b.zmin, P[i * 3 + 2]); b.zmax = Math.max(b.zmax, P[i * 3 + 2]);
    b.ymin = Math.min(b.ymin, P[i * 3 + 1]); b.ymax = Math.max(b.ymax, P[i * 3 + 1]);
  }

  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H);
  const WHITE = [240, 234, 222], SADDLE = [46, 32, 27], SOLE = [128, 60, 38], WELT = [84, 40, 26];
  const STITCH_D = [176, 160, 140], STITCH_L = [150, 140, 128], HOLE = [120, 110, 98];
  for (let i = 0; i < W * H; i++) {
    if (!side[i]) continue;
    const b = box[side[i]];
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const along = (z - b.zmin) / (b.zmax - b.zmin); // 0 heel → 1 toe
    const h = (y - b.ymin) / (b.ymax - b.ymin); // 0 sole → 1 collar
    const L = (0.3 * d.data[i * 4] + 0.59 * d.data[i * 4 + 1] + 0.11 * d.data[i * 4 + 2]) / 255;
    const u = (i % W) / W, v = Math.floor(i / W) / H;
    let c: number[];
    let shade = 0.88 + 0.12 * Math.min(1, L * 1.6);
    const soleTop = b.ymin + 0.016;
    if (y < soleTop) {
      c = y > soleTop - 0.003 ? WELT : SOLE;
    } else {
      // saddle edges curve: wider near the sole, narrower toward the laces
      const front = 0.66 + 0.07 * (1 - h) ** 1.5;
      const back = 0.3 - 0.07 * (1 - h) ** 1.5;
      const inSaddle = along > back && along < front;
      const lace = (u > 0.43 && u < 0.57 && v > 0.55 && v < 0.81) || v < 0.12; // lace strip + lace bow/loops
      if (inSaddle) {
        c = SADDLE;
        const st = Math.min(Math.abs(along - (front - 0.022)), Math.abs(along - (back + 0.022)));
        if (st < 0.0045 && Math.sin((y + x * 0.3) * 900) > 0.1) c = STITCH_D;
        if (lace && (L < 0.35 || v < 0.12)) c = WHITE; // laces
        shade = 0.92;
      } else {
        c = WHITE;
        if (along > front) {
          // broguing: a row of small holes along the toe-cap edge, and a stitch line
          if (Math.abs(along - (front + 0.03)) < 0.007 && Math.sin((y * 1.2 + x) * 700) > 0.55) c = HOLE;
          else if (Math.abs(along - (front + 0.012)) < 0.0035 && Math.sin((y + x) * 900) > 0.1) c = STITCH_L;
        }
      }
    }
    d.data[i * 4] = c[0] * shade; d.data[i * 4 + 1] = c[1] * shade; d.data[i * 4 + 2] = c[2] * shade;
  }
  ctx.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = orig.flipY;
  t.wrapS = orig.wrapS; t.wrapT = orig.wrapT;
  return t;
}
