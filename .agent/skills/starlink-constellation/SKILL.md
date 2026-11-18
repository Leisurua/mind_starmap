---
name: starlink-constellation
description: Decompose study notes, PPTs, PDFs, or research papers into a 3D directed knowledge graph (STARLINK Parallel Universe) with KaTeX formulas, directed causal/derivational edges, cross-universe wormholes, and an interactive guided tour. Supports both incremental note review and full-document universe generation.
---

# STARLINK · 3D 有向知识星图构建与导览规范

本 Skill 总结了 **STARLINK** 3D 知识星空图的核心拆解方法论，支持两种高频学习工作流：
1. **边学边记 · 增量审核合入（Note → Review → Merge）**：在学习过程中随时把零散笔记交给 AI 整理，生成「待审核补丁（Patch JSON）」，经用户审核勾选后合入当前宇宙的有向图。
2. **整篇吃透 · 文献/PPT/PDF 一键成图并带看（Document → Parallel Universe + Guided Tour）**：将 PPT、PDF 或学术论文喂给 AI，直接拆解为一个独立的「平行宇宙」，生成有向知识星图、跨宇宙虫洞与「🧭 带我看」导览路线。

---

## 一、 核心拆解方法论（5 条黄金准则）

1. **星团聚类（Clusters / Categories）**：
   - 将知识体系拆分为 **3 ~ 6 个逻辑星域**（例如：`研究动机与瓶颈`、`核心数学基石`、`模型架构`、`训练与优化`、`实验与结论`）。
   - 为每个星域分配高对比度但柔和的星光色（推荐：`#38bdf8`、`#fbbf24`、`#a78bfa`、`#34d399`、`#fb7185`、`#f472b6`、`#818cf8`），并在 3D 空间中设定分散的聚类锚点 `[x, y, z]`（各锚点间距约 20~40；引擎会自动以质心外扩 1.45× 并生成对应星域星云）。
2. **原子化知识点星星（Nodes）**：
   - 每颗星代表一个**独立、可复用的核心概念/定理/模块**，避免把整段大纲塞进一颗星。
   - 必须包含：`id`（snake_case 英文唯一标识）、`name`（简练中文名；若带章节号建议写成 `概念名 (Ch.x)`，前端会自动将其渲染为等宽弱化角标）、`en`（英文对照）、`category`（所属星域 id）、`formula`（标准 LaTeX 公式字符串，不含 `$` 包裹）、`summary`（1~2 句核心直觉）、`points`（2~3 条精炼要点）。
   - 可选绑定原文溯源：`source: { "file": "原始文件或出处路径", "section": "章节标题", "excerpt": "核心原文摘录", "url": "可选静态资源路径" }`，供右侧「📄 原文溯源」标签页展示。
   - **严禁在 JSON 中写入掌握度/复习时间等用户状态**（这些由前端 `localStorage` 独立管理，且必须严格兼容 `src/schemas/graphSchema.ts`）。
3. **有向星轨（Directed Links: `source → target`）**：
   - 严禁只连线不写原因！每条有向边必须明确 **推导/演进/依赖方向**（`source` 是前置基石、动机或输入，`target` 是后续推导、实现或结论），这样用户才能在前端使用「🔙 追溯前置」与「🔜 查看后续」进行拓扑排序学习。
   - 必须包含：`source`、`target`、`relation`（2~5 字关系标签）、`description`（解释两者为何这样串联的完整句子，在悬停与导览衔接时会直接展示）。
   - **关系关键词编码规范**（前端渲染器会根据 `relation` 中的关键词自动匹配 4 种有向线型）：
     - **实线流光（推导 / 导出）**：含 `推导`、`导出`、`演进`、`落地`、`升级`、`证明`、`推出`（如 `等价推导`、`降维落地`、`线性映射升级`）
     - **虚线（前置 / 依赖）**：含 `前置`、`依赖`、`基石`、`基础`、`基座`、`支撑`、`保护`（如 `理论基石`、`抽象基座`、`前置依赖`）
     - **平行双线（特例 / 推广）**：含 `特例`、`推广`、`扩展`、`延伸`、`拓展`、`泛化`（如 `谱分解推广`、`优先队列拓展`）
     - **点线（对比 / 类比）**：含 `对比`、`类比`、`对照`、`区别`、`相似`、`替代`（如 `相干叠加类比`、`无锁替代对比`）
4. **跨宇宙虫洞（Wormholes）**：
   - 识别本宇宙与已有平行宇宙之间存在深层联系的节点，设置虫洞 `{ id, anchorNodeId, targetUniverseId, targetNodeId, color, description }`，引擎会自动朝目标远景星系投射弧形光带，实现跨学科/跨文献一键跃迁。
5. **导览剧本（Guided Tour）**：
   - 按照「研究痛点 → 前置基础 → 核心机制 → 整体架构 → 实验/应用」的认知顺序，编写 `tour` 数组：每步包含 `{ nodeId, narration }`。
   - **编排技巧**：尽量让相邻导览站点之间存在 **1 跳或 2 跳有向星轨**，前端电影字幕面板会自动读取 `link.description` 展示「衔接脉络 / 脉络演进」；`narration` 中可直接使用 `$...$` 或 `$$...$$` 行内/块级 KaTeX 公式。

---

## 二、 工作流 A：边学边记 · 增量整理与审核合入

当用户提供学习笔记并要求整理加入星图时：

1. **读取现有星图上下文**：检查当前目标宇宙已有的节点 `id` 与 `name`。在工作区中，可从 `public/universes/manifest.json` 或 `public/universes/manifest.local.json` 找到对应的 `universe.json`，也可参考 `src/data/knowledgeGraph.js` 中的内置起点。
2. **生成待审核 Patch JSON**（严格遵循以下格式，不要遗漏已有节点的 `id` 引用）：
   ```json
   {
     "mode": "patch",
     "universeId": "<target_universe_id>",
     "nodes": [
       {
         "id": "new_concept_id",
         "name": "新知识点名称",
         "en": "English Name",
         "category": "decomp",
         "formula": "A = U \\Sigma V^\\top",
         "summary": "一句话直觉概括。",
         "points": ["要点 1", "要点 2"]
       }
     ],
     "links": [
       {
         "source": "existing_or_new_id",
         "target": "new_concept_id",
         "relation": "理论基石",
         "description": "说明前置知识点如何推导出或支撑新知识点。"
       }
     ],
     "wormholes": []
   }
   ```
3. **交付用户审核**：
   - 先在回复中用简明列表向用户展示：**新增星星**、**新增有向连线（起点 → 终点）**、**核心公式**。
   - 提供上述完整的 JSON 代码块，提示用户点击 STARLINK 页面右上角的 **「✨ 审核导入」**，粘贴 JSON 后即可逐项勾选审核并一键合入有向星图。

---

## 三、 工作流 B：PPT / PDF / 论文 → 生成平行宇宙并带看

当用户把 PPT、PDF 或论文交给 AI 并要求「用这个 skill 画出星图，然后带我看」时：

1. **深度精读与结构化拆解**：
   - 通读材料，提炼 **3~6 个星域**、**12~25 颗核心知识星**、**18~35 条有向星轨**，确保从动机到结论形成连贯的有向无环/演进网络。
   - 若材料与已有宇宙有关联，可建立 **1~2 个跨宇宙虫洞**。
2. **生成完整 Universe JSON**：
   ```json
   {
     "mode": "universe",
     "universe": {
       "id": "unique_universe_id",
       "name": "《论文/课程全称》精解",
       "shortName": "简短标签(≤8字)",
       "icon": "📘",
       "subtitle": "一句话副标题 · 作者/主题",
       "categories": {
         "cat1": { "id": "cat1", "name": "星域一", "en": "Cluster 1", "color": "#38bdf8" }
       },
       "anchors": {
         "cat1": [-20, 12, -8]
       },
       "nodes": [ ... ],
       "links": [ ... ],
       "wormholes": [ ... ],
       "tour": [
         {
           "nodeId": "first_node_id",
           "narration": "第 1 站导览解说词：从这里出发，我们先看这篇论文要解决什么核心痛点..."
         }
       ]
     }
   }
   ```
3. **直接落地与带看**：
   - **方式 1（文件夹解耦注册，推荐工作区内使用）**：将个人笔记生成的纯宇宙 JSON 写入 `public/universes/local/<unique_universe_id>/universe.json`，并在 `public/universes/manifest.local.json` 数组中登记 `{ "id": "<unique_universe_id>", "path": "./universes/local/<unique_universe_id>/universe.json" }`。明确用于公开发布的通用模板写入 `public/universes/<unique_universe_id>/universe.json`，登记到 `public/universes/manifest.json`。两者都遵循 `src/schemas/graphSchema.ts` 的 `UniverseSchema`。刷新后可在左侧选择新宇宙，点击 **「🧭 带我看」** 开始导览。
   - **方式 2（前端一键导入）**：输出上述 `mode: "universe"` 的 JSON，用户在 STARLINK 点击 **「✨ 审核导入」** 粘贴确认后，系统会自动校验并创建该平行宇宙、切换过去并直接启动 **「🧭 带我看」** 3D 导览模式！
