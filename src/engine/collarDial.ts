import * as THREE from 'three';

/**
 * Letha's collar: radio-dial scale 55·64·80·100·124·160 on her left lobe,
 * small red CONELRAD triangles at 64 and 124, a red thread needle under 64,
 * and a stitch line near the edge. Canvas laid out on the collar UVs:
 * u along the collar (0 = front centre, increasing toward her left shoulder),
 * v from the neck edge (top) to the outer edge (bottom).
 */
export function collarTexture() {
  const W = 2048, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f4f1e9';
  ctx.fillRect(0, 0, W, H);
  // stitches near the outer edge, all the way round
  ctx.strokeStyle = 'rgba(120,110,100,0.55)';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 10]);
  ctx.beginPath(); ctx.moveTo(0, H * 0.86); ctx.lineTo(W, H * 0.86); ctx.stroke();
  ctx.setLineDash([]);
  // dial on the left-front lobe
  const nums = [55, 64, 80, 100, 124, 160];
  const u0 = 0.035, u1 = 0.245;
  const xOf = (i: number) => (u0 + ((u1 - u0) * i) / (nums.length - 1)) * W;
  const lineY = H * 0.7;
  ctx.strokeStyle = '#3a3532';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(xOf(0) - 20, lineY); ctx.lineTo(xOf(5) + 20, lineY); ctx.stroke();
  for (let k = 0; k <= 25; k++) {
    const x = xOf(0) + ((xOf(5) - xOf(0)) * k) / 25;
    ctx.beginPath(); ctx.moveTo(x, lineY); ctx.lineTo(x, lineY - (k % 5 ? 9 : 16)); ctx.stroke();
  }
  ctx.fillStyle = '#2f2a28';
  ctx.font = '600 50px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  nums.forEach((n, i) => {
    ctx.fillText(String(n), xOf(i), H * 0.5);
    if (i < nums.length - 1) { ctx.beginPath(); ctx.arc((xOf(i) + xOf(i + 1)) / 2, H * 0.42, 4, 0, Math.PI * 2); ctx.fill(); }
  });
  // CONELRAD marks (red triangles) at 64 and 124 — only here, nowhere else
  ctx.fillStyle = '#b3201c';
  for (const i of [1, 4]) {
    const x = xOf(i);
    ctx.beginPath(); ctx.moveTo(x - 11, lineY + 4); ctx.lineTo(x + 11, lineY + 4); ctx.lineTo(x, lineY + 22); ctx.closePath(); ctx.fill();
  }
  // red thread needle stuck under 64
  ctx.strokeStyle = '#b3201c';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(xOf(1) + 4, lineY + 26); ctx.bezierCurveTo(xOf(1) + 10, H * 0.9, xOf(1) - 6, H * 0.95, xOf(1), H); ctx.stroke();
  ctx.strokeStyle = '#9aa0a8';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(xOf(1) - 6, lineY + 20); ctx.lineTo(xOf(1) + 14, lineY + 44); ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false; // canvas top = neck edge (verified with an orientation marker)
  t.anisotropy = 8;
  return t;
}
