import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { del, get, set } from 'idb-keyval';
import { defaultFaceParams } from '../engine/faceShape';
import type { Look } from '../engine/character';
import { defaultHair, type HairStyle } from '../engine/hair';
import { defaultEye, type EyeStyle } from '../engine/eyes';

const idb: StateStorage = {
  getItem: async (k) => (await get<string>(k)) ?? null,
  setItem: (k, v) => set(k, v),
  removeItem: (k) => del(k),
};

/** Letha (the user's OC): honey-brown wavy flip bob, crochet headband, bobby
 *  pins, sleepy grey-blue eyes, navy 1960s dress with the dial collar, radio. */
export const lethaLook = (): Look => ({
  face: {
    ...defaultFaceParams(),
    mEyeOpen: -0.5, mEyeRound: -0.15, mBrowTilt: -0.25, mBrowArch: -0.3, mMouth: -0.3, mMouthSize: -0.4,
    browThickness: -0.35, faceLength: 0.25, chinLength: 0.2, chinWidth: -0.3, cheekFull: -0.15, eyeAngle: -0.1,
  },
  hairColor: '#c4935a',
  eyeColor: '#6f7f96',
  outfit: 'dress',
  dressColor: '#323d5e',
  hair: { ...defaultHair(), front: 'uneven', side: 'none', back: 'flipbob', headband: true, pins: true },
  eye: { ...defaultEye(), iris: 'gem', highlight: 'double', color2: '#c9d3dd', pupil: 0.8 },
  props: { radio: true },
});

export const defaultLook = lethaLook;

export interface Slot {
  id: string;
  name: string;
  look: Look;
  savedAt: number;
}

interface State {
  look: Look;
  slots: Slot[];
  setFace(key: string, v: number): void;
  setHair(p: Partial<HairStyle>): void;
  setEye(p: Partial<EyeStyle>): void;
  patch(p: Partial<Look>): void;
  reset(): void;
  save(name: string): void;
  load(id: string): void;
  remove(id: string): void;
}

export const useStore = create<State>()(
  persist(
    (setS, getS) => ({
      look: defaultLook(),
      slots: [],
      setFace: (key, v) => setS({ look: { ...getS().look, face: { ...getS().look.face, [key]: v } } }),
      setHair: (p) => setS({ look: { ...getS().look, hair: { ...defaultHair(), ...getS().look.hair, ...p } } }),
      setEye: (p) => setS({ look: { ...getS().look, eye: { ...defaultEye(), ...getS().look.eye, ...p } } }),
      patch: (p) => setS({ look: { ...getS().look, ...p } }),
      reset: () => setS({ look: defaultLook() }),
      save: (name) =>
        setS({
          slots: [{ id: Date.now().toString(36), name, look: structuredClone(getS().look), savedAt: Date.now() }, ...getS().slots],
        }),
      load: (id) => {
        const s = getS().slots.find((x) => x.id === id);
        if (s) setS({ look: { ...defaultLook(), ...structuredClone(s.look), face: { ...defaultFaceParams(), ...s.look.face }, hair: { ...defaultHair(), ...s.look.hair }, eye: { ...defaultEye(), ...s.look.eye } } });
      },
      remove: (id) => setS({ slots: getS().slots.filter((x) => x.id !== id) }),
    }),
    {
      name: 'charmaker/v1',
      storage: createJSONStorage(() => idb),
      version: 1,
      // older saves lack newer fields (e.g. hair): fill them from defaults
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const d = defaultLook();
        const look = { ...d, ...p.look, props: { radio: p.look?.props?.radio ?? d.props?.radio ?? false }, face: { ...d.face, ...p.look?.face }, hair: { ...d.hair, ...p.look?.hair }, eye: { ...d.eye, ...p.look?.eye } };
        return { ...current, ...p, look };
      },
    },
  ),
);
