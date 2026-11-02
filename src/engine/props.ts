import * as THREE from 'three';
import { MToonMaterial } from '@pixiv/three-vrm';

/**
 * Letha's radio set: a small transistor radio in a perforated brown leather
 * case resting on her left hip, a strap across the chest over her right
 * shoulder, and a white earphone in her left ear whose cord runs down the
 * neck, over the collar and plugs into the radio. Anchor points are in the
 * base model's bind pose (metres) so everything actually connects.
 */
const RADIO_POS = new THREE.Vector3(0.155, 0.965, 0.118);
const RADIO_ROT_Y = 0.45;
const JACK = new THREE.Vector3(0.138, 1.02, 0.13);
const EAR = new THREE.Vector3(0.128, 1.447, 0.0);

function leatherTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 320;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#7a4b2c'; ctx.fillRect(0, 0, 256, 320);
  ctx.strokeStyle = '#5a321b'; ctx.lineWidth = 4; ctx.setLineDash([10, 7]);
  ctx.strokeRect(10, 10, 236, 300); ctx.setLineDash([]);
  ctx.fillStyle = '#3b2010';
  for (let y = 40; y < 210; y += 17) for (let x = 36 + ((y / 17) % 2) * 8; x < 222; x += 17) { ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#e8dcc0'; ctx.fillRect(46, 232, 164, 54);
  ctx.fillStyle = '#4a3a30'; ctx.font = 'bold 22px Georgia, serif'; ctx.textAlign = 'center';
  ctx.fillText('55  80  124  160', 128, 266);
  ctx.fillStyle = '#b3201c'; ctx.fillRect(126, 238, 4, 42);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const toon = (color: string, map?: THREE.Texture) =>
  new MToonMaterial({ color: new THREE.Color(color), shadeColorFactor: new THREE.Color(color).multiplyScalar(0.6), map: map, shadingToonyFactor: 0.9 });

function tube(points: THREE.Vector3[], r: number, mat: THREE.Material) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 16, r, 8, false), mat);
  m.frustumCulled = false;
  return m;
}

export function radioSet() {
  const g = new THREE.Group();
  g.name = 'props:radio';
  const leather = toon('#ffffff', leatherTexture());
  const plain = toon('#6e4327');
  // radio case (front face textured)
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.096, 0.034), [plain, plain, plain, plain, leather, plain]);
  box.position.copy(RADIO_POS);
  box.rotation.y = RADIO_ROT_Y;
  g.add(box);
  // metal lugs + knob
  const brass = toon('#c79a4a');
  for (const sx of [-1, 1]) {
    const lug = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0018, 6, 12), brass);
    lug.position.copy(RADIO_POS).add(new THREE.Vector3(sx * 0.03, 0.05, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), RADIO_ROT_Y));
    g.add(lug);
  }
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 16), brass);
  knob.position.copy(RADIO_POS).add(new THREE.Vector3(0.036, 0.025, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), RADIO_ROT_Y));
  knob.rotation.z = Math.PI / 2;
  g.add(knob);
  // strap: right lug → across the chest → over her right shoulder → down the back → left lug
  const strapMat = toon('#5b3420');
  const lugR = RADIO_POS.clone().add(new THREE.Vector3(-0.03, 0.05, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), RADIO_ROT_Y));
  const lugL = RADIO_POS.clone().add(new THREE.Vector3(0.03, 0.05, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), RADIO_ROT_Y));
  g.add(tube([
    lugR, new THREE.Vector3(0.09, 1.08, 0.135), new THREE.Vector3(0.02, 1.16, 0.135), new THREE.Vector3(-0.05, 1.23, 0.118),
    new THREE.Vector3(-0.1, 1.285, 0.075), new THREE.Vector3(-0.125, 1.31, 0.0), new THREE.Vector3(-0.1, 1.27, -0.09),
    new THREE.Vector3(-0.02, 1.17, -0.125), new THREE.Vector3(0.09, 1.06, -0.12), new THREE.Vector3(0.175, 0.99, -0.04), lugL,
  ], 0.005, strapMat));
  // earphone: white bud in her left ear + cord down to the radio jack
  const white = toon('#f1eee6');
  const bud = new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 12), white);
  bud.position.copy(EAR);
  bud.scale.set(0.8, 1, 1);
  g.add(bud);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.022, 10), white);
  stem.position.copy(EAR).add(new THREE.Vector3(0.002, -0.016, 0.004));
  g.add(stem);
  g.add(tube([
    EAR.clone().add(new THREE.Vector3(0.002, -0.026, 0.006)), new THREE.Vector3(0.118, 1.39, 0.03), new THREE.Vector3(0.1, 1.345, 0.06),
    new THREE.Vector3(0.088, 1.31, 0.098), new THREE.Vector3(0.1, 1.24, 0.13), new THREE.Vector3(0.12, 1.14, 0.142),
    new THREE.Vector3(0.135, 1.07, 0.145), JACK,
  ], 0.0018, white));
  const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.012, 10), white);
  plug.position.copy(JACK).add(new THREE.Vector3(0, -0.004, 0));
  g.add(plug);
  g.traverse((o) => (o.frustumCulled = false));
  return g;
}
