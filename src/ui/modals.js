import { renderFormula } from './formula.js';
import {
  applyGraphPatch,
  registerCustomUniverse,
  saveUniverseGraph,
} from '../state/universeStore.js';

const SAMPLE_PATCH_JSON = {
  mode: 'patch',
  universeId: 'starter',
  nodes: [
    {
      id: 'concept_demo',
      name: '示例知识点',
      en: 'Example Concept',
      category: 'core',
      formula: String.raw`y = f(x) + \epsilon`,
      summary: '这是一个通过「✨ 审核导入」合入的新知识点示例，支持 LaTeX 公式与有向星轨关联。',
      points: [
        '你可以在审核弹窗中勾选或取消任意节点与有向连线。',
        '合入后会自动保存至本地并聚焦到新星。',
      ],
    },
  ],
  links: [
    {
      source: 'welcome_star',
      target: 'concept_demo',
      relation: '示例延伸',
      description: '从初始星核出发，延伸出第一个自定义知识点节点。',
    },
  ],
  wormholes: [],
};

export function createModals({
  getActiveUniverseId,
  getCurrentUniverse,
  getGraphData,
  onGraphMutated,
  onUniverseCreated,
}) {
  const modalOverlay = document.getElementById('modal-overlay');
  const modalBoxEl = modalOverlay.querySelector('.modal');
  const modalTitle = document.getElementById('modal-title');
  const modalForm = document.getElementById('modal-form');
  const btnCloseModal = document.getElementById('btn-close-modal');

  function closeModal() {
    modalBoxEl.classList.remove('wide');
    modalOverlay.classList.add('hidden');
  }

  btnCloseModal.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  function openAddNodeModal() {
    const u = getCurrentUniverse();
    const graphData = getGraphData();
    modalTitle.textContent = `✦ 在「${u.shortName}」点亮新星`;

    const catOptions = Object.values(u.categories)
      .map((c) => `<option value="${c.id}">${c.name} (${c.en})</option>`)
      .join('');
    const nodeOptions = graphData.nodes
      .map((n) => `<option value="${n.id}">${n.name}</option>`)
      .join('');

    modalForm.innerHTML = `
      <div class="form-field">
        <label>知识点名称 *</label>
        <input name="name" required placeholder="例如：非负矩阵分解 (NMF)" />
      </div>
      <div class="form-field">
        <label>英文名称</label>
        <input name="en" placeholder="例如：Non-negative Matrix Factorization" />
      </div>
      <div class="form-field">
        <label>所属星域 (分类)</label>
        <select name="category">${catOptions}</select>
      </div>
      <div class="form-field">
        <label>核心公式 LaTeX (可选)</label>
        <input name="formula" placeholder="例如：V \\approx W H \\quad (W, H \\ge 0)" />
      </div>
      <div class="form-field">
        <label>核心简介 *</label>
        <textarea name="summary" rows="2" required placeholder="简述该知识点的核心思想与作用..."></textarea>
      </div>
      <div class="form-field">
        <label>关联到已有星星 (可选)</label>
        <select name="connectTo">
          <option value="">暂不串联</option>
          ${nodeOptions}
        </select>
      </div>
      <div class="form-field">
        <label>星轨关系说明 (若选择关联)</label>
        <input name="relation" placeholder="例如：非负约束对比 / 降维分支" />
      </div>
      <div class="modal-actions">
        <button type="button" class="hud-btn" id="modal-cancel">取消</button>
        <button type="submit" class="btn-submit">点亮星辰</button>
      </div>
    `;

    modalForm.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modalForm.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(modalForm);
      const id = 'star_' + Date.now().toString(36);
      const newNode = {
        id,
        name: fd.get('name').trim(),
        en: fd.get('en').trim() || 'Custom Concept',
        category: fd.get('category'),
        formula: fd.get('formula').trim(),
        summary: fd.get('summary').trim(),
        points: [fd.get('summary').trim()],
      };
      graphData.nodes.push(newNode);

      const connectTo = fd.get('connectTo');
      if (connectTo) {
        graphData.links.push({
          source: connectTo,
          target: id,
          relation: fd.get('relation').trim() || '知识关联',
          description: `由该知识点延伸或关联至 ${newNode.name}。`,
        });
      }

      saveUniverseGraph(getActiveUniverseId(), graphData);
      closeModal();
      onGraphMutated(id);
    };

    modalOverlay.classList.remove('hidden');
  }

  function openAddLinkModal() {
    const u = getCurrentUniverse();
    const graphData = getGraphData();
    modalTitle.textContent = `☍ 在「${u.shortName}」串联有向星轨`;
    const nodeOptions = graphData.nodes
      .map((n) => `<option value="${n.id}">${n.name}</option>`)
      .join('');

    modalForm.innerHTML = `
      <div class="form-field">
        <label>起点星星 (Source)</label>
        <select name="source">${nodeOptions}</select>
      </div>
      <div class="form-field">
        <label>终点星星 (Target →)</label>
        <select name="target">${nodeOptions}</select>
      </div>
      <div class="form-field">
        <label>关系标签 *</label>
        <input name="relation" required placeholder="例如：等价推导 / 数值加速 / 机制实现" />
      </div>
      <div class="form-field">
        <label>关系详细解释 *</label>
        <textarea name="description" rows="3" required placeholder="描述起点知识点如何推导出、作用于或演进到终点知识点..."></textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="hud-btn" id="modal-cancel">取消</button>
        <button type="submit" class="btn-submit">建立有向星轨</button>
      </div>
    `;

    const targetSelect = modalForm.querySelector('select[name="target"]');
    if (targetSelect.options.length > 1) targetSelect.selectedIndex = 1;

    modalForm.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modalForm.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(modalForm);
      const source = fd.get('source');
      const target = fd.get('target');
      if (source === target) {
        alert('请选择两颗不同的星星进行串联。');
        return;
      }

      graphData.links.push({
        source,
        target,
        relation: fd.get('relation').trim(),
        description: fd.get('description').trim(),
      });

      saveUniverseGraph(getActiveUniverseId(), graphData);
      closeModal();
      onGraphMutated(null);
    };

    modalOverlay.classList.remove('hidden');
  }

  function renderPatchReview(patch) {
    const u = getCurrentUniverse();
    const graphData = getGraphData();
    const nodes = patch.nodes || [];
    const links = patch.links || [];
    const wormholes = patch.wormholes || [];

    const nodesHtml = nodes
      .map(
        (n, i) => `
      <label class="review-item">
        <input type="checkbox" name="rev-node" value="${i}" checked />
        <div class="review-item-body">
          <div class="review-item-title">${n.name} <span style="color:#64748b;font-weight:400;">(${n.en || ''})</span></div>
          ${n.formula ? `<div class="tooltip-formula" style="margin:2px 0;">${renderFormula(n.formula, false)}</div>` : ''}
          <div class="review-item-desc">${n.summary}</div>
        </div>
      </label>
    `
      )
      .join('');

    const linksHtml = links
      .map(
        (l, i) => `
      <label class="review-item">
        <input type="checkbox" name="rev-link" value="${i}" checked />
        <div class="review-item-body">
          <div class="review-item-title">${l.source} → ${l.target} <span class="link-card-rel">${l.relation}</span></div>
          <div class="review-item-desc">${l.description}</div>
        </div>
      </label>
    `
      )
      .join('');

    const whHtml = wormholes
      .map(
        (w, i) => `
      <label class="review-item">
        <input type="checkbox" name="rev-wh" value="${i}" checked />
        <div class="review-item-body">
          <div class="review-item-title">🌀 ${w.anchorNodeId} ⟶ ${w.targetUniverseId} (${w.targetNodeId})</div>
          <div class="review-item-desc">${w.description}</div>
        </div>
      </label>
    `
      )
      .join('');

    modalTitle.textContent = `🔍 审核待合入知识点 · 目标宇宙「${u.shortName}」`;
    modalForm.innerHTML = `
      ${nodes.length ? `<div class="review-section-title">新增知识点星星 (${nodes.length})</div><div class="review-list">${nodesHtml}</div>` : ''}
      ${links.length ? `<div class="review-section-title">新增有向星轨 (${links.length})</div><div class="review-list">${linksHtml}</div>` : ''}
      ${wormholes.length ? `<div class="review-section-title">新增跨宇宙虫洞 (${wormholes.length})</div><div class="review-list">${whHtml}</div>` : ''}
      <div class="modal-actions">
        <button type="button" class="hud-btn" id="modal-cancel">取消</button>
        <button type="button" class="btn-submit" id="btn-confirm-patch">✓ 确认并合入有向星图</button>
      </div>
    `;

    modalForm.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modalForm.querySelector('#btn-confirm-patch').addEventListener('click', () => {
      const approvedNodes = [...modalForm.querySelectorAll('input[name="rev-node"]:checked')].map(
        (cb) => nodes[Number(cb.value)]
      );
      const approvedLinks = [...modalForm.querySelectorAll('input[name="rev-link"]:checked')].map(
        (cb) => links[Number(cb.value)]
      );
      const approvedWh = [...modalForm.querySelectorAll('input[name="rev-wh"]:checked')].map(
        (cb) => wormholes[Number(cb.value)]
      );

      const firstAddedId = applyGraphPatch(graphData, {
        nodes: approvedNodes,
        links: approvedLinks,
        wormholes: approvedWh,
      });

      saveUniverseGraph(getActiveUniverseId(), graphData);
      closeModal();
      onGraphMutated(firstAddedId);
    });
  }

  function renderUniverseReview(u) {
    const nodes = u.nodes || [];
    const links = u.links || [];
    const tour = u.tour || [];

    modalTitle.textContent = `🌌 审核新平行宇宙：${u.name || u.shortName}`;
    modalForm.innerHTML = `
      <div class="review-item" style="cursor:default;">
        <div class="review-item-body">
          <div class="review-item-title">${u.icon || '✦'} ${u.name}</div>
          <div class="review-item-desc">${u.subtitle || ''}</div>
          <div class="review-item-desc" style="color:#7dd3fc;margin-top:4px;">
            包含 ${nodes.length} 颗知识星 · ${links.length} 条有向星轨 · ${(u.wormholes || []).length} 个虫洞 · ${tour.length || Math.min(nodes.length, 10)} 步导览路线
          </div>
        </div>
      </div>
      <div class="review-section-title">知识星预览</div>
      <div class="review-list">
        ${nodes
          .map(
            (n) => `
          <div class="review-item" style="cursor:default;">
            <div class="review-item-body">
              <div class="review-item-title">${n.name}</div>
              ${n.formula ? `<div class="tooltip-formula" style="margin:2px 0;">${renderFormula(n.formula, false)}</div>` : ''}
              <div class="review-item-desc">${n.summary}</div>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
      <div class="modal-actions">
        <button type="button" class="hud-btn" id="modal-cancel">取消</button>
        <button type="button" class="btn-submit" id="btn-confirm-universe">🚀 创建宇宙并开始「带我看」</button>
      </div>
    `;

    modalForm.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modalForm.querySelector('#btn-confirm-universe').addEventListener('click', () => {
      registerCustomUniverse(u);
      closeModal();
      onUniverseCreated(u);
    });
  }

  function openAiImportModal() {
    modalBoxEl.classList.add('wide');
    modalTitle.textContent = '✨ AI 笔记整理 / 文献星图 · 审核导入';

    modalForm.innerHTML = `
      <div class="form-field">
        <label>粘贴 AI 按 <code>starlink-constellation</code> Skill 生成的 JSON（支持「笔记增量补丁」或「整篇 PPT/PDF/论文新宇宙」）</label>
        <textarea id="ai-json-input" rows="7" placeholder='{"mode": "patch" | "universe", ...}'></textarea>
      </div>
      <div class="modal-actions" style="justify-content: space-between;">
        <button type="button" class="hud-btn" id="btn-load-sample">加载示例笔记补丁</button>
        <div style="display:flex; gap:8px;">
          <button type="button" class="hud-btn" id="modal-cancel">取消</button>
          <button type="button" class="btn-submit" id="btn-parse-review">解析并进入审核 →</button>
        </div>
      </div>
    `;

    modalForm.querySelector('#modal-cancel').addEventListener('click', closeModal);
    modalForm.querySelector('#btn-load-sample').addEventListener('click', () => {
      modalForm.querySelector('#ai-json-input').value = JSON.stringify(SAMPLE_PATCH_JSON, null, 2);
    });

    modalForm.querySelector('#btn-parse-review').addEventListener('click', () => {
      const rawText = modalForm.querySelector('#ai-json-input').value.trim();
      if (!rawText) return;

      let payload;
      try {
        payload = JSON.parse(rawText);
      } catch (err) {
        alert('JSON 格式有误，请检查括号与转义字符：' + err.message);
        return;
      }

      if (payload.mode === 'universe' && payload.universe) {
        renderUniverseReview(payload.universe);
      } else if (Array.isArray(payload.nodes) || Array.isArray(payload.links)) {
        renderPatchReview(payload);
      } else {
        alert('未识别的 STARLINK 数据格式，请确保包含 mode: "patch" 或 mode: "universe"。');
      }
    });

    modalOverlay.classList.remove('hidden');
  }

  return {
    openAddNodeModal,
    openAddLinkModal,
    openAiImportModal,
  };
}
