import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { del, get, set } from 'idb-keyval';
import { defaultFaceParams } from '../engine/faceShape';
import type { Look } from '../engine/character';

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
      patch: (p) => setS({ look: { ...getS().look, ...p } }),
      reset: () => setS({ look: defaultLook() }),
      save: (name) =>
        setS({
          slots: [{ id: Date.now().toString(36), name, look: structuredClone(getS().look), savedAt: Date.now() }, ...getS().slots],
        }),
      load: (id) => {
        const s = getS().slots.find((x) => x.id === id);
        if (s) setS({ look: { ...defaultLook(), ...structuredClone(s.look), face: { ...defaultFaceParams(), ...s.look.face } } });
      },
      remove: (id) => setS({ slots: getS().slots.filter((x) => x.id !== id) }),
    }),
    { name: 'charmaker/v1', storage: createJSONStorage(() => idb), version: 1 },
  ),
);
