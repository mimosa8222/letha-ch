import { useState } from 'react';
import { SLOTS } from '../data/catalog';
import type { Look, PartDef, Status } from '../data/types';

type Filter = 'all' | 'decided' | 'undecided';

export function StatusTag({ s }: { s: Status }) {
  const cls = { 定: 'st-ding', 倾向: 'st-qx', 未定: 'st-wd', 试: 'st-shi' }[s];
  return <span className={`tag ${cls}`}>{s}</span>;
}

export function PartsPanel({ parts, look, onToggle, onReset }: {
  parts: PartDef[];
  look: Look;
  onToggle(id: string, on: boolean): void;
  onReset(): void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const pass = (p: PartDef) =>
    filter === 'all' || (filter === 'decided' ? p.status === '定' : p.status === '未定');

  return (
    <div>
      <div className="row between">
        <div className="seg small">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>全部</button>
          <button className={filter === 'decided' ? 'on' : ''} onClick={() => setFilter('decided')}>只看定</button>
          <button className={filter === 'undecided' ? 'on' : ''} onClick={() => setFilter('undecided')}>只看未定</button>
        </div>
        <button className="ghost" onClick={onReset}>恢复默认</button>
      </div>
      {SLOTS.map((slot) => {
        const list = parts.filter((p) => p.slot === slot.id && pass(p));
        if (!list.length) return null;
        return (
          <div key={slot.id} className="slot">
            <h3>
              {slot.label}
              <small>{slot.locked ? '固定' : slot.multi ? '可多选' : slot.optional ? '单选·可空' : '单选'}</small>
            </h3>
            {list.map((p) => {
              const on = !!look.enabled[p.id];
              return (
                <button
                  key={p.id}
                  className={`part ${on ? 'on' : ''}`}
                  disabled={slot.locked}
                  onClick={() => onToggle(p.id, !on)}
                  aria-pressed={on}
                >
                  <span className="check">{on ? '●' : '○'}</span>
                  <span className="name">{p.label}</span>
                  {p.note && <span className="note">{p.note}</span>}
                  <StatusTag s={p.status} />
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
