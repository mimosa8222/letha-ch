import { useEffect, useState } from 'react';
import { useStore, vrmFiles } from '../state/store';

export function ModelPanel({ onChanged }: { onChanged(): void }) {
  const { character, source, setSource } = useStore();
  const [file, setFile] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = character === 'letha' ? 'Letha' : 'Phicia';

  useEffect(() => {
    vrmFiles.get(character).then((f) => setFile(f?.name ?? null));
  }, [character]);

  const upload = async (f: File) => {
    setBusy(true);
    await vrmFiles.put(character, await f.arrayBuffer(), f.name);
    setFile(f.name);
    setSource(character, 'vrm');
    onChanged();
    setBusy(false);
  };

  return (
    <div>
      <h3>{name} 的模型</h3>
      <div className="seg">
        <button className={source[character] === 'placeholder' ? 'on' : ''} onClick={() => setSource(character, 'placeholder')}>
          占位模型
        </button>
        <button className={source[character] === 'vrm' ? 'on' : ''} disabled={!file} onClick={() => setSource(character, 'vrm')}>
          我的 VRM
        </button>
      </div>
      <p className="hint">
        路线 B：在 VRoid Studio 里捏好 {name}，导出 <code>.vrm</code> 后在这里上传。文件只保存在这台设备的浏览器里，不会上传到任何服务器。
      </p>
      <label className="upload">
        {busy ? '读取中…' : file ? `替换 VRM（当前：${file}）` : '上传 .vrm 文件'}
        <input type="file" accept=".vrm,.glb" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} hidden />
      </label>
      {file && (
        <button
          className="ghost"
          onClick={async () => {
            await vrmFiles.remove(character);
            setFile(null);
            setSource(character, 'placeholder');
          }}
        >
          删除已上传的 VRM
        </button>
      )}
      <h3>VRoid 导出提示</h3>
      <ul className="hint">
        <li>每件衣服尽量用 VRoid 自带的独立服装项（上衣 / 下装 / 袜子 / 鞋 / 配件），这样系统能逐件开关、逐件调色。</li>
        <li>领子、收音机等 VRoid 没有的部件，可以先用配件槽或贴图画上去；系统会把无法识别的材质归入「配件」。</li>
        <li>导出时选 VRM 1.0（0.x 也能读）。</li>
      </ul>
    </div>
  );
}
