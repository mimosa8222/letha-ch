# 素材来源、许可与技术限制

## 使用中的素材

| 文件 | 来源 | 许可 | 说明 |
|---|---|---|---|
| `public/models/base.vrm` | pixiv 官方样例 `VRM1_Constraint_Twist_Sample.vrm`，取自 [pixiv/three-vrm v3.5.5](https://github.com/pixiv/three-vrm/tree/v3.5.5/packages/three-vrm/examples/models)（经 jsDelivr 下载） | VRM Public License 1.0（[vrm.dev/licenses/1.0](https://vrm.dev/licenses/1.0/)）；文件内元数据：`modification: allowModificationRedistribution`、`allowRedistribution: true`、`creditNotation: unnecessary`、`commercialUsage: corporation`，© 2022 pixiv Inc. | 二次元底模：身体、脸、头发、眼睛、T 恤、短裤、鞋，带骨骼和 58 个表情形态键 |
| `public/models/dress.glb` | 由 `tools/blender/make_dress.py` 用无界面 Blender（pip 包 `bpy` 5.2.3）从上面的底模生成 | 属于底模的修改作品，许可同上 | 连衣裙：上身取自底模 T 恤网格（向内收紧）+ 程序生成的百褶裙摆 + 圆领 + 腰带，绑定在同一套骨骼上 |

| 程序化发型 | `src/engine/hair.ts` 运行时生成 | 自制，无第三方素材 | 前发 5 种、侧发 4 种、后发 7 种，可自由组合；发束是扁平渐尖的发片，生长时会和头骨、脖子、肩膀、身体做碰撞 |

## 比较过但没有采用的

| 来源 | 许可 | 没采用的原因 |
|---|---|---|
| MakeHuman 基础网格 `base.obj`（[makehumancommunity/makehuman](https://github.com/makehumancommunity/makehuman)） | 资源为 CC0（源码 AGPL） | 写实人体，19,158 个顶点，没有二次元脸、头发和材质；改成日系风格需要重新做脸部拓扑和全部材质，第一版做不到可用的质量 |
| OpenGameArt「VRoid Studio CC0 models」 | CC0（据页面标题） | 该站拒绝自动访问，无法下载和核实，未使用 |
| 《恋活》《艾尔登法环》 | 商业版权 | 只作美术和功能方向参考，没有提取任何素材 |

## 技术限制（如实说明）

- **画风**：人物美术就是 pixiv 官方 VRoid 样例的画风，和《恋活》的精致度仍有差距，主要差在材质、发型细节和服装布料。
- **捏脸**：12 个参数都是对真实顶点施加平滑形变场（`src/engine/faceShape.ts`）；脸、脖子和头发用同一个位置函数，接缝不会裂开。参数调到极端值时，头发和五官可能互相穿插，滑块范围已做限制。
- **连衣裙**：程序生成，没有布料物理；裙摆主要跟随髋部骨骼，大幅度抬腿会穿模（目前只有站姿）。
- **VRoid 导出时会删掉衣服下面看不到的皮肤**，所以新衣服必须完整覆盖原衣服的区域，否则会露出空洞。
- **程序化发型**：头发是静态的，没有物理摆动；发束之间偶尔有缝隙或重叠；质感比 VRoid 官方发型简单。模型原本的发型仍可在「原模型发型」里切回。
- **表情**：眨眼使用模型自带的形态键，与捏脸形变可以叠加。
