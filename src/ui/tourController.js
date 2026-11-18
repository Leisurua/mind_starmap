import { renderRichText } from './formula.js';
import { escapeHtml } from './html.js';

export function buildAutoTour(nodes, links) {
  const inDeg = new Map(nodes.map((n) => [n.id, 0]));
  const adj = new Map(nodes.map((n) => [n.id, []]));

  links.forEach((l) => {
    if (inDeg.has(l.target) && adj.has(l.source)) {
      inDeg.set(l.target, inDeg.get(l.target) + 1);
      adj.get(l.source).push(l.target);
    }
  });

  const queue = nodes.filter((n) => inDeg.get(n.id) === 0).map((n) => n.id);
  const visited = new Set(queue);
  const order = [];

  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    for (const nxt of adj.get(id) || []) {
      if (!visited.has(nxt)) {
        visited.add(nxt);
        queue.push(nxt);
      }
    }
  }

  nodes.forEach((n) => {
    if (!visited.has(n.id)) order.push(n.id);
  });

  return order.slice(0, 10).map((id, idx) => {
    const n = nodes.find((x) => x.id === id);
    return {
      nodeId: id,
      narration: `第 ${idx + 1} 站【${n.name}】：${n.summary}`,
    };
  });
}

export function createTourController({
  getUniverse,
  getGraphData,
  onFocusNode,
  onShowTourPreview,
  onTourStepHighlight,
  onClearTourVisuals,
}) {
  const tourBarEl = document.getElementById('tour-bar');
  const tourCounterEl = document.getElementById('tour-step-counter');
  const tourTitleEl = document.getElementById('tour-node-title');
  const tourNarrationEl = document.getElementById('tour-narration');
  const tourTransitionEl = document.getElementById('tour-transition-reason');
  const tourProgressFillEl = document.getElementById('tour-progress-fill');
  const tourPrevBtn = document.getElementById('tour-prev');
  const tourNextBtn = document.getElementById('tour-next');
  const tourAutoBtn = document.getElementById('tour-autoplay');
  const tourCloseBtn = document.getElementById('tour-close');

  let activeTour = [];
  let tourIndex = 0;
  let tourTimer = null;
  let previewTimeout = null;
  let isActive = false;

  function updateAutoBtnUI() {
    const playing = Boolean(tourTimer);
    tourAutoBtn.classList.toggle('active', playing);
    tourAutoBtn.textContent = playing ? '⏸ 暂停 (Space)' : '▶ 继续 (Space)';
  }

  function startAutoplay() {
    if (tourTimer) return;
    tourTimer = setInterval(() => {
      if (tourIndex < activeTour.length - 1) {
        tourIndex++;
        renderStep();
      } else {
        stopTour();
      }
    }, 6000);
    updateAutoBtnUI();
  }

  function pauseAutoplay() {
    if (tourTimer) {
      clearInterval(tourTimer);
      tourTimer = null;
    }
    updateAutoBtnUI();
  }

  function toggleAutoplay() {
    if (!isActive || activeTour.length === 0) return;
    if (tourTimer) pauseAutoplay();
    else startAutoplay();
  }

  function findConnectingPath(graphData, prevId, currId) {
    if (!prevId || !currId) return null;
    const direct =
      graphData.links.find((l) => l.source === prevId && l.target === currId) ||
      graphData.links.find((l) => l.source === currId && l.target === prevId);
    if (direct) return { type: 'direct', link: direct };

    // Check 2-hop bridge prevId -> mid -> currId
    for (const l1 of graphData.links) {
      if (l1.source !== prevId) continue;
      const l2 = graphData.links.find((l) => l.source === l1.target && l.target === currId);
      if (l2) {
        const midNode = graphData.nodes.find((n) => n.id === l1.target);
        return { type: 'two-hop', midNode, link1: l1, link2: l2 };
      }
    }
    return null;
  }

  function renderStep() {
    if (activeTour.length === 0) return;
    const step = activeTour[tourIndex];
    const prevStep = tourIndex > 0 ? activeTour[tourIndex - 1] : null;
    const graphData = getGraphData();
    const node = graphData.nodes.find((n) => n.id === step.nodeId);
    if (!node) return;

    tourCounterEl.textContent = `${tourIndex + 1} / ${activeTour.length}`;
    if (tourProgressFillEl) {
      tourProgressFillEl.style.width = `${((tourIndex + 1) / activeTour.length) * 100}%`;
    }
    tourTitleEl.textContent = `${node.name}${node.en ? ` (${node.en})` : ''}`;

    const formulaSuffix = node.formula && !String(step.narration).includes('$')
      ? `<div class="tour-formula-inline">${renderRichText(`$$${node.formula}$$`)}</div>`
      : '';
    tourNarrationEl.innerHTML = `${renderRichText(step.narration)}${formulaSuffix}`;

    if (tourTransitionEl) {
      if (prevStep) {
        const prevNode = graphData.nodes.find((n) => n.id === prevStep.nodeId);
        const conn = findConnectingPath(graphData, prevStep.nodeId, step.nodeId);
        if (conn?.type === 'direct' && prevNode) {
          tourTransitionEl.innerHTML = `<span class="transition-tag">衔接脉络</span> <strong>${escapeHtml(prevNode.name)}</strong> <span class="transition-rel">── ${escapeHtml(conn.link.relation)} ──▶</span> <strong>${escapeHtml(node.name)}</strong>：${escapeHtml(conn.link.description)}`;
          tourTransitionEl.classList.remove('hidden');
        } else if (conn?.type === 'two-hop' && prevNode && conn.midNode) {
          tourTransitionEl.innerHTML = `<span class="transition-tag">脉络演进</span> <strong>${escapeHtml(prevNode.name)}</strong> <span class="transition-rel">→ ${escapeHtml(conn.midNode.name)} (${escapeHtml(conn.link2.relation)}) →</span> <strong>${escapeHtml(node.name)}</strong>：${escapeHtml(conn.link2.description)}`;
          tourTransitionEl.classList.remove('hidden');
        } else if (prevNode) {
          const sameDomain = prevNode.category === node.category;
          const tag = sameDomain ? '同域脉络' : '跨星域衔接';
          tourTransitionEl.innerHTML = `<span class="transition-tag">${tag}</span> 从 <strong>${escapeHtml(prevNode.name)}</strong> 切换到 <strong>${escapeHtml(node.name)}</strong>`;
          tourTransitionEl.classList.remove('hidden');
        } else {
          tourTransitionEl.classList.add('hidden');
        }
      } else {
        tourTransitionEl.innerHTML = `<span class="transition-tag">航线起点</span> 全览航线已点亮，正在飞向第 1 站`;
        tourTransitionEl.classList.remove('hidden');
      }
    }

    tourPrevBtn.disabled = tourIndex === 0;
    tourNextBtn.textContent = tourIndex === activeTour.length - 1 ? '完成 ✓' : '下一站 →';

    if (onTourStepHighlight) {
      onTourStepHighlight(prevStep?.nodeId || null, step.nodeId);
    } else {
      onFocusNode(step.nodeId);
    }
  }

  function stopTour() {
    isActive = false;
    if (previewTimeout) {
      clearTimeout(previewTimeout);
      previewTimeout = null;
    }
    pauseAutoplay();
    tourBarEl.classList.add('hidden');
    onClearTourVisuals?.();
  }

  function startTour(customSteps = null) {
    stopTour();
    const universe = getUniverse();
    const graphData = getGraphData();
    const steps =
      customSteps && customSteps.length > 0
        ? customSteps
        : universe.tour && universe.tour.length > 0
          ? universe.tour
          : buildAutoTour(graphData.nodes, graphData.links);

    if (steps.length === 0) return;
    activeTour = steps;
    tourIndex = 0;
    isActive = true;

    tourBarEl.classList.remove('hidden');
    if (tourProgressFillEl) tourProgressFillEl.style.width = `${(1 / steps.length) * 100}%`;
    tourCounterEl.textContent = `航线预览 · ${steps.length} 站`;
    tourTitleEl.textContent = `🧭 ${universe.shortName || universe.name} · 导览航线`;
    tourNarrationEl.innerHTML = '正在展开全局星图航线预览，随后依次带你沿有向脉络深入每一颗星...';
    if (tourTransitionEl) tourTransitionEl.classList.add('hidden');
    updateAutoBtnUI();

    onShowTourPreview?.(steps);

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const delay = reducedMotion ? 80 : 850;
    previewTimeout = setTimeout(() => {
      previewTimeout = null;
      if (isActive) renderStep();
    }, delay);
  }

  tourCloseBtn.addEventListener('click', stopTour);
  tourPrevBtn.addEventListener('click', () => {
    if (tourIndex > 0) {
      tourIndex--;
      renderStep();
    }
  });
  tourNextBtn.addEventListener('click', () => {
    if (tourIndex < activeTour.length - 1) {
      tourIndex++;
      renderStep();
    } else {
      stopTour();
    }
  });
  tourAutoBtn.addEventListener('click', toggleAutoplay);

  window.addEventListener('keydown', (e) => {
    if (!isActive || e.code !== 'Space') return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    e.preventDefault();
    toggleAutoplay();
  });

  return { startTour, stopTour, isTourActive: () => isActive };
}
