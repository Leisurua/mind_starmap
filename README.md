# ✦ mind_starmap

> 仿照 Obsidian 思维图谱的 **3D 有向知识星空图** —— 支持多平行宇宙切换、跨宇宙 3D 虫洞跃迁、KaTeX 公式渲染，以及内置 AI Skill（边学边记审核合入 + PPT/PDF/论文一键成图并带看）。

![mind_starmap 3D 知识星海总览](docs/assets/overview.png)

---

## ✨ 核心特性

- **3D 有向知识星海**：每颗星代表一个知识点，有向星轨 + 流光脉冲清晰展示 `前置来源 → 后续推导` 关系；鼠标悬停星星或连线即可查看定义、公式与关系释义。
- **平行宇宙 & 3D 虫洞**：左侧可滑动切换多个独立知识宇宙；星海中分布着旋转的 3D 时空虫洞，点击即可跨宇宙跃迁至关联知识点。
- **KaTeX 数学公式**：悬停浮窗与右侧详情抽屉原生渲染 LaTeX 公式。
- **两种 AI 协作学习流（内置 `starlink-constellation` Skill）**：
  1. **边学边记 · 审核合入**：把零散笔记交给 AI 整理，点击 **「✨ 审核导入」** 逐条勾选审核后同步合入有向星图。
  2. **论文 / PPT / PDF 一键成图 + 带看**：把整份资料喂给 AI 生成平行宇宙，点击 **「🧭 带我看」** 沿知识脉络自动飞跃讲解。

| 🧭 AI 导览带看 & KaTeX 公式 | ✨ 笔记 / 文献审核导入台 |
| :---: | :---: |
| ![导览带看与公式渲染](docs/assets/guided-tour.png) | ![AI 审核导入弹窗](docs/assets/ai-review.png) |

---

## 🚀 Quick Start

```bash
# 1. 克隆仓库
git clone https://github.com/Leisurua/mind_starmap.git
cd mind_starmap

# 2. 安装依赖
npm install

# 3. 启动本地星图
npm run dev
```

浏览器打开 `http://localhost:5173/` 即可使用（左键拖拽旋转 · 滚轮缩放 · 右键平移 · 悬停查看 · 点击聚焦）。

---

## 🧠 配合 AI Skill 使用

本仓库在 [`.agent/skills/starlink-constellation/SKILL.md`](.agent/skills/starlink-constellation/SKILL.md) 中内置了完整的 **AI 拆解与导览 Skill**，支持任意支持 Agent Skill 的 AI 编程助手：

1. **平时做笔记**：
   > 「用 `starlink-constellation` skill 帮我把这段学习笔记整理成补丁，关联到现有星图。」
   复制 AI 输出的 JSON → 点击页面右上角 **「✨ 审核导入」** → 勾选确认后合入星图。

2. **看 PPT / PDF / 论文**：
   > 「把这篇论文/PPT 用 `starlink-constellation` skill 拆解成一个新的平行宇宙，并写好导览路线带我看。」
   导入后点击 **「🧭 带我看」** 即可跟随 3D 镜头逐站精读。

---

## 📁 目录结构

```text
mind_starmap/
├── .agent/skills/starlink-constellation/SKILL.md   # AI 拆解与导览 Skill
├── docs/assets/                                    # README 演示截图
├── src/
│   ├── StarMapScene.js       # Three.js 3D 星海、有向星轨与虫洞渲染
│   ├── main.js               # 主入口编排
│   ├── state/universeStore.js# 平行宇宙状态与持久化
│   ├── ui/                   # HUD、导览控制器、审核导入弹窗、KaTeX 渲染
│   └── data/                 # 通用起点模板与自定义平行宇宙挂载点
└── index.html
```
