import * as THREE from 'three';

/**
 * Lightweight skirt sway. The skirt is split into N sectors around the body;
 * each sector is a damped spring with a tangential and a radial offset. Hip
 * rotation makes the hem lag behind, a soft breeze ripples it. Vertices are
 * displaced in bind space (the skirt is skinned to the hips, so offsets ride
 * along with them), weighted 0 at the waist → 1 at the hem.
 */
export class SkirtSim {
  private rest: Float32Array;
  private sector: Uint8Array;
  private frac: Float32Array;
  private weight: Float32Array;
  private tan: Float32Array; // per vertex tangential dir (x,z)
  private n = 12;
  private st = new Float32Array(12 * 4); // t, vt, r, vr per sector
  private prevYaw = 0;
  private prevYawVel = 0;

  constructor(private mesh: THREE.Mesh) {
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.rest = Float32Array.from(pos.array as Float32Array);
    const count = pos.count;
    let ytop = -9, ybot = 9, cx = 0, cz = 0;
    for (let i = 0; i < count; i++) { ytop = Math.max(ytop, pos.getY(i)); ybot = Math.min(ybot, pos.getY(i)); cx += pos.getX(i); cz += pos.getZ(i); }
    cx /= count; cz /= count;
    this.sector = new Uint8Array(count);
    this.frac = new Float32Array(count);
    this.weight = new Float32Array(count);
    this.tan = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const a = Math.atan2(pos.getX(i) - cx, pos.getZ(i) - cz);
      const f = (((a / (Math.PI * 2)) + 1) % 1) * this.n;
      this.sector[i] = Math.floor(f) % this.n;
      this.frac[i] = f - Math.floor(f);
      this.weight[i] = Math.pow(Math.max(0, (ytop - pos.getY(i)) / (ytop - ybot)), 1.4);
      this.tan[i * 2] = Math.cos(a);
      this.tan[i * 2 + 1] = -Math.sin(a);
    }
  }

  step(dt: number, time: number, hipYaw: number) {
    const yawVel = (hipYaw - this.prevYaw) / dt;
    const yawAcc = (yawVel - this.prevYawVel) / dt;
    this.prevYaw = hipYaw;
    this.prevYawVel = yawVel;
    const k = 38, c = 4.5, s = this.st;
    for (let j = 0; j < this.n; j++) {
      const ph = j * 0.9;
      const windT = 0.0035 * Math.sin(time * 1.1 + ph) + 0.0015 * Math.sin(time * 2.3 + ph * 1.7);
      const windR = 0.0025 * Math.sin(time * 0.8 + ph * 1.3);
      const at = k * (windT - s[j * 4]) - c * s[j * 4 + 1] - Math.max(-2, Math.min(2, yawAcc)) * 0.02;
      const ar = k * (windR - s[j * 4 + 2]) - c * s[j * 4 + 3];
      s[j * 4 + 1] += at * dt; s[j * 4 + 3] += ar * dt;
      s[j * 4] = Math.max(-0.015, Math.min(0.015, s[j * 4] + s[j * 4 + 1] * dt));
      s[j * 4 + 2] = Math.max(-0.003, Math.min(0.012, s[j * 4 + 2] + s[j * 4 + 3] * dt));
    }
    const attr = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const p = attr.array as Float32Array, r = this.rest;
    for (let i = 0; i < this.sector.length; i++) {
      const w = this.weight[i];
      if (w <= 0) continue;
      const a = this.sector[i], b = (a + 1) % this.n, f = this.frac[i];
      const t = (s[a * 4] * (1 - f) + s[b * 4] * f) * w;
      const rad = (s[a * 4 + 2] * (1 - f) + s[b * 4 + 2] * f) * w;
      const tx = this.tan[i * 2], tz = this.tan[i * 2 + 1];
      p[i * 3] = r[i * 3] + tx * t - tz * rad;
      p[i * 3 + 2] = r[i * 3 + 2] + tz * t + tx * rad;
    }
    attr.needsUpdate = true;
  }

  /** Largest current hem displacement (m), for tests. */
  maxOffset() {
    let m = 0;
    for (let j = 0; j < this.n; j++) m = Math.max(m, Math.abs(this.st[j * 4]), Math.abs(this.st[j * 4 + 2]));
    return m;
  }
}
