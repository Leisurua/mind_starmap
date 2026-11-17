import { UNIVERSES as BASE_UNIVERSES } from '../data/universes.js';
import {
  DirectedLinkSchema,
  StarNodeSchema,
  UniverseSchema,
  WormholeSchema,
} from '../schemas/graphSchema.ts';

const STORAGE_PREFIX = 'starlink_universe_v3_';
const ACTIVE_UNIVERSE_KEY = 'starlink_active_universe_v3';
const CUSTOM_UNIVERSES_KEY = 'starlink_custom_universes_v3';

function loadCustomUniverses() {
  try {
    const raw = localStorage.getItem(CUSTOM_UNIVERSES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return {};
}

const universeRegistry = Object.assign(Object.create(null), BASE_UNIVERSES);
for (const [id, raw] of Object.entries(loadCustomUniverses())) {
  const parsed = UniverseSchema.safeParse(raw);
  if (!Object.hasOwn(universeRegistry, id) && parsed.success && parsed.data.id === id) {
    universeRegistry[id] = parsed.data;
  }
}

export function getAllUniverses() {
  return Object.values(universeRegistry);
}

export function getUniverse(universeId) {
  return universeRegistry[universeId];
}

export function getActiveUniverseId() {
  try {
    const saved = localStorage.getItem(ACTIVE_UNIVERSE_KEY);
    if (saved && getUniverse(saved)) return saved;
  } catch {
    // The active universe is an optional preference.
  }
  return universeRegistry.starter ? 'starter' : Object.keys(universeRegistry)[0];
}

export function setActiveUniverseId(universeId) {
  if (universeRegistry[universeId]) {
    try {
      localStorage.setItem(ACTIVE_UNIVERSE_KEY, universeId);
    } catch {
      // Navigation remains available when preferences cannot be saved.
    }
  }
}

export function registerCustomUniverse(universeObj) {
  try {
    const custom = loadCustomUniverses();
    if (getUniverse(universeObj.id) || Object.hasOwn(custom, universeObj.id)) return false;
    localStorage.setItem(CUSTOM_UNIVERSES_KEY, JSON.stringify({
      ...custom,
      [universeObj.id]: universeObj,
    }));
  } catch {
    return false;
  }
  universeRegistry[universeObj.id] = universeObj;
  return true;
}

function readGraphItems(items, schema) {
  return items.flatMap((item) => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function loadUniverseGraph(universeId) {
  const u = getUniverse(universeId);
  if (!u) return { nodes: [], links: [], wormholes: [] };
  try {
    const saved = localStorage.getItem(STORAGE_PREFIX + u.id);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed?.nodes) && Array.isArray(parsed.links)) {
        const nodes = new Map();
        for (const node of readGraphItems(parsed.nodes, StarNodeSchema)) {
          if (!nodes.has(node.id)) nodes.set(node.id, node);
        }
        if (parsed.nodes.length > 0 && nodes.size === 0) throw new Error('Invalid saved nodes');
        return {
          nodes: [...nodes.values()],
          links: readGraphItems(parsed.links, DirectedLinkSchema)
            .filter((link) => nodes.has(link.source) && nodes.has(link.target) && link.source !== link.target),
          wormholes: Array.isArray(parsed.wormholes)
            ? readGraphItems(parsed.wormholes, WormholeSchema).filter((wh) => nodes.has(wh.anchorNodeId))
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
    return true;
  } catch {
    return false;
  }
}

export function commitGraphPatch(universeId, graphData, { nodes, links, wormholes }) {
  const next = {
    nodes: [...graphData.nodes, ...nodes],
    links: [...graphData.links, ...links],
    wormholes: [...graphData.wormholes, ...wormholes],
  };
  if (!saveUniverseGraph(universeId, next)) return false;
  Object.assign(graphData, next);
  return true;
}

export function getEnrichedWormholes(universe, graphData) {
  const list = graphData?.wormholes || universe.wormholes || [];
  return list.map((wh) => {
    const targetU = universeRegistry[wh.targetUniverseId];
    return {
      ...wh,
      targetLabel: targetU?.shortName || targetU?.name || wh.targetUniverseId,
    };
  });
}
