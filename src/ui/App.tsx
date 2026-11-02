import { useEffect, useRef, useState } from 'react';
import { Character, OUTFITS } from '../engine/character';
import { PARAMS } from '../engine/faceShape';
import { BACK_STYLES, FRONT_STYLES, SIDE_STYLES, defaultHair } from '../engine/hair';
import { Viewer, type Framing } from '../engine/viewer';
import { useStore } from '../state/store';

type Tab = 'face' | 'hair' | 'color' | 'outfit' | 'save';

const HAIR = ['#8a5a3c', '#e2c27a', '#c8a07a', '#2b2326', '#d9d6d2', '#c46a7a', '#5a6fa8'];
const EYES = ['#8a5a2e', '#6f8fb0', '#b97a9c', '#4f8a64', '#c9a227', '#9a3a3a', '#3c3550'];
const DRESS = ['#2c3550', '#6d7a4e', '#b8913a', '#8a7a6a', '#9c3b2f', '#e8ddd0', '#202024'];

declare global {
  interface Window { app?: { viewer: Viewer; character: Character } }
}

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [char, setChar] = useState<Character | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [framing, setFraming] = useState<Framing>('full');
  const [tab, setTab] = useState<Tab>('face');
  const { look, setFace, setHair, patch, reset, slots, save, load, remove } = useStore();
  const hair = { ...defaultHair(), ...look.hair };
  const [name, setName] = useState('');

  useEffect(() => {
    const v = new Viewer(host.current!);
    viewerRef.current = v;
    let alive = true;
    Character.load(setProgress)
      .then((c) => {
        if (!alive) return;
        v.setSubject(c);
        setChar(c);
        window.app = { viewer: v, character: c };
      })
      .catch((e) => setError(String(e?.message ?? e)));
    return () => {
      alive = false;
      v.dispose();
    };
  }, []);

  useEffect(() => {
    if (!char) return;
    char.applyLook(look).then(() => (document.body.dataset.ready = '1'));
  }, [char, look]);

  const frame = (f: Framing) => {
    setFraming(f);
    viewerRef.current?.frame(f);
  };

  const groups = [...new Set(PARAMS.map((p) => p.group))];

  return (
    <div className="app">
      <section className="stage">
        <div ref={host} className="canvas-host" />
        <div className="stage-top">
          <div className="seg">
            <button className={framing === 'full' ? 'on' : ''} onClick={() => frame('full')}>全身</button>
            <button className={framing === 'face' ? 'on' : ''} onClick={() => frame('face')}>面部</button>
          </div>
        </div>
        {!char && !error && <div className="toast">加载模型… {Math.round(progress * 100)}%</div>}
        {error && <div className="toast err">加载失败：{error}</div>}
        <div className="hint-bar">单指旋转 · 双指缩放</div>
      </section>

      <aside className="panel">
        <nav className="tabs">
          {([['face', '捏脸'], ['hair', '发型'], ['color', '颜色'], ['outfit', '服装'], ['save', '存档']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); if (k === 'face' && framing !== 'face') frame('face'); }}>{l}</button>
          ))}
        </nav>
        <div className="panel-body">
          {tab === 'face' && (
            <>
              {groups.map((g) => (
                <div key={g}>
                  <h3>{g}</h3>
                  {PARAMS.filter((p) => p.group === g).map((p) => (
                    <label key={p.key} className="slider">
                      <span>{p.label}</span>
                      <input
                        type="range" min={p.min} max={p.max} step={0.01}
                        value={look.face[p.key] ?? 0}
                        onChange={(e) => setFace(p.key, +e.target.value)}
                        data-param={p.key}
                      />
                      <output>{Math.round((look.face[p.key] ?? 0) * 100)}</output>
                    </label>
                  ))}
                </div>
              ))}
              <button className="ghost wide" onClick={() => patch({ face: Object.fromEntries(PARAMS.map((p) => [p.key, 0])) })}>脸部归零</button>
            </>
          )}
          {tab === 'hair' && (
            <>
              <div className="seg wide-seg">
                <button className={hair.mode === 'custom' ? 'on' : ''} onClick={() => setHair({ mode: 'custom' })}>自定义发型</button>
                <button className={hair.mode === 'original' ? 'on' : ''} onClick={() => setHair({ mode: 'original' })}>原模型发型</button>
              </div>
              {hair.mode === 'custom' && (
                <>
                  <Chips title="前发" list={FRONT_STYLES} value={hair.front} onPick={(v) => setHair({ front: v })} id="front" />
                  <Range label="前发长度" value={hair.frontLen} min={0.6} max={1.5} onChange={(v) => setHair({ frontLen: v })} id="frontLen" />
                  <Chips title="侧发" list={SIDE_STYLES} value={hair.side} onPick={(v) => setHair({ side: v })} id="side" />
                  <Range label="侧发长度" value={hair.sideLen} min={0.6} max={1.6} onChange={(v) => setHair({ sideLen: v })} id="sideLen" />
                  <Chips title="后发" list={BACK_STYLES} value={hair.back} onPick={(v) => setHair({ back: v })} id="back" />
                  <Range label="后发长度" value={hair.backLen} min={0.6} max={1.6} onChange={(v) => setHair({ backLen: v })} id="backLen" />
                  <h3>整体</h3>
                  <Range label="蓬松度" value={hair.volume} min={0} max={1} onChange={(v) => setHair({ volume: v })} id="volume" />
                </>
              )}
              <p className="hint">发色在「颜色」页调整。</p>
            </>
          )}
          {tab === 'color' && (
            <>
              <Swatches title="发色" list={HAIR} value={look.hairColor} onPick={(c) => patch({ hairColor: c })} />
              <Swatches title="瞳色" list={EYES} value={look.eyeColor} onPick={(c) => patch({ eyeColor: c })} />
            </>
          )}
          {tab === 'outfit' && (
            <>
              <h3>服装</h3>
              {OUTFITS.map((o) => (
                <button key={o.id} className={`option ${look.outfit === o.id ? 'on' : ''}`} onClick={() => patch({ outfit: o.id })} data-outfit={o.id}>
                  {look.outfit === o.id ? '● ' : '○ '}{o.label}
                </button>
              ))}
              {look.outfit === 'dress' && <Swatches title="连衣裙颜色" list={DRESS} value={look.dressColor} onPick={(c) => patch({ dressColor: c })} />}
            </>
          )}
          {tab === 'save' && (
            <>
              <form className="row" onSubmit={(e) => { e.preventDefault(); save(name.trim() || `角色 ${slots.length + 1}`); setName(''); }}>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="存档名称" />
                <button type="submit">保存</button>
              </form>
              <p className="hint">当前参数会自动保存在本机浏览器；命名存档可随时载入。</p>
              <ul className="saves">
                {slots.map((s) => (
                  <li key={s.id}>
                    <span className="name">{s.name}</span>
                    <button onClick={() => load(s.id)}>载入</button>
                    <button className="ghost" onClick={() => remove(s.id)}>删除</button>
                  </li>
                ))}
              </ul>
              <button className="ghost wide" onClick={reset}>全部恢复默认</button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Chips({ title, list, value, onPick, id }: { title: string; list: readonly (readonly [string, string])[]; value: string; onPick(v: string): void; id: string }) {
  return (
    <div>
      <h3>{title}</h3>
      <div className="chips">
        {list.map(([k, label]) => (
          <button key={k} className={`chip ${k === value ? 'on' : ''}`} onClick={() => onPick(k)} data-hair={`${id}:${k}`}>{label}</button>
        ))}
      </div>
    </div>
  );
}

function Range({ label, value, min, max, onChange, id }: { label: string; value: number; min: number; max: number; onChange(v: number): void; id: string }) {
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={0.01} value={value} onChange={(e) => onChange(+e.target.value)} data-hairparam={id} />
      <output>{Math.round(value * 100)}</output>
    </label>
  );
}

function Swatches({ title, list, value, onPick }: { title: string; list: string[]; value: string; onPick(c: string): void }) {
  return (
    <div>
      <h3>{title}</h3>
      <div className="swatches">
        {list.map((c) => (
          <button key={c} className={`sw ${c === value ? 'on' : ''}`} style={{ background: c }} onClick={() => onPick(c)} aria-label={c} />
        ))}
        <label className="sw custom" style={{ background: value }}>
          <input type="color" value={value} onChange={(e) => onPick(e.target.value)} />
        </label>
      </div>
    </div>
  );
}
