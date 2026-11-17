import './style.css';
import 'katex/dist/katex.min.css';
import { StarMapScene } from './StarMapScene.js';
import {
  getActiveUniverseId,
  setActiveUniverseId,
  getUniverse,
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

const btnGuidedTour = document.getElementById('btn-guided-tour');
const btnAiImport = document.getElementById('btn-ai-import');
const btnAddNode = document.getElementById('btn-add-node');
const btnAddLink = document.getElementById('btn-add-link');
const btnToggleOrbit = document.getElementById('btn-toggle-orbit');
const btnTogglePhysics = document.getElementById('btn-toggle-physics');
const btnToggleLabels = document.getElementById('btn-toggle-labels');
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
});

scene = new StarMapScene(container, {
  onHoverNode: hud.showNodeTooltip,
  onHoverEdge: hud.showEdgeTooltip,
  onHoverWormhole: hud.showWormholeTooltip,
  onHoverClear: hud.hideTooltip,
  onSelectNode: hud.openInspectorDrawer,
  onClickWormhole: (wh) => jumpThroughWormhole(wh),
});

tour = createTourController({
  getUniverse: () => currentUniverse,
  getGraphData: () => graphData,
  onFocusNode: (nodeId) => scene.focusOnNode(nodeId),
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

function refreshScene() {
  scene.setGraphData(
    graphData.nodes,
    graphData.links,
    currentUniverse.categories,
    currentUniverse.anchors,
    getEnrichedWormholes(currentUniverse, graphData)
  );
  hud.updateStats();
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
    scene.resetView();
  }
  hud.hideTooltip();
}

function jumpThroughWormhole(wh) {
  if (!loadUniverseGraph(wh.targetUniverseId).nodes.some((node) => node.id === wh.targetNodeId)) return;
  hud.hideTooltip();
  warpFlashEl.classList.add('active');
  setTimeout(() => {
    switchUniverse(wh.targetUniverseId, wh.targetNodeId);
    setTimeout(() => warpFlashEl.classList.remove('active'), 180);
  }, 240);
}

// Initial Render
hud.setSubtitle(currentUniverse.subtitle || '');
hud.renderUniverseSwitcher();
hud.renderClusterFilters();
refreshScene();

// Search & Controls
searchInput.addEventListener('input', () => {
  const val = searchInput.value;
  clearSearchBtn.classList.toggle('hidden', val.length === 0);
  scene.setSearchQuery(val);
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearSearchBtn.classList.add('hidden');
  scene.setSearchQuery('');
});

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
