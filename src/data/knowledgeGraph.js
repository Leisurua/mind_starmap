export const CATEGORIES = {
  core: {
    id: 'core',
    name: '核心概念',
    en: 'Core Concepts',
    color: '#38bdf8',
  },
};

export const INITIAL_NODES = [
  {
    id: 'welcome_star',
    name: '初始星核',
    en: 'Starter Star',
    category: 'core',
    formula: String.raw`\text{Notes} + \text{AI Skill} \longrightarrow \text{3D Constellation}`,
    summary: '这是一个通用的起点星核。你可以点击右上角「✨ 审核导入」或「＋ 点亮新星」，配合 AI Skill 开始构建你的知识星海。',
    points: [
      '边学边记：将学习笔记交给 AI 用 starlink-constellation Skill 整理，审核后一键合入。',
      '整篇拆解：将 PPT / PDF / 论文喂给 AI，直接生成平行宇宙并使用「🧭 带我看」导览。',
    ],
  },
];

export const INITIAL_LINKS = [];
