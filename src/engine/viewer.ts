import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type Framing = 'full' | 'face';

export interface Subject {
  root: THREE.Object3D;
  faceTarget: THREE.Vector3;
  height: number;
  update(dt: number): void;
}

/** Scene, lights, camera and touch controls (1 finger orbit, 2 finger pinch). */
export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(26, 1, 0.03, 50);
  readonly controls: OrbitControls;
  private subject: Subject | null = null;
  private clock = new THREE.Clock();
  private raf = 0;
  private ro: ResizeObserver;
  private tween: { from: [THREE.Vector3, THREE.Vector3]; to: [THREE.Vector3, THREE.Vector3]; t: number } | null = null;
  framing: Framing = 'full';

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';

    this.scene.background = new THREE.Color('#e9e4ee');
    this.scene.add(new THREE.AmbientLight('#ffffff', 0.7));
    const key = new THREE.DirectionalLight('#ffffff', 1.7);
    key.position.set(0.6, 1.8, 2.2);
    this.scene.add(key);
    // soft back light so the character reads from every angle
    const back = new THREE.DirectionalLight('#f1ecff', 0.7);
    back.position.set(-0.4, 1.6, -2.2);
    this.scene.add(back);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.75, 64), new THREE.MeshBasicMaterial({ color: '#d6cfdd' }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.22;
    this.controls.maxDistance = 6;
    this.controls.maxPolarAngle = Math.PI * 0.62;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
    this.controls.addEventListener('start', () => (this.tween = null));

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
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

  setSubject(s: Subject) {
    if (this.subject) this.scene.remove(this.subject.root);
    this.subject = s;
    this.scene.add(s.root);
    this.frame(this.framing, true);
  }

  frame(f: Framing, instant = false) {
    this.framing = f;
    const s = this.subject;
    const h = s?.height ?? 1.6;
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const fitH = (size: number) => size / 2 / Math.tan(vfov / 2);
    const fitW = (size: number) => fitH(size) / Math.min(1, this.camera.aspect);
    let target: THREE.Vector3, dist: number;
    if (f === 'face') {
      target = (s?.faceTarget ?? new THREE.Vector3(0, 1.45, 0)).clone();
      dist = Math.max(fitH(0.34), fitW(0.3));
    } else {
      target = new THREE.Vector3(0, h * 0.5, 0);
      dist = Math.max(fitH(h * 1.15), fitW(h * 0.55));
    }
    const pos = target.clone().add(new THREE.Vector3(0, f === 'face' ? 0.01 : 0.05, dist));
    if (instant) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      this.tween = null;
    } else this.tween = { from: [this.camera.position.clone(), this.controls.target.clone()], to: [pos, target], t: 0 };
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
    this.subject?.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
