import { UNIVERSES as BASE_UNIVERSES } from '../data/universes.js';
import { UniverseSchema } from '../schemas/graphSchema.ts';

const STORAGE_PREFIX = 'starlink_universe_v3_';
const ACTIVE_UNIVERSE_KEY = 'starlink_active_universe_v3';
const CUSTOM_UNIVERSES_KEY = 'starlink_custom_universes_v3';
const LEARNING_STATE_KEY = 'starlink_learning_state_v1';
const DAY_MS = 24 * 60 * 60 * 1000;
export const REVIEW_INTERVALS = [1, 3, 7, 14];

function loadLearningStateMap() {
  try {
    const raw = localStorage.getItem(LEARNING_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return {};
}

function saveLearningStateMap(map) {
  try {
    localStorage.setItem(LEARNING_STATE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

export function getNodeLearningState(universeId, nodeId) {
  const all = loadLearningStateMap();
  return all?.[universeId]?.[nodeId] || { mastery: 'unlearned', intervalDays: 0, nextReviewAt: null };
}

export function getNodeMastery(universeId, nodeId) {
  return getNodeLearningState(universeId, nodeId).mastery || 'unlearned';
}

export function setNodeMastery(universeId, nodeId, mastery) {
  const all = loadLearningStateMap();
  if (!all[universeId]) all[universeId] = {};
  const prev = all[universeId][nodeId] || {};
  const now = Date.now();
  let intervalDays = prev.intervalDays || 0;
  let nextReviewAt = prev.nextReviewAt ?? null;

  if (mastery === 'unlearned') {
    intervalDays = 0;
    nextReviewAt = null;
  } else if (mastery === 'learning') {
    intervalDays = 0;
    nextReviewAt = now;
  } else if (mastery === 'mastered') {
    intervalDays = intervalDays > 0 ? intervalDays : REVIEW_INTERVALS[0];
    nextReviewAt = now + intervalDays * DAY_MS;
  }

  all[universeId][nodeId] = {
    ...prev,
    mastery,
    intervalDays,
    nextReviewAt,
    updatedAt: now,
  };
  saveLearningStateMap(all);
  return all[universeId][nodeId];
}

export function advanceNodeReview(universeId, nodeId) {
  const all = loadLearningStateMap();
  if (!all[universeId]) all[universeId] = {};
  const prev = all[universeId][nodeId] || {};
  const curInterval = prev.intervalDays || 0;
  const idx = REVIEW_INTERVALS.indexOf(curInterval);
  const nextInterval =
    idx >= 0 && idx < REVIEW_INTERVALS.length - 1
      ? REVIEW_INTERVALS[idx + 1]
      : idx === REVIEW_INTERVALS.length - 1
        ? REVIEW_INTERVALS[REVIEW_INTERVALS.length - 1]
        : REVIEW_INTERVALS[0];

  const now = Date.now();
  all[universeId][nodeId] = {
    ...prev,
    mastery: 'mastered',
    intervalDays: nextInterval,
    nextReviewAt: now + nextInterval * DAY_MS,
    updatedAt: now,
  };
  saveLearningStateMap(all);
  return all[universeId][nodeId];
}

export function isNodeDueForReview(universeId, nodeId, now = Date.now()) {
  const st = getNodeLearningState(universeId, nodeId);
  if (st.mastery === 'learning') return true;
  if (st.mastery === 'mastered' && st.nextReviewAt !== null && st.nextReviewAt <= now) return true;
  return false;
}

export function getTonightToLightUp(universeId, nodes = [], now = Date.now()) {
  const dueNodes = [];
  const unlearnedNodes = [];
  for (const n of nodes) {
    const st = getNodeLearningState(universeId, n.id);
    if (st.mastery === 'learning' || (st.mastery === 'mastered' && st.nextReviewAt !== null && st.nextReviewAt <= now)) {
      dueNodes.push(n);
    } else if (st.mastery === 'unlearned') {
      unlearnedNodes.push(n);
    }
  }
  const reviewQueue = [...dueNodes, ...unlearnedNodes];
  return {
    totalCount: reviewQueue.length,
    dueCount: dueNodes.length,
    unlearnedCount: unlearnedNodes.length,
    reviewQueue,
  };
}

export function getUniversePrimaryColor(universe) {
  if (!universe?.categories) return '#38bdf8';
  const cats = Object.values(universe.categories);
  if (cats.length === 0) return '#38bdf8';
  if (Array.isArray(universe.nodes) && universe.nodes.length > 0) {
    const counts = new Map();
    for (const n of universe.nodes) {
      counts.set(n.category, (counts.get(n.category) || 0) + 1);
    }
    let bestCat = cats[0];
    let bestCount = -1;
    for (const c of cats) {
      const cnt = counts.get(c.id) || 0;
      if (cnt > bestCount) {
        bestCount = cnt;
        bestCat = c;
      }
    }
    return bestCat.color || '#38bdf8';
  }
  return cats[0].color || '#38bdf8';
}

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

async function readUniverseManifest(path) {
  try {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) return [];
    const entries = await response.json();
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

export async function initUniverseRegistry() {
  try {
    const [published, local] = await Promise.all([
      readUniverseManifest('./universes/manifest.json'),
      readUniverseManifest('./universes/manifest.local.json'),
    ]);
    const manifest = new Map();
    for (const entry of [...published, ...local]) {
      if (typeof entry?.id === 'string' && typeof entry?.path === 'string') {
        manifest.set(entry.id, entry.path);
      }
    }

    const customIds = new Set(Object.keys(loadCustomUniverses()));

    await Promise.all(
      Array.from(manifest, async ([id, path]) => {
        try {
          const uRes = await fetch(path, { cache: 'no-cache' });
          if (!uRes.ok) return;
          const rawJson = await uRes.json();
          const parsed = UniverseSchema.safeParse(rawJson);
          if (!parsed.success) {
            console.warn(`[mind_starmap] Invalid universe.json at ${path}:`, parsed.error.issues);
            return;
          }
          if (parsed.data.id !== id) return;
          // Preserve user-customized overrides if same id was edited in localStorage custom registry
          if (!customIds.has(parsed.data.id)) {
            Object.defineProperty(universeRegistry, id, {
              value: parsed.data,
              enumerable: true,
              configurable: true,
              writable: true,
            });
          }
        } catch (err) {
          console.warn(`[mind_starmap] Failed to load universe from ${path}:`, err);
        }
      })
    );
  } catch {
    // Offline or fallback to bundled BASE_UNIVERSES
  }
}

export function getDeepLinkParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    universeId: params.get('universe'),
    focusNodeId: params.get('focus'),
  };
}

export function getAllUniverses() {
  return Object.values(universeRegistry);
}

export function getUniverse(universeId) {
  return universeRegistry[universeId] || universeRegistry.starter || Object.values(universeRegistry)[0];
}

export function getActiveUniverseId() {
  const { universeId } = getDeepLinkParams();
  if (universeId && universeRegistry[universeId]) return universeId;
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
    return true;
  } catch {
    return false;
  }
}

export function commitGraphPatch(universeId, graphData, patch) {
  const firstAddedId = applyGraphPatch(graphData, patch);
  if (!saveUniverseGraph(universeId, graphData)) {
    return false;
  }
  return firstAddedId ?? true;
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
