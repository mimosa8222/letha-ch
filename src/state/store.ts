import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { del, get, set } from 'idb-keyval';
import { defaultFaceParams } from '../engine/faceShape';
import type { Look } from '../engine/character';
import { defaultHair, type HairStyle } from '../engine/hair';

const idb: StateStorage = {
  getItem: async (k) => (await get<string>(k)) ?? null,
  setItem: (k, v) => set(k, v),
  removeItem: (k) => del(k),
};

export const defaultLook = (): Look => ({
  face: defaultFaceParams(),
  hairColor: '#8a5a3c',
  eyeColor: '#8a5a2e',
  outfit: 'casual',
  dressColor: '#2c3550',
  hair: defaultHair(),
});

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
      patch: (p) => setS({ look: { ...getS().look, ...p } }),
      reset: () => setS({ look: defaultLook() }),
      save: (name) =>
        setS({
          slots: [{ id: Date.now().toString(36), name, look: structuredClone(getS().look), savedAt: Date.now() }, ...getS().slots],
        }),
      load: (id) => {
        const s = getS().slots.find((x) => x.id === id);
        if (s) setS({ look: { ...defaultLook(), ...structuredClone(s.look), face: { ...defaultFaceParams(), ...s.look.face }, hair: { ...defaultHair(), ...s.look.hair } } });
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
        const look = { ...d, ...p.look, face: { ...d.face, ...p.look?.face }, hair: { ...d.hair, ...p.look?.hair } };
        return { ...current, ...p, look };
      },
    },
  ),
);
