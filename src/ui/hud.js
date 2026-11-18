import { renderFormula } from './formula.js';
import { escapeHtml } from './html.js';
import { renderSimpleMarkdown } from './markdown.js';
import { classifyRelation } from '../StarMapScene.js';
import {
  advanceNodeReview,
  getAllUniverses,
  getNodeLearningState,
  getNodeMastery,
  getTonightToLightUp,
  getUniverse,
  getUniversePrimaryColor,
  isNodeDueForReview,
  loadUniverseGraph,
  setNodeMastery,
} from '../state/universeStore.js';

const sourceTextCache = new Map();

export function createHud({
  getCurrentUniverse,
  getGraphData,
  getActiveUniverseId,
  onSwitchUniverse,
  onSelectCategory,
  onFocusNode,
  onJumpWormhole,
  onStartTrace,
  onClearTrace,
  onFlyToTraceNode,
  onHoverSidebarUniverse,
  onLearningStateChanged,
}) {
  const tooltipEl = document.getElementById('hover-tooltip');
  const drawerEl = document.getElementById('inspector-drawer');
  const clusterFiltersEl = document.getElementById('cluster-filters');
  const universeSwitcherEl = document.getElementById('universe-switcher');
  const brandSubtitleEl = document.getElementById('brand-subtitle');
  const statNodesEl = document.getElementById('stat-nodes');
  const statEdgesEl = document.getElementById('stat-edges');
  const btnExpandDrawer = document.getElementById('btn-expand-drawer');
  const drawerTabs = drawerEl.querySelectorAll('.drawer-tab');
  const tabGraphPanel = document.getElementById('drawer-tab-graph');
  const tabSourcePanel = document.getElementById('drawer-tab-source');
  const provenancePill = document.getElementById('drawer-provenance-pill');
  const provenancePath = document.getElementById('drawer-provenance-path');
  const sourceFilePathEl = document.getElementById('source-file-path');
  const sourceSectionTagEl = document.getElementById('source-section-tag');
  const sourceExcerptBlock = document.getElementById('source-excerpt-block');
  const sourceExcerptText = document.getElementById('source-excerpt-text');
  const sourceFullBlock = document.getElementById('source-full-block');
  const sourceMarkdownBody = document.getElementById('source-markdown-body');

  const edgeLegendEl = document.getElementById('edge-legend');
  const btnToggleLegend = document.getElementById('btn-toggle-legend');
  const hudBottomLeftEl = document.getElementById('hud-bottom-left');
  const btnToggleHints = document.getElementById('btn-toggle-hints');

  if (btnToggleHints && hudBottomLeftEl) {
    btnToggleHints.addEventListener('click', () => {
      const hidden = hudBottomLeftEl.classList.toggle('hints-hidden');
      btnToggleHints.setAttribute('aria-expanded', String(!hidden));
    });
  }
  const traceBannerEl = document.getElementById('trace-banner');
  const traceBannerTextEl = document.getElementById('trace-banner-text');
  const btnExitTrace = document.getElementById('btn-exit-trace');
  const btnTraceUpstream = document.getElementById('btn-trace-upstream');
  const btnTraceDownstream = document.getElementById('btn-trace-downstream');
  const tracePanelEl = document.getElementById('drawer-trace-panel');

  let activeTraceSummary = null;
  let showCollapsedMastered = false;

  if (btnToggleLegend && edgeLegendEl) {
    btnToggleLegend.addEventListener('click', () => {
      const collapsed = edgeLegendEl.classList.toggle('collapsed');
      btnToggleLegend.setAttribute('aria-expanded', String(!collapsed));
    });
  }

  if (btnExitTrace) {
    btnExitTrace.addEventListener('click', () => onClearTrace?.());
  }

  if (btnTraceUpstream) {
    btnTraceUpstream.addEventListener('click', () => {
      const nodeId = drawerEl.dataset.activeNodeId;
      if (!nodeId) return;
      if (activeTraceSummary?.mode === 'upstream' && activeTraceSummary?.rootNode?.id === nodeId) {
        onClearTrace?.();
      } else {
        onStartTrace?.(nodeId, 'upstream');
      }
    });
  }

  if (btnTraceDownstream) {
    btnTraceDownstream.addEventListener('click', () => {
      const nodeId = drawerEl.dataset.activeNodeId;
      if (!nodeId) return;
      if (activeTraceSummary?.mode === 'downstream' && activeTraceSummary?.rootNode?.id === nodeId) {
        onClearTrace?.();
      } else {
        onStartTrace?.(nodeId, 'downstream');
      }
    });
  }

  function setDrawerTab(tabName) {
    drawerTabs.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    tabGraphPanel.classList.toggle('hidden', tabName !== 'graph');
    tabSourcePanel.classList.toggle('hidden', tabName !== 'source');
  }

  drawerTabs.forEach((btn) => {
    btn.addEventListener('click', () => setDrawerTab(btn.dataset.tab));
  });

  btnExpandDrawer.addEventListener('click', () => {
    drawerEl.classList.toggle('expanded');
  });

  provenancePill.addEventListener('click', () => setDrawerTab('source'));

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
    const relStyle = edge.relStyle || classifyRelation(edge.relation);
    tooltipEl.innerHTML = `
      <div class="tooltip-tag" style="color: ${escapeHtml(relStyle.color)}; border: 1px solid ${escapeHtml(relStyle.color)}66;">
        ✦ ${escapeHtml(relStyle.label)} · ${escapeHtml(edge.relation)}
      </div>
      <div class="tooltip-edge-pair">
        <span style="color: ${escapeHtml(srcCat.color)}">${escapeHtml(edge.sourceNode.name)}</span>
        <span class="tooltip-edge-arrow">⟶</span>
        <span style="color: ${escapeHtml(tgtCat.color)}">${escapeHtml(edge.targetNode.name)}</span>
      </div>
      <div class="tooltip-desc">${escapeHtml(edge.description)}</div>
      <div class="tooltip-footer">起点亮 → 终点暗 · 点击任一端星点聚焦</div>
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

  function showGalaxyTooltip(universe, screenPos) {
    const color = universe.primaryColor || '#38bdf8';
    tooltipEl.innerHTML = `
      <div class="tooltip-tag" style="color: ${escapeHtml(color)}; border: 1px solid ${escapeHtml(color)}66;">
        🌌 远景平行宇宙
      </div>
      <div class="tooltip-title">${escapeHtml(universe.icon || '✦')} ${escapeHtml(universe.name)}</div>
      <div class="tooltip-sub">${escapeHtml(universe.subtitle || '')}</div>
      <div class="tooltip-footer">${universe.nodeCount || 0} 颗星 · ${universe.linkCount || 0} 条星轨 · 点击跃迁前往</div>
    `;
    tooltipEl.classList.remove('hidden');
    positionTooltip(screenPos);
  }

  function updateTonightBadge() {
    const pill = document.getElementById('btn-tonight-review');
    const textEl = document.getElementById('tonight-review-text');
    if (!pill || !textEl) return;
    const stats = getTonightToLightUp(getActiveUniverseId(), getGraphData().nodes);
    textEl.textContent = stats.totalCount > 0 ? `今晚待点亮 ${stats.totalCount} 颗` : '今晚已全部点亮 ✓';
    pill.classList.toggle('has-due', stats.dueCount > 0);
    pill.classList.toggle('all-done', stats.totalCount === 0);
  }

  function renderMasteryBar(node) {
    const barEl = document.getElementById('drawer-mastery-bar');
    if (!barEl || !node) return;
    const universeId = getActiveUniverseId();
    const state = getNodeLearningState(universeId, node.id);
    const mastery = state.mastery || 'unlearned';
    const isDue = isNodeDueForReview(universeId, node.id);

    const pills = [
      { key: 'unlearned', label: '○ 未学' },
      { key: 'learning', label: '◐ 学习中' },
      { key: 'mastered', label: '✦ 已掌握' },
    ];

    let reviewChipHtml = '';
    if (mastery === 'mastered') {
      const daysLeft = state.nextReviewAt
        ? Math.max(0, Math.ceil((state.nextReviewAt - Date.now()) / (24 * 60 * 60 * 1000)))
        : state.intervalDays || 1;
      const dueLabel = isDue ? '⏰ 今日待复习' : `间隔 ${state.intervalDays || 1}天 · ${daysLeft}天后复习`;
      reviewChipHtml = `
        <div class="mastery-review-row">
          <span class="review-status${isDue ? ' is-due' : ''}">${dueLabel}</span>
          <button type="button" class="review-advance-btn" id="btn-advance-review">✓ 完成复习</button>
        </div>
      `;
    }

    barEl.innerHTML = `
      <div class="mastery-pills" role="group" aria-label="掌握度">
        ${pills
          .map(
            (p) =>
              `<button type="button" class="mastery-pill${mastery === p.key ? ` active mastery-${p.key}` : ''}" data-mastery="${p.key}">${p.label}</button>`
          )
          .join('')}
      </div>
      ${reviewChipHtml}
    `;

    barEl.querySelectorAll('.mastery-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        setNodeMastery(universeId, node.id, btn.dataset.mastery);
        renderMasteryBar(node);
        updateTonightBadge();
        onLearningStateChanged?.();
        if (activeTraceSummary) renderTracePanel(activeTraceSummary);
      });
    });

    const advBtn = barEl.querySelector('#btn-advance-review');
    if (advBtn) {
      advBtn.addEventListener('click', () => {
        advanceNodeReview(universeId, node.id);
        renderMasteryBar(node);
        updateTonightBadge();
        onLearningStateChanged?.();
      });
    }
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

    // Source Provenance & Original Document Viewer
    const src = node.source;
    if (src && src.file) {
      provenancePath.textContent = src.file;
      provenancePill.classList.remove('hidden');

      sourceFilePathEl.textContent = src.file;
      if (src.section) {
        sourceSectionTagEl.textContent = src.section;
        sourceSectionTagEl.classList.remove('hidden');
      } else {
        sourceSectionTagEl.classList.add('hidden');
      }

      if (src.excerpt) {
        sourceExcerptText.textContent = src.excerpt;
        sourceExcerptBlock.classList.remove('hidden');
      } else {
        sourceExcerptBlock.classList.add('hidden');
      }

      if (src.url) {
        sourceFullBlock.classList.remove('hidden');
        if (sourceTextCache.has(src.url)) {
          sourceMarkdownBody.innerHTML = renderSimpleMarkdown(sourceTextCache.get(src.url));
        } else {
          sourceMarkdownBody.innerHTML = '<p style="color:var(--text-muted)">正在加载完整原文...</p>';
          const targetNodeId = node.id;
          fetch(src.url)
            .then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status))))
            .then((text) => {
              sourceTextCache.set(src.url, text);
              if (drawerEl.dataset.activeNodeId === targetNodeId) {
                sourceMarkdownBody.innerHTML = renderSimpleMarkdown(text);
              }
            })
            .catch(() => {
              if (drawerEl.dataset.activeNodeId === targetNodeId) {
                sourceMarkdownBody.innerHTML = '<p style="color:var(--text-muted)">未能加载完整原文文件（请通过上方路径查看本地原件）。</p>';
              }
            });
        }
      } else {
        sourceFullBlock.classList.add('hidden');
      }
    } else {
      provenancePill.classList.add('hidden');
      sourceFilePathEl.textContent = '当前节点暂未绑定原始出处（可在 universe.json 中补充 source 字段）';
      sourceSectionTagEl.classList.add('hidden');
      sourceExcerptBlock.classList.add('hidden');
      sourceFullBlock.classList.add('hidden');
    }

    drawerEl.dataset.activeNodeId = node.id;
    renderMasteryBar(node);
    setDrawerTab('graph');
    drawerEl.classList.remove('hidden');
  }

  function renderUniverseSwitcher() {
    const activeId = getActiveUniverseId();
    universeSwitcherEl.innerHTML = '';

    getAllUniverses().forEach((u) => {
      const data = u.id === activeId ? getGraphData() : loadUniverseGraph(u.id);
      const primaryColor = getUniversePrimaryColor(u);
      const btn = document.createElement('button');
      btn.className = `universe-item${u.id === activeId ? ' active' : ''}`;
      btn.dataset.universe = u.id;
      btn.style.setProperty('--universe-color', primaryColor);
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

  function renderTracePanel(traceSummary) {
    activeTraceSummary = traceSummary;
    if (btnTraceUpstream) {
      btnTraceUpstream.classList.toggle(
        'active',
        Boolean(traceSummary && traceSummary.mode === 'upstream' && traceSummary.rootNode?.id === drawerEl.dataset.activeNodeId)
      );
    }
    if (btnTraceDownstream) {
      btnTraceDownstream.classList.toggle(
        'active',
        Boolean(traceSummary && traceSummary.mode === 'downstream' && traceSummary.rootNode?.id === drawerEl.dataset.activeNodeId)
      );
    }

    if (!traceSummary) {
      traceBannerEl?.classList.add('hidden');
      tracePanelEl?.classList.add('hidden');
      if (tracePanelEl) tracePanelEl.innerHTML = '';
      return;
    }

    const modeLabel = traceSummary.mode === 'upstream' ? '🔙 前置追溯' : '🔜 后续推导';
    if (traceBannerEl && traceBannerTextEl) {
      traceBannerTextEl.textContent = `${modeLabel} · ${traceSummary.rootNode?.name || ''}（${traceSummary.topoOrder.length} 步）`;
      traceBannerEl.classList.remove('hidden');
    }

    if (!tracePanelEl) return;
    const activeUniId = getActiveUniverseId();
    const listTitle = traceSummary.mode === 'upstream' ? '建议学习顺序（由浅入深）' : '后续推导链路（按拓扑层级）';

    const items = traceSummary.topoOrder.map((entry, idx) => ({
      ...entry,
      stepNum: idx + 1,
      mastered: !entry.isRoot && getNodeMastery(activeUniId, entry.node.id) === 'mastered',
    }));

    const masteredItems = items.filter((it) => it.mastered);
    const activeItems = items.filter((it) => !it.mastered);

    tracePanelEl.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'trace-panel-header';
    header.innerHTML = `
      <span class="trace-panel-title">${listTitle}</span>
      <span class="trace-panel-count">${items.length} 站</span>
    `;
    tracePanelEl.appendChild(header);

    if (items.length <= 1) {
      const emptyNote = document.createElement('div');
      emptyNote.className = 'trace-empty-note';
      emptyNote.textContent =
        traceSummary.mode === 'upstream'
          ? '该知识点已是当前星图的基础起点，暂无更前置依赖。'
          : '该知识点暂无更下游的后续延伸节点。';
      tracePanelEl.appendChild(emptyNote);
      tracePanelEl.classList.remove('hidden');
      return;
    }

    const renderStepItem = (it) => {
      const cat = getCategory(it.node.category);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `trace-step-item${it.node.id === traceSummary.focusedId ? ' active-step' : ''}${it.isRoot ? ' root-step' : ''}${it.mastered ? ' mastered-step' : ''}`;
      const relHint = it.relations?.[0]
        ? traceSummary.mode === 'upstream'
          ? `→ ${it.relations[0].targetName}（${it.relations[0].relation}）`
          : `← ${it.relations[0].sourceName}（${it.relations[0].relation}）`
        : it.isRoot
          ? '当前目标知识点'
          : '';
      btn.innerHTML = `
        <span class="trace-layer-badge">L${it.layer}</span>
        <span class="cluster-dot" style="--chip-color: ${escapeHtml(cat.color)}"></span>
        <span class="trace-step-body">
          <span class="trace-step-name">${escapeHtml(it.node.name)}${it.mastered ? ' ✓' : ''}</span>
          ${relHint ? `<span class="trace-step-rel">${escapeHtml(relHint)}</span>` : ''}
        </span>
      `;
      btn.addEventListener('click', () => onFlyToTraceNode?.(it.node.id));
      return btn;
    };

    if (masteredItems.length > 0) {
      const collapseBar = document.createElement('button');
      collapseBar.type = 'button';
      collapseBar.className = 'trace-mastered-toggle';
      collapseBar.textContent = showCollapsedMastered
        ? `▾ 收起已掌握前置 (${masteredItems.length})`
        : `▸ 已自动折叠 ${masteredItems.length} 个已掌握节点（点击展开）`;
      collapseBar.addEventListener('click', () => {
        showCollapsedMastered = !showCollapsedMastered;
        renderTracePanel(activeTraceSummary);
      });
      tracePanelEl.appendChild(collapseBar);

      if (showCollapsedMastered) {
        const mWrap = document.createElement('div');
        mWrap.className = 'trace-step-list mastered-list';
        masteredItems.forEach((it) => mWrap.appendChild(renderStepItem(it)));
        tracePanelEl.appendChild(mWrap);
      }
    }

    const listEl = document.createElement('div');
    listEl.className = 'trace-step-list';
    activeItems.forEach((it) => listEl.appendChild(renderStepItem(it)));
    tracePanelEl.appendChild(listEl);
    tracePanelEl.classList.remove('hidden');
  }

  universeSwitcherEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.universe-item');
    if (!btn) return;
    onSwitchUniverse(btn.dataset.universe);
  });

  universeSwitcherEl.addEventListener('pointerover', (e) => {
    const btn = e.target.closest('.universe-item');
    onHoverSidebarUniverse?.(btn ? btn.dataset.universe : null);
  });

  universeSwitcherEl.addEventListener('pointerleave', () => {
    onHoverSidebarUniverse?.(null);
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
    updateTonightBadge,
    showNodeTooltip,
    showEdgeTooltip,
    showWormholeTooltip,
    showGalaxyTooltip,
    hideTooltip,
    openInspectorDrawer,
    renderUniverseSwitcher,
    renderClusterFilters,
    setSubtitle,
    renderTracePanel,
  };
}
