import { useState } from 'react';
import type { Look } from '../data/types';
import { useStore } from '../state/store';

export function SavesPanel({ look, onApply }: { look: Look; onApply(l: Look): void }) {
  const { saved, character, source, saveLook, deleteSaved } = useStore();
  const [name, setName] = useState('');
  const mine = saved.filter((s) => s.character === character && s.source === source[character]);

  return (
    <div>
      <p className="hint">当前造型会自动保存在本机（IndexedDB）。也可以存成命名造型，方便之后对比。</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          saveLook(name.trim() || `造型 ${mine.length + 1}`, look);
          setName('');
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="造型名称，例如：日常服 A" />
        <button type="submit">保存</button>
      </form>
      {mine.length === 0 && <p className="hint">还没有保存的造型。</p>}
      <ul className="saves">
        {mine.map((s) => (
          <li key={s.id}>
            <span className="name">{s.name}</span>
            <span className="date">{new Date(s.createdAt).toLocaleString()}</span>
            <button onClick={() => onApply(s.look)}>载入</button>
            <button className="ghost" onClick={() => deleteSaved(s.id)}>删除</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
