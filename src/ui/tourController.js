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

export function createTourController({ getUniverse, getGraphData, onFocusNode }) {
  const tourBarEl = document.getElementById('tour-bar');
  const tourCounterEl = document.getElementById('tour-step-counter');
  const tourTitleEl = document.getElementById('tour-node-title');
  const tourNarrationEl = document.getElementById('tour-narration');
  const tourPrevBtn = document.getElementById('tour-prev');
  const tourNextBtn = document.getElementById('tour-next');
  const tourAutoBtn = document.getElementById('tour-autoplay');
  const tourCloseBtn = document.getElementById('tour-close');

  let activeTour = [];
  let tourIndex = 0;
  let tourTimer = null;

  function renderStep() {
    if (activeTour.length === 0) return;
    const step = activeTour[tourIndex];
    const graphData = getGraphData();
    const node = graphData.nodes.find((n) => n.id === step.nodeId);
    if (!node) return;

    tourCounterEl.textContent = `${tourIndex + 1} / ${activeTour.length}`;
    tourTitleEl.textContent = `${node.name} (${node.en})`;
    tourNarrationEl.textContent = step.narration;

    tourPrevBtn.disabled = tourIndex === 0;
    tourNextBtn.textContent = tourIndex === activeTour.length - 1 ? '完成 ✓' : '下一步 →';
    onFocusNode(step.nodeId);
  }

  function stopTour() {
    if (tourTimer) {
      clearInterval(tourTimer);
      tourTimer = null;
    }
    tourAutoBtn.classList.remove('active');
    tourBarEl.classList.add('hidden');
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
    tourBarEl.classList.remove('hidden');
    renderStep();
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
  tourAutoBtn.addEventListener('click', () => {
    if (tourTimer) {
      clearInterval(tourTimer);
      tourTimer = null;
      tourAutoBtn.classList.remove('active');
    } else {
      tourAutoBtn.classList.add('active');
      tourTimer = setInterval(() => {
        if (tourIndex < activeTour.length - 1) {
          tourIndex++;
          renderStep();
        } else {
          stopTour();
        }
      }, 5500);
    }
  });

  return { startTour, stopTour };
}
