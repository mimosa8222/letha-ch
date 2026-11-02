import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { del, get, set } from 'idb-keyval';
import type { AvatarSource, CharacterId, Look, SavedLook } from '../data/types';

const idbStorage: StateStorage = {
  getItem: async (k) => (await get<string>(k)) ?? null,
  setItem: (k, v) => set(k, v),
  removeItem: (k) => del(k),
};

export const lookKey = (c: CharacterId, s: AvatarSource) => `${c}:${s}`;

interface State {
  character: CharacterId;
  source: Record<CharacterId, AvatarSource>;
  looks: Record<string, Look>;
  saved: SavedLook[];
  setCharacter(c: CharacterId): void;
  setSource(c: CharacterId, s: AvatarSource): void;
  setLook(key: string, look: Look): void;
  saveLook(name: string, look: Look): void;
  deleteSaved(id: string): void;
}

export const useStore = create<State>()(
  persist(
    (setS, getS) => ({
      character: 'letha',
      source: { letha: 'placeholder', phicia: 'placeholder' },
      looks: {},
      saved: [],
      setCharacter: (character) => setS({ character }),
      setSource: (c, s) => setS({ source: { ...getS().source, [c]: s } }),
      setLook: (key, look) => setS({ looks: { ...getS().looks, [key]: look } }),
      saveLook: (name, look) => {
        const { character, source } = getS();
        const entry: SavedLook = {
          id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          name,
          character,
          source: source[character],
          look,
          createdAt: Date.now(),
        };
        setS({ saved: [entry, ...getS().saved] });
      },
      deleteSaved: (id) => setS({ saved: getS().saved.filter((s) => s.id !== id) }),
    }),
    { name: 'letha-phicia/v1', storage: createJSONStorage(() => idbStorage), version: 1 },
  ),
);

// User VRM files live in IndexedDB as raw bytes (too big for the JSON state).
export const vrmFiles = {
  put: (c: CharacterId, data: ArrayBuffer, name: string) => set(`vrm:${c}`, { data, name }),
  get: (c: CharacterId) => get<{ data: ArrayBuffer; name: string }>(`vrm:${c}`),
  remove: (c: CharacterId) => del(`vrm:${c}`),
};
