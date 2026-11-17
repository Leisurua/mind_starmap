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
   - 为每个星域分配高对比度但柔和的星光色（推荐：`#38bdf8`、`#fbbf24`、`#a78bfa`、`#34d399`、`#fb7185`、`#f472b6`、`#818cf8`），并在 3D 空间中设定分散的聚类锚点 `[x, y, z]`（各锚点间距约 20~40）。
2. **原子化知识点星星（Nodes）**：
   - 每颗星代表一个**独立、可复用的核心概念/定理/模块**，避免把整段大纲塞进一颗星。
   - 必须包含：`id`（snake_case 英文唯一标识）、`name`（简练中文名）、`en`（英文对照）、`category`（所属星域 id）、`formula`（标准 LaTeX 公式字符串，不含 `$` 包裹）、`summary`（1~2 句核心直觉）、`points`（2~3 条精炼要点）。
3. **有向星轨（Directed Links: `source → target`）**：
   - 严禁只连线不写原因！每条有向边必须明确 **推导/演进/依赖方向**（`source` 是前置基石、动机或输入，`target` 是后续推导、实现或结论）。
   - 必须包含：`source`、`target`、`relation`（2~5 字关系标签，如 `痛点催生`、`理论基石`、`等价推导`、`架构骨架`、`泛化贡献`）、`description`（解释两者为何这样串联的完整句子）。
4. **跨宇宙虫洞（Wormholes）**：
   - 识别本宇宙与已有平行宇宙之间存在深层联系的节点，设置虫洞 `{ id, anchorNodeId, targetUniverseId, targetNodeId, color, description }`，实现跨学科/跨文献一键跃迁。
5. **导览剧本（Guided Tour）**：
   - 按照「研究痛点 → 前置基础 → 核心机制 → 整体架构 → 实验/应用」的认知顺序，编写 `tour` 数组：每步包含 `{ nodeId, narration }`，用口语化、有启发性的导游词串联整张星图。

---

## 二、 工作流 A：边学边记 · 增量整理与审核合入

当用户提供学习笔记并要求整理加入星图时：

1. **读取现有星图上下文**：检查当前目标宇宙已有的节点 `id` 与 `name`（若在工作区中，可读取 `src/data/universes.js` 或 `src/data/customUniverses.js`）。
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
   - **方式 1（直接写入项目）**：若在 STARLINK 工作区内，可直接将新宇宙注册到 `src/data/customUniverses.js`（并在 `src/data/universes.js` 中合并导出），刷新页面即可在顶部平行宇宙栏看到，点击 **「🧭 带我看」** 自动按 `tour` 顺序飞跃每一颗星进行讲解。
   - **方式 2（前端一键导入）**：输出上述 `mode: "universe"` 的 JSON，用户在 STARLINK 点击 **「✨ 审核导入」** 粘贴确认后，系统会自动创建该平行宇宙、切换过去并直接启动 **「🧭 带我看」** 3D 导览模式！
