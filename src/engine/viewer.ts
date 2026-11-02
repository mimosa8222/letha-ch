import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Avatar } from './avatar';
import { applyLook } from './avatar';
import type { Look } from '../data/types';

export type Framing = 'full' | 'face';

export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
  readonly controls: OrbitControls;
  private avatar: Avatar | null = null;
  private clock = new THREE.Clock();
  private raf = 0;
  private ro: ResizeObserver;
  private tween: { from: [THREE.Vector3, THREE.Vector3]; to: [THREE.Vector3, THREE.Vector3]; t: number } | null = null;
  framing: Framing = 'full';

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';

    this.scene.background = new THREE.Color('#2a2633');
    this.scene.add(new THREE.HemisphereLight('#fff6ec', '#5b5470', 1.6));
    const key = new THREE.DirectionalLight('#fff3e6', 2.2);
    key.position.set(1.2, 2.6, 2.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -0.8; key.shadow.camera.right = 0.8;
    key.shadow.camera.top = 1.9; key.shadow.camera.bottom = -0.1;
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 6;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.002;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#c9d6ff', 0.8);
    rim.position.set(-1.5, 1.8, -1.5);
    this.scene.add(rim);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 64), new THREE.MeshToonMaterial({ color: '#3a3545' }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.25;
    this.controls.maxDistance = 6;
    this.controls.maxPolarAngle = Math.PI * 0.62;
    this.controls.addEventListener('start', () => (this.tween = null));

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.frame('full', true);
    this.loop();
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.tween) this.frame(this.framing, true);
  }

  setAvatar(a: Avatar | null) {
    if (this.avatar) {
      this.scene.remove(this.avatar.root);
      this.avatar.dispose();
    }
    this.avatar = a;
    if (a) this.scene.add(a.root);
    this.frame(this.framing, true);
  }

  applyLook(look: Look) {
    if (this.avatar) applyLook(this.avatar, look);
  }

  /** Camera presets. Distance is derived from FOV + aspect so it fits phones too. */
  frame(f: Framing, instant = false) {
    this.framing = f;
    const a = this.avatar;
    const h = a?.height ?? 1.6;
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const fitH = (size: number) => size / 2 / Math.tan(vfov / 2);
    const fitW = (size: number) => fitH(size) / Math.min(1, this.camera.aspect);
    let target: THREE.Vector3, dist: number;
    if (f === 'face') {
      target = (a?.faceTarget ?? new THREE.Vector3(0, 1.47, 0)).clone().add(new THREE.Vector3(0, -0.04, 0));
      dist = Math.max(fitH(0.42), fitW(0.36));
    } else {
      target = new THREE.Vector3(0, h * 0.5, 0);
      dist = Math.max(fitH(h * 1.22), fitW(h * 0.55));
    }
    const pos = target.clone().add(new THREE.Vector3(0, f === 'face' ? 0.02 : 0.08, dist));
    if (instant) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      this.tween = null;
    } else {
      this.tween = { from: [this.camera.position.clone(), this.controls.target.clone()], to: [pos, target], t: 0 };
    }
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / 0.45);
      const e = 1 - Math.pow(1 - tw.t, 3);
      this.camera.position.lerpVectors(tw.from[0], tw.to[0], e);
      this.controls.target.lerpVectors(tw.from[1], tw.to[1], e);
      if (tw.t >= 1) this.tween = null;
    }
    this.controls.update();
    this.avatar?.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.setAvatar(null);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
