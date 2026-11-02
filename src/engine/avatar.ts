import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { AvatarSource, CharacterId, Look, PartDef } from '../data/types';

export interface AvatarPart {
  def: PartDef;
  objects: THREE.Object3D[];
  /** Shown only while this part is OFF (e.g. the intact fingertip). */
  inverse?: THREE.Object3D[];
}

/** Anything the viewer can show: placeholder mannequin or loaded VRM. */
export interface Avatar {
  character: CharacterId;
  source: AvatarSource;
  root: THREE.Object3D;
  parts: AvatarPart[];
  /** World-space point the "zoom to face" camera targets. */
  faceTarget: THREE.Vector3;
  /** Approximate standing height in metres, for framing. */
  height: number;
  vrm?: VRM;
  update(dt: number): void;
  dispose(): void;
}

export function applyLook(avatar: Avatar, look: Look) {
  for (const part of avatar.parts) {
    const on = look.enabled[part.def.id] ?? part.def.defaultOn;
    for (const o of part.objects) o.visible = on;
    for (const o of part.inverse ?? []) o.visible = !on;
  }
}

export function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}
