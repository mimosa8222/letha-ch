import { useEffect, useMemo, useRef, useState } from 'react';
import { CHARACTERS, defaultLook, togglePart } from '../data/catalog';
import type { Look, PartDef } from '../data/types';
import type { Avatar } from '../engine/avatar';
import { buildPlaceholder } from '../engine/placeholder';
import { Viewer, type Framing } from '../engine/viewer';
import { loadVrmAvatar } from '../engine/vrmAvatar';
import { lookKey, useStore, vrmFiles } from '../state/store';
import { PartsPanel } from './PartsPanel';
import { SavesPanel } from './SavesPanel';
import { ModelPanel } from './ModelPanel';

type Tab = 'parts' | 'saves' | 'model';

const params = new URLSearchParams(location.search);

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [parts, setParts] = useState<PartDef[]>([]);
  const [status, setStatus] = useState<{ loading: boolean; error?: string }>({ loading: true });
  const [framing, setFraming] = useState<Framing>((params.get('frame') as Framing) || 'full');
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'parts');
  const [hydrated, setHydrated] = useState(useStore.persist.hasHydrated());
  const [vrmRev, setVrmRev] = useState(0);

  const { character, source, looks, setCharacter, setLook } = useStore();
  const src = source[character];
  const key = lookKey(character, src);

  useEffect(() => useStore.persist.onFinishHydration(() => setHydrated(true)), []);
  useEffect(() => {
    const c = params.get('char');
    if (hydrated && (c === 'letha' || c === 'phicia')) setCharacter(c);
  }, [hydrated, setCharacter]);

  useEffect(() => {
    const v = new Viewer(hostRef.current!);
    viewerRef.current = v;
    (window as unknown as { viewer: Viewer }).viewer = v;
    return () => v.dispose();
  }, []);

  // (Re)build the avatar whenever character or source changes.
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    setStatus({ loading: true });
    (async () => {
      let avatar: Avatar;
      try {
        if (src === 'vrm') {
          const f = await vrmFiles.get(character);
          if (!f) throw new Error('还没有上传这个角色的 VRM 文件');
          avatar = await loadVrmAvatar(f.data, character);
        } else avatar = buildPlaceholder(character);
      } catch (e) {
        if (!cancelled) setStatus({ loading: false, error: String((e as Error).message ?? e) });
        avatar = buildPlaceholder(character);
      }
      if (cancelled) return avatar.dispose();
      viewerRef.current!.setAvatar(avatar);
      viewerRef.current!.frame(framing, true);
      setParts(avatar.parts.map((p) => p.def));
      setStatus((s) => (s.error ? s : { loading: false }));
      document.body.dataset.ready = '1';
    })();
    return () => {
      cancelled = true;
      document.body.dataset.ready = '';
    };
    // framing intentionally excluded: changing it shouldn't rebuild the model
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character, src, hydrated, vrmRev]);

  const look: Look = useMemo(() => {
    const base = defaultLook(parts);
    const saved = looks[key];
    return saved ? { enabled: { ...base.enabled, ...saved.enabled } } : base;
  }, [parts, looks, key]);

  useEffect(() => viewerRef.current?.applyLook(look), [look]);

  const onToggle = (id: string, on: boolean) => setLook(key, togglePart(parts, look, id, on));
  const doFrame = (f: Framing) => {
    setFraming(f);
    viewerRef.current?.frame(f);
  };

  return (
    <div className="app">
      <section className="stage">
        <div ref={hostRef} className="canvas-host" />
        <div className="stage-top">
          <div className="seg">
            {CHARACTERS.map((c) => (
              <button key={c.id} className={c.id === character ? 'on' : ''} onClick={() => setCharacter(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="seg">
            <button className={framing === 'full' ? 'on' : ''} onClick={() => doFrame('full')}>全身</button>
            <button className={framing === 'face' ? 'on' : ''} onClick={() => doFrame('face')}>脸部特写</button>
          </div>
        </div>
        {src === 'placeholder' && (
          <div className="ph-badge" role="note">PLACEHOLDER · 占位模型（代码生成，非最终美术）</div>
        )}
        {status.loading && <div className="toast">加载中…</div>}
        {status.error && <div className="toast err" onClick={() => setStatus({ loading: false })}>⚠ {status.error}（已退回占位模型）</div>}
      </section>

      <aside className="panel">
        <nav className="tabs">
          <button className={tab === 'parts' ? 'on' : ''} onClick={() => setTab('parts')}>部件</button>
          <button className={tab === 'saves' ? 'on' : ''} onClick={() => setTab('saves')}>存档</button>
          <button className={tab === 'model' ? 'on' : ''} onClick={() => setTab('model')}>模型</button>
        </nav>
        <div className="panel-body">
          {tab === 'parts' && <PartsPanel parts={parts} look={look} onToggle={onToggle} onReset={() => setLook(key, defaultLook(parts))} />}
          {tab === 'saves' && <SavesPanel look={look} onApply={(l) => setLook(key, l)} />}
          {tab === 'model' && <ModelPanel onChanged={() => setVrmRev((n) => n + 1)} />}
        </div>
      </aside>
    </div>
  );
}
