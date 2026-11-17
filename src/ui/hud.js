import { renderFormula } from './formula.js';
import { escapeHtml } from './html.js';
import { getAllUniverses, getUniverse, loadUniverseGraph } from '../state/universeStore.js';

export function createHud({
  getCurrentUniverse,
  getGraphData,
  getActiveUniverseId,
  onSwitchUniverse,
  onSelectCategory,
  onFocusNode,
  onJumpWormhole,
}) {
  const tooltipEl = document.getElementById('hover-tooltip');
  const drawerEl = document.getElementById('inspector-drawer');
  const clusterFiltersEl = document.getElementById('cluster-filters');
  const universeSwitcherEl = document.getElementById('universe-switcher');
  const brandSubtitleEl = document.getElementById('brand-subtitle');
  const statNodesEl = document.getElementById('stat-nodes');
  const statEdgesEl = document.getElementById('stat-edges');

  function getCategory(catId) {
    const cats = getCurrentUniverse().categories;
    return Object.hasOwn(cats, catId) ? cats[catId] : Object.values(cats)[0];
  }

  function updateStats() {
    const data = getGraphData();
    statNodesEl.textContent = `${data.nodes.length} 颗星`;
    statEdgesEl.textContent = `${data.links.length} 条星轨`;
  }

  function positionTooltip(screenPos) {
    const pad = 16;
    const rect = tooltipEl.getBoundingClientRect();
    let left = screenPos.x + 18;
    let top = screenPos.y + 18;

    if (left + rect.width > window.innerWidth - pad) {
      left = screenPos.x - rect.width - 18;
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = screenPos.y - rect.height - 18;
    }
    tooltipEl.style.left = `${Math.max(pad, left)}px`;
    tooltipEl.style.top = `${Math.max(pad, top)}px`;
  }

  function showNodeTooltip(node, screenPos) {
    const cat = getCategory(node.category);
    tooltipEl.innerHTML = `
      <div class="tooltip-tag" style="color: ${escapeHtml(cat.color)}; border: 1px solid ${escapeHtml(cat.color)}55;">
        <span class="cluster-dot" style="--chip-color: ${escapeHtml(cat.color)}"></span>
        ${escapeHtml(cat.name)}
      </div>
      <div class="tooltip-title">${escapeHtml(node.name)}</div>
      <div class="tooltip-sub">${escapeHtml(node.en)}</div>
      ${node.formula ? `<div class="tooltip-formula">${renderFormula(node.formula, false)}</div>` : ''}
      <div class="tooltip-desc">${escapeHtml(node.summary)}</div>
      <div class="tooltip-footer">前置来源 ${node.inDegree} · 后续延伸 ${node.outDegree} · 点击聚焦</div>
    `;
    tooltipEl.classList.remove('hidden');
    positionTooltip(screenPos);
  }

  function showEdgeTooltip(edge, screenPos) {
    const srcCat = getCategory(edge.sourceNode.category);
    const tgtCat = getCategory(edge.targetNode.category);
    tooltipEl.innerHTML = `
      <div class="tooltip-tag" style="color: #7dd3fc; border: 1px solid rgba(56, 189, 248, 0.4);">
        ✦ 有向星轨 · ${escapeHtml(edge.relation)}
      </div>
      <div class="tooltip-edge-pair">
        <span style="color: ${escapeHtml(srcCat.color)}">${escapeHtml(edge.sourceNode.name)}</span>
        <span class="tooltip-edge-arrow">→</span>
        <span style="color: ${escapeHtml(tgtCat.color)}">${escapeHtml(edge.targetNode.name)}</span>
      </div>
      <div class="tooltip-desc">${escapeHtml(edge.description)}</div>
    `;
    tooltipEl.classList.remove('hidden');
    positionTooltip(screenPos);
  }

  function showWormholeTooltip(wh, screenPos) {
    const targetU = getUniverse(wh.targetUniverseId);
    tooltipEl.innerHTML = `
      <div class="tooltip-tag" style="color: #c4b5fd; border: 1px solid rgba(167, 139, 250, 0.5);">
        🌀 时空虫洞 · 跨宇宙跃迁
      </div>
      <div class="tooltip-edge-pair">
        <span>${escapeHtml(wh.anchorNode.name)}</span>
        <span class="tooltip-edge-arrow">⟶</span>
        <span style="color: #7dd3fc">${escapeHtml(targetU?.shortName || targetU?.name || wh.targetUniverseId)}</span>
      </div>
      <div class="tooltip-desc">${escapeHtml(wh.description)}</div>
      <div class="tooltip-footer">点击虫洞，立即穿越至目标平行宇宙</div>
    `;
    tooltipEl.classList.remove('hidden');
    positionTooltip(screenPos);
  }

  function hideTooltip() {
    tooltipEl.classList.add('hidden');
  }

  function openInspectorDrawer(node) {
    if (!node) {
      drawerEl.classList.add('hidden');
      return;
    }

    const graphData = getGraphData();
    const cat = getCategory(node.category);
    const catBadge = document.getElementById('drawer-category');
    catBadge.textContent = cat.name;
    catBadge.style.color = cat.color;

    document.getElementById('drawer-title').textContent = node.name;
    document.getElementById('drawer-en').textContent = node.en;

    const formulaEl = document.getElementById('drawer-formula');
    if (node.formula) {
      formulaEl.innerHTML = renderFormula(node.formula, true);
      formulaEl.classList.remove('hidden');
    } else {
      formulaEl.classList.add('hidden');
    }

    document.getElementById('drawer-desc').textContent = node.summary;

    const pointsEl = document.getElementById('drawer-points');
    pointsEl.innerHTML = '';
    (node.points || []).forEach((pt) => {
      const li = document.createElement('li');
      li.textContent = pt;
      pointsEl.appendChild(li);
    });

    const incoming = graphData.links.filter((l) => l.target === node.id);
    const outgoing = graphData.links.filter((l) => l.source === node.id);
    document.getElementById('drawer-links-count').textContent = incoming.length + outgoing.length;

    const linksContainer = document.getElementById('drawer-links');
    linksContainer.innerHTML = '';

    const renderGroup = (titleText, list, isOutgoing) => {
      if (list.length === 0) return;
      const groupHeader = document.createElement('div');
      groupHeader.className = 'link-group-title';
      groupHeader.textContent = `${titleText} (${list.length})`;
      linksContainer.appendChild(groupHeader);

      list.forEach((link) => {
        const otherId = isOutgoing ? link.target : link.source;
        const otherNode = graphData.nodes.find((n) => n.id === otherId);
        if (!otherNode) return;
        const otherCat = getCategory(otherNode.category);
        const dirSymbol = isOutgoing ? '→' : '←';

        const card = document.createElement('div');
        card.className = 'drawer-link-card';
        card.innerHTML = `
          <div class="link-card-top">
            <span class="link-card-target">
              <span class="link-dir-arrow">${dirSymbol}</span>
              <span class="cluster-dot" style="--chip-color: ${escapeHtml(otherCat.color)}"></span>
              ${escapeHtml(otherNode.name)}
            </span>
            <span class="link-card-rel">${escapeHtml(link.relation)}</span>
          </div>
          <div class="link-card-desc">${escapeHtml(link.description)}</div>
        `;
        card.addEventListener('click', () => onFocusNode(otherNode.id));
        linksContainer.appendChild(card);
      });
    };

    renderGroup('后续延伸 / 推导 (Outgoing)', outgoing, true);
    renderGroup('前置基石 / 来源 (Incoming)', incoming, false);

    const attachedWormholes = (graphData.wormholes || []).filter(
      (w) => w.anchorNodeId === node.id
    );
    if (attachedWormholes.length > 0) {
      const whHeader = document.createElement('div');
      whHeader.className = 'link-group-title';
      whHeader.textContent = `时空虫洞跃迁 (${attachedWormholes.length})`;
      linksContainer.appendChild(whHeader);

      attachedWormholes.forEach((wh) => {
        const targetU = getUniverse(wh.targetUniverseId);
        const whCard = document.createElement('div');
        whCard.className = 'drawer-wormhole-card';
        whCard.innerHTML = `
          <div class="link-card-top">
            <span class="link-card-target">
              <span>🌀</span>
              <span>跃迁至：${escapeHtml(targetU ? targetU.name : wh.targetUniverseId)}</span>
            </span>
          </div>
          <div class="link-card-desc">${escapeHtml(wh.description)}</div>
        `;
        whCard.addEventListener('click', () => onJumpWormhole(wh));
        linksContainer.appendChild(whCard);
      });
    }

    drawerEl.classList.remove('hidden');
  }

  function renderUniverseSwitcher() {
    const activeId = getActiveUniverseId();
    universeSwitcherEl.innerHTML = '';

    getAllUniverses().forEach((u) => {
      const data = u.id === activeId ? getGraphData() : loadUniverseGraph(u.id);
      const btn = document.createElement('button');
      btn.className = `universe-item${u.id === activeId ? ' active' : ''}`;
      btn.dataset.universe = u.id;
      btn.title = u.name;
      btn.innerHTML = `
        <span class="universe-item-icon">${escapeHtml(u.icon || '✦')}</span>
        <div class="universe-item-info">
          <div class="universe-item-name">${escapeHtml(u.shortName || u.name)}</div>
          <div class="universe-item-meta">${data.nodes.length} 星 · ${data.links.length} 轨</div>
        </div>
      `;
      universeSwitcherEl.appendChild(btn);
    });
  }

  function renderClusterFilters() {
    clusterFiltersEl.innerHTML = '';

    const allChip = document.createElement('button');
    allChip.className = 'cluster-chip active';
    allChip.style.setProperty('--chip-color', '#e2e8f0');
    allChip.innerHTML = `<span class="cluster-dot"></span> 全部星域`;
    allChip.dataset.cat = 'all';
    clusterFiltersEl.appendChild(allChip);

    Object.values(getCurrentUniverse().categories).forEach((cat) => {
      const chip = document.createElement('button');
      chip.className = 'cluster-chip';
      chip.style.setProperty('--chip-color', cat.color);
      chip.innerHTML = `<span class="cluster-dot"></span> ${escapeHtml(cat.name)}`;
      chip.dataset.cat = cat.id;
      clusterFiltersEl.appendChild(chip);
    });
  }

  function setSubtitle(text) {
    brandSubtitleEl.textContent = text;
  }

  universeSwitcherEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.universe-item');
    if (!btn) return;
    onSwitchUniverse(btn.dataset.universe);
  });

  clusterFiltersEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.cluster-chip');
    if (!btn) return;
    clusterFiltersEl.querySelectorAll('.cluster-chip').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    onSelectCategory(btn.dataset.cat);
  });

  return {
    updateStats,
    showNodeTooltip,
    showEdgeTooltip,
    showWormholeTooltip,
    hideTooltip,
    openInspectorDrawer,
    renderUniverseSwitcher,
    renderClusterFilters,
    setSubtitle,
  };
}
