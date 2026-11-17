import { UNIVERSES as BASE_UNIVERSES } from '../data/universes.js';

const STORAGE_PREFIX = 'starlink_universe_v3_';
const ACTIVE_UNIVERSE_KEY = 'starlink_active_universe_v3';
const CUSTOM_UNIVERSES_KEY = 'starlink_custom_universes_v3';

function loadCustomUniverses() {
  try {
    const raw = localStorage.getItem(CUSTOM_UNIVERSES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return {};
}

export const universeRegistry = {
  ...BASE_UNIVERSES,
  ...loadCustomUniverses(),
};

export function getAllUniverses() {
  return Object.values(universeRegistry);
}

export function getUniverse(universeId) {
  return universeRegistry[universeId] || universeRegistry.starter || Object.values(universeRegistry)[0];
}

export function getActiveUniverseId() {
  const saved = localStorage.getItem(ACTIVE_UNIVERSE_KEY);
  if (saved && universeRegistry[saved]) return saved;
  return universeRegistry.starter ? 'starter' : Object.keys(universeRegistry)[0];
}

export function setActiveUniverseId(universeId) {
  if (universeRegistry[universeId]) {
    localStorage.setItem(ACTIVE_UNIVERSE_KEY, universeId);
  }
}

export function registerCustomUniverse(universeObj) {
  if (!universeObj || !universeObj.id) return;
  universeRegistry[universeObj.id] = universeObj;
  try {
    const custom = loadCustomUniverses();
    custom[universeObj.id] = universeObj;
    localStorage.setItem(CUSTOM_UNIVERSES_KEY, JSON.stringify(custom));
  } catch {
    // ignore storage quota errors
  }
}

export function loadUniverseGraph(universeId) {
  const u = getUniverse(universeId);
  try {
    const saved = localStorage.getItem(STORAGE_PREFIX + u.id);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.nodes) && Array.isArray(parsed.links)) {
        return {
          nodes: parsed.nodes,
          links: parsed.links,
          wormholes: Array.isArray(parsed.wormholes)
            ? parsed.wormholes
            : structuredClone(u.wormholes || []),
        };
      }
    }
  } catch {
    // fallback to initial data
  }
  return {
    nodes: structuredClone(u.nodes || []),
    links: structuredClone(u.links || []),
    wormholes: structuredClone(u.wormholes || []),
  };
}

export function saveUniverseGraph(universeId, data) {
  try {
    localStorage.setItem(STORAGE_PREFIX + universeId, JSON.stringify(data));
  } catch {
    // ignore storage quota errors
  }
}

export function applyGraphPatch(graphData, { nodes = [], links = [], wormholes = [] }) {
  const existingIds = new Set(graphData.nodes.map((n) => n.id));
  let firstAddedId = null;

  for (const n of nodes) {
    if (n && n.id && !existingIds.has(n.id)) {
      graphData.nodes.push(n);
      existingIds.add(n.id);
      if (!firstAddedId) firstAddedId = n.id;
    }
  }

  for (const l of links) {
    if (l && l.source && l.target) {
      graphData.links.push(l);
    }
  }

  if (wormholes.length > 0) {
    graphData.wormholes = graphData.wormholes || [];
    for (const w of wormholes) {
      if (w && w.anchorNodeId && w.targetUniverseId) {
        graphData.wormholes.push(w);
      }
    }
  }

  return firstAddedId;
}

export function getEnrichedWormholes(universe, graphData) {
  const list = graphData?.wormholes || universe.wormholes || [];
  return list.map((wh) => {
    const targetU = universeRegistry[wh.targetUniverseId];
    return {
      ...wh,
      targetLabel: targetU ? targetU.shortName : wh.targetUniverseId,
    };
  });
}
