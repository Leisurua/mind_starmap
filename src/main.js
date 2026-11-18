import './style.css';
import 'katex/dist/katex.min.css';
import { StarMapScene } from './StarMapScene.js';
import {
  initUniverseRegistry,
  getDeepLinkParams,
  getActiveUniverseId,
  setActiveUniverseId,
  getAllUniverses,
  getUniverse,
  getUniversePrimaryColor,
  getNodeLearningState,
  isNodeDueForReview,
  getTonightToLightUp,
  loadUniverseGraph,
  getEnrichedWormholes,
} from './state/universeStore.js';
import { createHud } from './ui/hud.js';
import { createTourController } from './ui/tourController.js';
import { createModals } from './ui/modals.js';

let activeUniverseId = getActiveUniverseId();
let currentUniverse = getUniverse(activeUniverseId);
let graphData = loadUniverseGraph(activeUniverseId);

const container = document.getElementById('canvas-container');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');

const btnTonightReview = document.getElementById('btn-tonight-review');
const btnGuidedTour = document.getElementById('btn-guided-tour');
const btnAiImport = document.getElementById('btn-ai-import');
const btnAddNode = document.getElementById('btn-add-node');
const btnAddLink = document.getElementById('btn-add-link');
const btnToggleOrbit = document.getElementById('btn-toggle-orbit');
const btnTogglePhysics = document.getElementById('btn-toggle-physics');
const btnToggleLabels = document.getElementById('btn-toggle-labels');
const btnToggleBloom = document.getElementById('btn-toggle-bloom');
const btnResetView = document.getElementById('btn-reset-view');
const btnCloseDrawer = document.getElementById('btn-close-drawer');

const warpFlashEl = document.createElement('div');
warpFlashEl.className = 'warp-flash';
document.body.appendChild(warpFlashEl);

let scene;
let tour;

const hud = createHud({
  getCurrentUniverse: () => currentUniverse,
  getGraphData: () => graphData,
  getActiveUniverseId: () => activeUniverseId,
  onSwitchUniverse: (id) => switchUniverse(id),
  onSelectCategory: (catId) => scene.setCategoryFilter(catId),
  onFocusNode: (nodeId) => scene.focusOnNode(nodeId),
  onJumpWormhole: (wh) => jumpThroughWormhole(wh),
  onStartTrace: (nodeId, mode) => scene.startTrace(nodeId, mode),
  onClearTrace: () => scene.clearTrace(),
  onFlyToTraceNode: (nodeId) => scene.flyToNodeInTrace(nodeId),
  onHoverSidebarUniverse: (universeId) => scene.highlightDistantGalaxy(universeId),
  onLearningStateChanged: () => scene.refreshNodeLearningStates(),
});

scene = new StarMapScene(container, {
  onHoverNode: hud.showNodeTooltip,
  onHoverEdge: hud.showEdgeTooltip,
  onHoverWormhole: hud.showWormholeTooltip,
  onHoverGalaxy: hud.showGalaxyTooltip,
  onHoverClear: hud.hideTooltip,
  onSelectNode: hud.openInspectorDrawer,
  onClickWormhole: (wh) => jumpThroughWormhole(wh),
  onClickGalaxy: (u) => warpToUniverse(u.id),
  onTraceChange: hud.renderTracePanel,
  getNodeLearningInfo: (nodeId) => {
    const st = getNodeLearningState(activeUniverseId, nodeId);
    return {
      mastery: st.mastery || 'unlearned',
      isDue: isNodeDueForReview(activeUniverseId, nodeId),
    };
  },
});

if (btnToggleBloom) {
  btnToggleBloom.classList.toggle('active', scene.isBloomEnabled());
}

tour = createTourController({
  getUniverse: () => currentUniverse,
  getGraphData: () => graphData,
  onFocusNode: (nodeId) => scene.focusOnNode(nodeId),
  onShowTourPreview: (steps) => scene.showTourPreview(steps),
  onTourStepHighlight: (prevId, currId) => scene.setTourStepHighlight(prevId, currId),
  onClearTourVisuals: () => scene.clearTourVisuals(),
});

window.addEventListener('pagehide', (event) => {
  if (!event.persisted) {
    tour.stopTour();
    scene.destroy();
  }
});

const modals = createModals({
  getActiveUniverseId: () => activeUniverseId,
  getCurrentUniverse: () => currentUniverse,
  getGraphData: () => graphData,
  onGraphMutated: (focusNodeId) => {
    refreshScene();
    hud.renderUniverseSwitcher();
    if (focusNodeId) {
      setTimeout(() => scene.focusOnNode(focusNodeId), 140);
    }
  },
  onUniverseCreated: (u) => {
    switchUniverse(u.id);
    setTimeout(() => tour.startTour(u.tour), 260);
  },
});

function syncParallelUniverses() {
  const summaries = getAllUniverses().map((u) => {
    const data = u.id === activeUniverseId ? graphData : loadUniverseGraph(u.id);
    return {
      id: u.id,
      name: u.name,
      shortName: u.shortName || u.name,
      icon: u.icon || '✦',
      subtitle: u.subtitle || '',
      primaryColor: getUniversePrimaryColor(u),
      nodeCount: data.nodes.length,
      linkCount: data.links.length,
    };
  });
  scene.setParallelUniverses(summaries, activeUniverseId);
}

function refreshScene() {
  syncParallelUniverses();
  scene.setGraphData(
    graphData.nodes,
    graphData.links,
    currentUniverse.categories,
    currentUniverse.anchors,
    getEnrichedWormholes(currentUniverse, graphData)
  );
  hud.updateStats();
  hud.updateTonightBadge();
}

function switchUniverse(universeId, focusNodeId = null) {
  const nextUniverse = getUniverse(universeId);
  if (!nextUniverse) return;
  if (universeId === activeUniverseId && !focusNodeId) return;
  tour.stopTour();
  if (universeId !== activeUniverseId) scene.clearSelection();

  activeUniverseId = universeId;
  setActiveUniverseId(universeId);

  currentUniverse = nextUniverse;
  graphData = loadUniverseGraph(universeId);

  hud.setSubtitle(currentUniverse.subtitle || '');
  searchInput.value = '';
  clearSearchBtn.classList.add('hidden');

  hud.renderUniverseSwitcher();
  hud.renderClusterFilters();

  scene.setSearchQuery('');
  scene.setCategoryFilter('all');
  refreshScene();

  if (focusNodeId) {
    setTimeout(() => scene.focusOnNode(focusNodeId), 80);
  } else {
    scene.fitToUniverse(true);
  }
  hud.hideTooltip();
}

function warpToUniverse(universeId, focusNodeId = null) {
  if (!getUniverse(universeId)) return;
  hud.hideTooltip();
  warpFlashEl.classList.add('active');
  scene.playWarpTransition(() => {
    switchUniverse(universeId, focusNodeId);
    setTimeout(() => warpFlashEl.classList.remove('active'), 280);
  });
}

function jumpThroughWormhole(wh) {
  if (!loadUniverseGraph(wh.targetUniverseId).nodes.some((node) => node.id === wh.targetNodeId)) return;
  warpToUniverse(wh.targetUniverseId, wh.targetNodeId);
}

// Initial Render + Async Folder-Based Universe Hydration
hud.setSubtitle(currentUniverse.subtitle || '');
hud.renderUniverseSwitcher();
hud.renderClusterFilters();
refreshScene();

initUniverseRegistry().then(() => {
  const { universeId, focusNodeId } = getDeepLinkParams();
  activeUniverseId = getActiveUniverseId();
  currentUniverse = getUniverse(activeUniverseId);
  graphData = loadUniverseGraph(activeUniverseId);

  hud.setSubtitle(currentUniverse.subtitle || '');
  hud.renderUniverseSwitcher();
  hud.renderClusterFilters();
  refreshScene();

  if (focusNodeId) {
    setTimeout(() => scene.focusOnNode(focusNodeId), 120);
  } else {
    scene.fitToUniverse(true);
  }
});

// Search & Controls
const leftSidebar = document.getElementById('left-sidebar');
const btnCollapseSidebar = document.getElementById('btn-collapse-sidebar');
const btnExpandSidebar = document.getElementById('btn-expand-sidebar');
const searchKbd = document.getElementById('search-kbd');

btnCollapseSidebar.addEventListener('click', () => {
  leftSidebar.classList.add('collapsed');
  btnExpandSidebar.classList.remove('hidden');
});

btnExpandSidebar.addEventListener('click', () => {
  leftSidebar.classList.remove('collapsed');
  btnExpandSidebar.classList.add('hidden');
});

searchInput.addEventListener('input', () => {
  const val = searchInput.value;
  clearSearchBtn.classList.toggle('hidden', val.length === 0);
  searchKbd.classList.toggle('hidden', val.length > 0);
  scene.setSearchQuery(val);
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearSearchBtn.classList.add('hidden');
  searchKbd.classList.remove('hidden');
  scene.setSearchQuery('');
});

window.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  if ((e.key === '/' && !isTyping) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
    e.preventDefault();
    leftSidebar.classList.remove('collapsed');
    btnExpandSidebar.classList.add('hidden');
    searchInput.focus();
  } else if (e.key === 'Escape') {
    if (isTyping) {
      document.activeElement.blur();
    } else if (scene.isTraceActive()) {
      scene.resetView();
    } else {
      scene.clearSelection();
    }
  }
});

if (btnTonightReview) {
  btnTonightReview.addEventListener('click', () => {
    const stats = getTonightToLightUp(activeUniverseId, graphData.nodes);
    const queue = stats.reviewQueue.length > 0 ? stats.reviewQueue : graphData.nodes;
    if (queue.length === 0) return;
    const reviewSteps = queue.slice(0, 10).map((n, idx) => ({
      nodeId: n.id,
      narration: `复习第 ${idx + 1} 站【${n.name}】：${n.summary}`,
    }));
    tour.startTour(reviewSteps);
  });
}

btnGuidedTour.addEventListener('click', () => tour.startTour());
btnAiImport.addEventListener('click', modals.openAiImportModal);
btnAddNode.addEventListener('click', modals.openAddNodeModal);
btnAddLink.addEventListener('click', modals.openAddLinkModal);
btnCloseDrawer.addEventListener('click', () => scene.clearSelection());
btnResetView.addEventListener('click', () => scene.resetView());

btnToggleOrbit.addEventListener('click', () => {
  const next = !btnToggleOrbit.classList.contains('active');
  btnToggleOrbit.classList.toggle('active', next);
  scene.setAutoOrbit(next);
});

btnTogglePhysics.addEventListener('click', () => {
  const next = !btnTogglePhysics.classList.contains('active');
  btnTogglePhysics.classList.toggle('active', next);
  scene.setPhysicsEnabled(next);
});

btnToggleLabels.addEventListener('click', () => {
  const next = !btnToggleLabels.classList.contains('active');
  btnToggleLabels.classList.toggle('active', next);
  scene.setShowLabels(next);
});

if (btnToggleBloom) {
  btnToggleBloom.addEventListener('click', () => {
    const next = !scene.isBloomEnabled();
    scene.setBloomEnabled(next);
    btnToggleBloom.classList.toggle('active', next);
  });
}
