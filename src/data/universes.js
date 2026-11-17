import {
  CATEGORIES as STARTER_CATEGORIES,
  INITIAL_NODES as STARTER_NODES,
  INITIAL_LINKS as STARTER_LINKS,
} from './knowledgeGraph.js';
import { CUSTOM_UNIVERSES } from './customUniverses.js';

export const UNIVERSES = {
  starter: {
    id: 'starter',
    name: '我的知识星海',
    shortName: '默认宇宙',
    icon: '✦',
    subtitle: '3D Knowledge Constellation · Ready for AI Skill',
    categories: STARTER_CATEGORIES,
    anchors: { core: [0, 0, 0] },
    nodes: STARTER_NODES,
    links: STARTER_LINKS,
    wormholes: [],
  },
  ...CUSTOM_UNIVERSES,
};
