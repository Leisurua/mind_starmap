import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CATEGORIES } from './data/knowledgeGraph.js';

export const RELATION_STYLES = {
  derive: { key: 'derive', label: '推导 / 导出', lineStyle: 'solid', color: '#38bdf8' },
  prereq: { key: 'prereq', label: '前置 / 依赖', lineStyle: 'dashed', color: '#a78bfa' },
  variant: { key: 'variant', label: '特例 / 推广', lineStyle: 'double', color: '#34d399' },
  compare: { key: 'compare', label: '对比 / 类比', lineStyle: 'dotted', color: '#fbbf24' },
  default: { key: 'default', label: '默认关联', lineStyle: 'solid', color: '#94a3b8' },
};

const RELATION_PATTERNS = [
  { key: 'derive', re: /推导|导出|得出|证明|推出|演进|落地|升级|derive|deriv|lead|prove|deduce/i },
  { key: 'prereq', re: /前置|依赖|基石|基础|基座|支撑|需要|保护|prereq|depend|require|found/i },
  { key: 'variant', re: /特例|推广|扩展|延伸|拓展|泛化|特殊|general|special|exten|variant/i },
  { key: 'compare', re: /对比|类比|对照|区别|相似|比较|替代|compar|analog|contrast|versus|vs/i },
];

export function classifyRelation(relation = '') {
  const text = String(relation || '');
  for (const { key, re } of RELATION_PATTERNS) {
    if (re.test(text)) return RELATION_STYLES[key];
  }
  return RELATION_STYLES.default;
}

const PARTICLES_PER_EDGE = 3;
const WHITE_COLOR = new THREE.Color('#ffffff');
const TRACE_PULSE_COLOR = new THREE.Color('#e0f2fe');
const _tmpMatrix = new THREE.Matrix4();
const _tmpPos = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _tmpScale = new THREE.Vector3();
const _tmpColor = new THREE.Color();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _projVec = new THREE.Vector3();

// Solve cubic-bezier(0.22, 1, 0.36, 1) for camera flights
function cubicBezierOut(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const cx = 3 * 0.22;
  const bx = 3 * (0.36 - 0.22) - cx;
  const ax = 1 - cx - bx;
  let u = t;
  for (let i = 0; i < 4; i++) {
    const x = ((ax * u + bx) * u + cx) * u - t;
    const dx = (3 * ax * u + 2 * bx) * u + cx;
    if (Math.abs(dx) < 1e-5) break;
    u -= x / dx;
  }
  u = Math.max(0, Math.min(1, u));
  const cy = 3 * 1.0;
  const by = 3 * (1.0 - 1.0) - cy;
  const ay = 1 - cy - by;
  return ((ay * u + by) * u + cy) * u;
}

function buildStarLabelContent(el, name) {
  const str = String(name || '');
  const re = /(\(Ch\.[^)]+\)|Ch\.\d+(?:-\d+)?)/gi;
  let last = 0;
  let match;
  while ((match = re.exec(str)) !== null) {
    if (match.index > last) {
      el.appendChild(document.createTextNode(str.slice(last, match.index)));
    }
    const chSpan = document.createElement('span');
    chSpan.className = 'star-label-ch';
    chSpan.textContent = match[0];
    el.appendChild(chSpan);
    last = re.lastIndex;
  }
  if (last < str.length) {
    el.appendChild(document.createTextNode(str.slice(last)));
  }
}

function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.9)');
  grad.addColorStop(0.16, 'rgba(255, 255, 255, 0.48)');
  grad.addColorStop(0.42, 'rgba(255, 255, 255, 0.14)');
  grad.addColorStop(0.75, 'rgba(255, 255, 255, 0.03)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createNebulaTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const half = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - half) / half;
      const ny = (y - half) / half;
      const r = Math.hypot(nx, ny);
      if (r >= 1.0) continue;

      const angle = Math.atan2(ny, nx);
      const swirl =
        0.52 +
        0.24 * Math.sin(nx * 4.2 + ny * 3.1) +
        0.15 * Math.cos(angle * 3.0 + r * 5.0) +
        0.12 * Math.sin(nx * 8.5 - ny * 7.2);
      const falloff = Math.pow(1 - r, 2.2);
      const alpha = Math.max(0, Math.min(1, falloff * swirl));
      const idx = (y * size + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createStarflareTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;

  // Soft core
  const core = ctx.createRadialGradient(half, half, 0, half, half, half * 0.48);
  core.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  core.addColorStop(0.3, 'rgba(255, 255, 255, 0.45)');
  core.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);

  // Horizontal & vertical diffraction spikes
  const hGrad = ctx.createLinearGradient(0, half, size, half);
  hGrad.addColorStop(0, 'rgba(255,255,255,0)');
  hGrad.addColorStop(0.5, 'rgba(255,255,255,0.95)');
  hGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hGrad;
  ctx.fillRect(4, half - 1.5, size - 8, 3);

  const vGrad = ctx.createLinearGradient(half, 0, half, size);
  vGrad.addColorStop(0, 'rgba(255,255,255,0)');
  vGrad.addColorStop(0.5, 'rgba(255,255,255,0.95)');
  vGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = vGrad;
  ctx.fillRect(half - 1.5, 4, 3, size - 8);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

const CLUSTER_ANCHORS = {
  matrix: new THREE.Vector3(-38, 22, -16),
  decomp: new THREE.Vector3(16, 30, -6),
  cluster: new THREE.Vector3(-32, -22, 22),
  discriminant: new THREE.Vector3(24, -26, -18),
  optim: new THREE.Vector3(-6, 4, -34),
  ml: new THREE.Vector3(40, -6, 18),
  dl: new THREE.Vector3(34, 24, 30),
};

export class StarMapScene {
  constructor(
    container,
    {
      onHoverNode,
      onHoverEdge,
      onHoverWormhole,
      onHoverGalaxy,
      onHoverClear,
      onSelectNode,
      onClickWormhole,
      onClickGalaxy,
      onTraceChange,
      getNodeLearningInfo,
    }
  ) {
    this.container = container;
    this.callbacks = {
      onHoverNode,
      onHoverEdge,
      onHoverWormhole,
      onHoverGalaxy,
      onHoverClear,
      onSelectNode,
      onClickWormhole,
      onClickGalaxy,
      onTraceChange,
      getNodeLearningInfo,
    };

    this.nodes = [];
    this.edges = [];
    this.wormholes = [];
    this.nebulae = [];
    this.distantGalaxies = [];
    this.distantGalaxyMap = new Map();
    this.nodeMap = new Map();

    this.physicsEnabled = false;
    this.autoOrbit = false;
    this.showLabels = true;
    this.activeCategory = 'all';
    this.searchQuery = '';

    this.hoveredNode = null;
    this.hoveredEdge = null;
    this.hoveredWormhole = null;
    this.hoveredGalaxy = null;
    this.highlightedGalaxyId = null;
    this.selectedNode = null;
    this.traceState = this._emptyTraceState();
    this.tourHighlight = null;

    this.cameraFlyAnim = null;
    this.warpAnim = null;
    this.reducedMotion =
      typeof window !== 'undefined' &&
      Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    this._labelFrameCounter = 0;

    this.pointer = new THREE.Vector2(-999, -999);
    this.pointerScreen = { x: 0, y: 0 };
    this.isPointerDown = false;
    this.pointerDownPos = { x: 0, y: 0 };

    this.glowTexture = createGlowTexture();
    this.nebulaTexture = createNebulaTexture();
    this.starflareTexture = createStarflareTexture();
    this.clock = new THREE.Clock();

    const lowCores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2;
    this.bloomEnabled = !lowCores;
    this._lowFpsFrames = 0;
    this._lastFrameTime = performance.now();

    this._initScene();
    this._initBackgroundCosmos();
    this._bindEvents();
    this._animate();
  }

  _emptyTraceState() {
    return {
      active: false,
      mode: null,
      rootId: null,
      focusedId: null,
      nodeIds: new Set(),
      edgeSet: new Set(),
      layerMap: new Map(),
      maxLayer: 0,
      topoOrder: [],
    };
  }

  _initScene() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x04060f, 0.0018);

    this.camera = new THREE.PerspectiveCamera(52, width / height, 0.5, 1500);
    this.camera.position.set(0, 20, 112);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.container.appendChild(this.renderer.domElement);

    // CSS2D Renderer for crisp star names
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(width, height);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.left = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.container.appendChild(this.labelRenderer.domElement);

    // Post-processing UnrealBloom: high threshold so only mastered stars, flares & particles glow
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.68, 0.45, 0.68);
    this.composer.addPass(this.bloomPass);

    // OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.rotateSpeed = 0.65;
    this.controls.zoomSpeed = 0.9;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 280;
    this.controls.autoRotate = this.autoOrbit;
    this.controls.autoRotateSpeed = 0.42;

    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Line.threshold = 1.9;
    this.needsRaycast = false;
    this.pointerInside = false;
    this.pointerMoved = false;
    this._rafId = null;

    this._onCameraChange = () => {
      this.needsRaycast = true;
    };
    this.controls.addEventListener('change', this._onCameraChange);

    this.distantGalaxyGroup = new THREE.Group();
    this.scene.add(this.distantGalaxyGroup);

    this.nebulaeGroup = new THREE.Group();
    this.scene.add(this.nebulaeGroup);

    this.graphGroup = new THREE.Group();
    this.scene.add(this.graphGroup);

    this.tourGroup = new THREE.Group();
    this.scene.add(this.tourGroup);

    this.nodeHitMeshes = [];
    this.edgeLines = [];
    this.wormholeHitMeshes = [];
    this.distantGalaxyHitMeshes = [];
    this.edgeParticlesMesh = null;
    this.hoverEdgeBeam = null;
    this.tourStopBadges = new Map();
  }

  _disposeObjectGroup(group) {
    const geometries = new Set();
    const materials = new Set();
    group.traverse((obj) => {
      if (obj.isCSS2DObject && obj.element) {
        obj.element.remove();
      }
      if (obj.geometry) geometries.add(obj.geometry);
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => materials.add(m));
        } else {
          materials.add(obj.material);
        }
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }
  }

  _disposeGraphObjects() {
    this._disposeObjectGroup(this.graphGroup);
    this._disposeObjectGroup(this.nebulaeGroup);
    this._disposeObjectGroup(this.tourGroup);
    this.nebulae = [];
    this.tourStopBadges.clear();
    this.edgeParticlesMesh = null;
    this.hoverEdgeBeam = null;
  }

  _initBackgroundCosmos() {
    // 3-layer parallax starfield + slow twinkling stars + sparse foreground floating dust
    this.bgStarLayers = [];
    const palette = [
      new THREE.Color('#cbd5e1'),
      new THREE.Color('#93c5fd'),
      new THREE.Color('#fde68a'),
      new THREE.Color('#c4b5fd'),
    ];

    const layerConfigs = [
      { count: 1100, rMin: 260, rMax: 470, size: 0.85, opacity: 0.56, rotSpeed: 0.00009, twinkle: false },
      { count: 650, rMin: 150, rMax: 265, size: 1.15, opacity: 0.72, rotSpeed: 0.00021, twinkle: false },
      { count: 240, rMin: 85, rMax: 155, size: 1.65, opacity: 0.88, rotSpeed: 0.00036, twinkle: true },
    ];

    layerConfigs.forEach((cfg) => {
      const positions = new Float32Array(cfg.count * 3);
      const colors = new Float32Array(cfg.count * 3);
      const baseColors = cfg.twinkle ? new Float32Array(cfg.count * 3) : null;
      const phases = cfg.twinkle ? new Float32Array(cfg.count) : null;

      for (let i = 0; i < cfg.count; i++) {
        const r = cfg.rMin + Math.random() * (cfg.rMax - cfg.rMin);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);

        const c = palette[Math.floor(Math.random() * palette.length)];
        const dim = 0.35 + Math.random() * 0.65;
        const cr = c.r * dim;
        const cg = c.g * dim;
        const cb = c.b * dim;
        colors[i * 3] = cr;
        colors[i * 3 + 1] = cg;
        colors[i * 3 + 2] = cb;
        if (cfg.twinkle) {
          baseColors[i * 3] = cr;
          baseColors[i * 3 + 1] = cg;
          baseColors[i * 3 + 2] = cb;
          phases[i] = Math.random() * Math.PI * 2;
        }
      }

      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const colorAttr = new THREE.BufferAttribute(colors, 3);
      starGeo.setAttribute('color', colorAttr);

      const starMat = new THREE.PointsMaterial({
        map: this.glowTexture,
        size: cfg.size * 1.9,
        vertexColors: true,
        transparent: true,
        opacity: cfg.opacity,
        alphaTest: 0.01,
        depthWrite: false,
      });

      const points = new THREE.Points(starGeo, starMat);
      this.scene.add(points);
      this.bgStarLayers.push({
        points,
        rotSpeed: cfg.rotSpeed,
        twinkle: cfg.twinkle,
        colorAttr,
        baseColors,
        phases,
        count: cfg.count,
      });
    });

    // Sparse foreground floating dust motes for depth-of-field parallax
    const dustCount = 130;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 140;
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 90;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 130;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      map: this.glowTexture,
      color: new THREE.Color('#bae6fd'),
      size: 1.35,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.fgDust = new THREE.Points(dustGeo, dustMat);
    this.scene.add(this.fgDust);
  }

  _getLearningInfo(nodeId) {
    if (this.callbacks.getNodeLearningInfo) {
      return this.callbacks.getNodeLearningInfo(nodeId) || { mastery: 'unlearned', isDue: false };
    }
    return { mastery: 'unlearned', isDue: false };
  }

  setBloomEnabled(enabled) {
    this.bloomEnabled = Boolean(enabled);
  }

  isBloomEnabled() {
    return this.bloomEnabled;
  }

  setParallelUniverses(universesList = [], activeUniverseId = null) {
    this._disposeObjectGroup(this.distantGalaxyGroup);
    this.distantGalaxies = [];
    this.distantGalaxyMap.clear();
    this.distantGalaxyHitMeshes = [];

    const others = universesList.filter((u) => u && u.id !== activeUniverseId);
    if (others.length === 0) return;

    const paletteTex = this.glowTexture;
    others.forEach((u, idx) => {
      const color = new THREE.Color(u.primaryColor || '#38bdf8');
      const count = others.length;
      const spreadAngle = count === 1 ? -0.35 : -0.78 + (idx / Math.max(1, count - 1)) * 1.56;
      const elev = (idx % 2 === 0 ? 1 : -1) * (36 + (idx % 3) * 28);
      const dist = 340 + (idx % 3) * 32;
      const gx = Math.sin(spreadAngle) * dist;
      const gz = -Math.cos(spreadAngle) * dist;
      const gy = elev + 18;

      const galaxyGroup = new THREE.Group();
      galaxyGroup.position.set(gx, gy, gz);

      // 2-arm logarithmic spiral stars
      const starCount = 190;
      const pPos = new Float32Array(starCount * 3);
      const pCol = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        const arm = i % 2;
        const t = i / starCount;
        const r = 1.4 + t * 18.0;
        const theta = arm * Math.PI + t * Math.PI * 2.8 + (Math.random() - 0.5) * 0.55;
        const jitterY = (Math.random() - 0.5) * (1.8 * (1 - t * 0.6));
        pPos[i * 3] = Math.cos(theta) * r;
        pPos[i * 3 + 1] = jitterY;
        pPos[i * 3 + 2] = Math.sin(theta) * r;

        const c = color.clone().lerp(WHITE_COLOR, (1 - t) * 0.65);
        pCol[i * 3] = c.r;
        pCol[i * 3 + 1] = c.g;
        pCol[i * 3 + 2] = c.b;
      }

      const spiralGeo = new THREE.BufferGeometry();
      spiralGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
      spiralGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
      const spiralMat = new THREE.PointsMaterial({
        size: 1.55,
        vertexColors: true,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const spiralPoints = new THREE.Points(spiralGeo, spiralMat);
      spiralPoints.rotation.x = 0.52 + (idx % 3) * 0.18;
      spiralPoints.rotation.z = -0.25 + (idx % 2) * 0.45;
      galaxyGroup.add(spiralPoints);

      // Core glow sprite
      const coreSpriteMat = new THREE.SpriteMaterial({
        map: paletteTex,
        color: color.clone().lerp(WHITE_COLOR, 0.35),
        transparent: true,
        opacity: 0.68,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const coreSprite = new THREE.Sprite(coreSpriteMat);
      coreSprite.scale.set(24, 24, 1);
      galaxyGroup.add(coreSprite);

      // Highlight halo ring
      const ringGeo = new THREE.RingGeometry(15, 16.4, 40);
      const ringMat = new THREE.MeshBasicMaterial({
        color: color.clone().lerp(WHITE_COLOR, 0.45),
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      galaxyGroup.add(ringMesh);

      // Invisible hit sphere
      const hitGeo = new THREE.SphereGeometry(20, 12, 12);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      galaxyGroup.add(hitMesh);

      // Distant galaxy label
      const labelEl = document.createElement('div');
      labelEl.className = 'galaxy-label';
      labelEl.innerHTML = `<span class="galaxy-dot" style="background:${u.primaryColor || '#38bdf8'}"></span>${u.shortName || u.name}`;
      const labelObj = new CSS2DObject(labelEl);
      labelObj.position.set(0, -18, 0);
      galaxyGroup.add(labelObj);

      const galaxyObj = {
        universe: u,
        color,
        pos: new THREE.Vector3(gx, gy, gz),
        group: galaxyGroup,
        spiralPoints,
        spiralMat,
        coreSprite,
        coreSpriteMat,
        ringMesh,
        ringMat,
        hitMesh,
        labelEl,
        phase: idx * 1.4,
      };
      hitMesh.userData = { type: 'galaxy', galaxy: galaxyObj };
      this.distantGalaxyHitMeshes.push(hitMesh);
      this.distantGalaxyGroup.add(galaxyGroup);
      this.distantGalaxies.push(galaxyObj);
      this.distantGalaxyMap.set(u.id, galaxyObj);
    });

    // Refresh wormhole arcs if graph is already loaded
    if (this.wormholes.length > 0) {
      this._syncPositions();
    }
  }

  highlightDistantGalaxy(universeId = null) {
    this.highlightedGalaxyId = universeId;
    for (const g of this.distantGalaxies) {
      const hot = g.universe.id === universeId || this.hoveredGalaxy === g;
      g.labelEl.classList.toggle('highlighted', hot);
    }
  }

  setGraphData(rawNodes, rawLinks, categories = CATEGORIES, anchors = null, wormholes = []) {
    this.categories = categories || CATEGORIES;
    this.clusterAnchors = Object.create(null);
    if (anchors && Object.keys(anchors).length > 0) {
      const vecs = {};
      const centroid = new THREE.Vector3();
      const entries = Object.entries(anchors);
      for (const [k, arr] of entries) {
        const v = new THREE.Vector3(arr[0], arr[1], arr[2]);
        vecs[k] = v;
        centroid.add(v);
      }
      centroid.divideScalar(entries.length);
      for (const [k, v] of Object.entries(vecs)) {
        this.clusterAnchors[k] = v.clone().sub(centroid).multiplyScalar(1.45).add(centroid);
      }
    } else {
      Object.assign(this.clusterAnchors, CLUSTER_ANCHORS);
    }

    // Preserve existing positions if updating
    const prevPositions = new Map();
    for (const n of this.nodes) {
      prevPositions.set(n.id, n.pos.clone());
    }

    // Dispose and clear previous 3D objects to prevent GPU memory leaks
    this._disposeGraphObjects();

    this.nodes = [];
    this.edges = [];
    this.wormholes = [];
    this.nodeMap.clear();
    this.nodeHitMeshes = [];
    this.edgeLines = [];
    this.wormholeHitMeshes = [];

    // Count total degrees & in-degrees for star sizing and hub identification
    const degreeMap = new Map();
    const inDegreeMap = new Map();
    rawNodes.forEach((n) => {
      degreeMap.set(n.id, 0);
      inDegreeMap.set(n.id, 0);
    });
    rawLinks.forEach((l) => {
      degreeMap.set(l.source, (degreeMap.get(l.source) || 0) + 1);
      degreeMap.set(l.target, (degreeMap.get(l.target) || 0) + 1);
      inDegreeMap.set(l.target, (inDegreeMap.get(l.target) || 0) + 1);
    });

    const sortedByInDeg = [...rawNodes]
      .filter((n) => (inDegreeMap.get(n.id) || 0) >= 2)
      .sort((a, b) => (inDegreeMap.get(b.id) || 0) - (inDegreeMap.get(a.id) || 0));
    const hubIds = new Set(sortedByInDeg.slice(0, 3).map((n) => n.id));

    const fallbackCat = Object.values(this.categories)[0] || { color: '#38bdf8' };

    // Build nodes
    rawNodes.forEach((raw, idx) => {
      const degree = degreeMap.get(raw.id) || 0;
      const cat = Object.hasOwn(this.categories, raw.category) ? this.categories[raw.category] : fallbackCat;
      const color = new THREE.Color(cat.color);
      const anchor = this.clusterAnchors[raw.category] || new THREE.Vector3();

      const pos = prevPositions.get(raw.id) || new THREE.Vector3(
        anchor.x + (Math.random() - 0.5) * 30,
        anchor.y + (Math.random() - 0.5) * 30,
        anchor.z + (Math.random() - 0.5) * 30
      );

      // Map sqrt(degree) to 0.40 - 1.40
      const degNorm = Math.min(Math.sqrt(degree) / Math.sqrt(10), 1);
      const radius = 0.4 + degNorm * 1.0;
      const isHub = hubIds.has(raw.id);

      const nodeGroup = new THREE.Group();
      nodeGroup.position.copy(pos);

      // Core sphere
      const coreGeo = new THREE.SphereGeometry(radius, 20, 20);
      const coreMat = new THREE.MeshBasicMaterial({
        color: color.clone(),
        transparent: true,
        opacity: 0.9,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      nodeGroup.add(coreMesh);

      // Hollow ring for unlearned stars
      const hollowRingGeo = new THREE.TorusGeometry(radius * 1.15, Math.max(0.055, radius * 0.1), 10, 32);
      const hollowRingMat = new THREE.MeshBasicMaterial({
        color: color.clone().lerp(WHITE_COLOR, 0.25),
        transparent: true,
        opacity: 0.55,
      });
      const hollowRingMesh = new THREE.Mesh(hollowRingGeo, hollowRingMat);
      nodeGroup.add(hollowRingMesh);

      // Outer pulsing ring for due-for-review / learning stars
      const reviewRingGeo = new THREE.TorusGeometry(radius * 1.62, 0.048, 8, 36);
      const reviewRingMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#fbbf24'),
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const reviewRingMesh = new THREE.Mesh(reviewRingGeo, reviewRingMat);
      nodeGroup.add(reviewRingMesh);

      // Glow sprite
      const spriteMat = new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: color,
        transparent: true,
        opacity: 0.44,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glowSprite = new THREE.Sprite(spriteMat);
      const spriteScale = radius * 4.4;
      glowSprite.scale.set(spriteScale, spriteScale, 1);
      coreMesh.add(glowSprite);

      // Hub 4-point cross starflare
      let flareSprite = null;
      let flareMat = null;
      if (isHub) {
        flareMat = new THREE.SpriteMaterial({
          map: this.starflareTexture,
          color: color.clone().lerp(WHITE_COLOR, 0.55).multiplyScalar(1.35),
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        flareSprite = new THREE.Sprite(flareMat);
        const fScale = radius * 6.4;
        flareSprite.scale.set(fScale, fScale, 1);
        nodeGroup.add(flareSprite);
      }

      // Invisible hit sphere for easy hovering
      const hitGeo = new THREE.SphereGeometry(Math.max(1.2, radius * 2.2), 12, 12);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      nodeGroup.add(hitMesh);

      // CSS2D label (no dark box, monospace dimmed chapter tags, cached screen bounds)
      const labelEl = document.createElement('div');
      labelEl.className = 'star-label';
      buildStarLabelContent(labelEl, raw.name);
      const labelObj = new CSS2DObject(labelEl);
      labelObj.position.set(0, -radius * 1.25, 0);
      nodeGroup.add(labelObj);

      const approxWidth = Math.min(220, Math.max(58, String(raw.name || '').length * 9.5 + 14));
      const approxHeight = 20;

      const learnInfo = this._getLearningInfo(raw.id);

      const nodeObj = {
        ...raw,
        degree,
        isHub,
        mastery: learnInfo.mastery || 'unlearned',
        isDue: Boolean(learnInfo.isDue),
        color,
        radius,
        baseSpriteScale: spriteScale,
        pos,
        vel: new THREE.Vector3(),
        phase: idx * 0.9 + Math.random() * 2,
        mesh: nodeGroup,
        coreMesh,
        coreMat,
        hollowRingMesh,
        hollowRingMat,
        reviewRingMesh,
        reviewRingMat,
        glowSprite,
        spriteMat,
        flareSprite,
        flareMat,
        hitMesh,
        labelEl,
        labelObj,
        approxWidth,
        approxHeight,
        labelPriority: 0,
        labelAllowed: true,
        neighbors: new Set(),
        outDegree: 0,
        inDegree: 0,
      };

      hitMesh.userData = { type: 'node', node: nodeObj };
      this.nodeHitMeshes.push(hitMesh);
      this.graphGroup.add(nodeGroup);
      this.nodes.push(nodeObj);
      this.nodeMap.set(raw.id, nodeObj);
    });

    // Shared geometries for directed arrowheads & hover highlight beam
    const arrowGeo = new THREE.ConeGeometry(0.28, 0.9, 12);

    const beamGeo = new THREE.CylinderGeometry(0.055, 0.16, 1, 10, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.hoverEdgeBeam = new THREE.Mesh(beamGeo, beamMat);
    this.hoverEdgeBeam.visible = false;
    this.graphGroup.add(this.hoverEdgeBeam);

    // Build directed edges with relation-type encoding & bright->dim gradient
    rawLinks.forEach((raw, idx) => {
      const sourceNode = this.nodeMap.get(raw.source);
      const targetNode = this.nodeMap.get(raw.target);
      if (!sourceNode || !targetNode) return;

      sourceNode.neighbors.add(targetNode.id);
      targetNode.neighbors.add(sourceNode.id);
      sourceNode.outDegree += 1;
      targetNode.inDegree += 1;

      const relStyle = classifyRelation(raw.relation);
      const isDouble = relStyle.lineStyle === 'double';
      const vertexCount = isDouble ? 4 : 2;
      const positions = new Float32Array(vertexCount * 3);

      const srcCol = sourceNode.color.clone().lerp(WHITE_COLOR, 0.52).multiplyScalar(1.32);
      const tgtCol = targetNode.color.clone().multiplyScalar(0.28);
      const colors = isDouble
        ? new Float32Array([
            srcCol.r, srcCol.g, srcCol.b,
            tgtCol.r, tgtCol.g, tgtCol.b,
            srcCol.r, srcCol.g, srcCol.b,
            tgtCol.r, tgtCol.g, tgtCol.b,
          ])
        : new Float32Array([
            srcCol.r, srcCol.g, srcCol.b,
            tgtCol.r, tgtCol.g, tgtCol.b,
          ]);

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      let mat;
      if (relStyle.lineStyle === 'dashed') {
        mat = new THREE.LineDashedMaterial({
          vertexColors: true,
          dashSize: 1.5,
          gapSize: 0.9,
          transparent: true,
          opacity: 0.62,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
      } else if (relStyle.lineStyle === 'dotted') {
        mat = new THREE.LineDashedMaterial({
          vertexColors: true,
          dashSize: 0.36,
          gapSize: 0.72,
          transparent: true,
          opacity: 0.62,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
      } else {
        mat = new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: relStyle.key === 'derive' ? 0.68 : 0.56,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
      }

      const line = isDouble ? new THREE.LineSegments(geo, mat) : new THREE.Line(geo, mat);

      // Luminous directed cone near target star
      const arrowMat = new THREE.MeshBasicMaterial({
        color: targetNode.color.clone().lerp(WHITE_COLOR, 0.36),
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
      this.graphGroup.add(arrowMesh);

      const baseOpacity = relStyle.key === 'derive' ? 0.68 : relStyle.lineStyle === 'solid' ? 0.56 : 0.62;
      const edgeObj = {
        ...raw,
        relStyle,
        isDouble,
        sourceNode,
        targetNode,
        line,
        geo,
        mat,
        baseOpacity,
        arrowMesh,
        arrowMat,
        pulseOffset: (idx * 0.27) % 1,
        flowSpeed: relStyle.key === 'derive' ? 0.48 : 0.32,
        visualState: 'normal',
        cascadeBoost: 0,
      };
      line.userData = { type: 'edge', edge: edgeObj };

      this.edgeLines.push(line);
      this.graphGroup.add(line);
      this.edges.push(edgeObj);
    });

    // Instanced directional light particles flowing source -> target along all edges
    if (this.edges.length > 0) {
      const particleGeo = new THREE.OctahedronGeometry(0.21, 1);
      const particleMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.94,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const totalInstances = this.edges.length * PARTICLES_PER_EDGE;
      this.edgeParticlesMesh = new THREE.InstancedMesh(particleGeo, particleMat, totalInstances);
      this.edgeParticlesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.edgeParticlesMesh.frustumCulled = false;

      const initColor = new THREE.Color('#7dd3fc');
      for (let i = 0; i < totalInstances; i++) {
        this.edgeParticlesMesh.setColorAt(i, initColor);
      }
      if (this.edgeParticlesMesh.instanceColor) {
        this.edgeParticlesMesh.instanceColor.needsUpdate = true;
      }
      this.graphGroup.add(this.edgeParticlesMesh);
    }

    // Build 3D Wormholes (spacetime portals to other parallel universes)
    (wormholes || []).forEach((whRaw, idx) => {
      const anchorNode = this.nodeMap.get(whRaw.anchorNodeId);
      if (!anchorNode) return;

      const whColor = new THREE.Color(whRaw.color || '#a78bfa');
      const whGroup = new THREE.Group();

      // 1. Dark Event Horizon Core
      const voidGeo = new THREE.SphereGeometry(0.95, 24, 24);
      const voidMat = new THREE.MeshBasicMaterial({ color: 0x02030a });
      const voidMesh = new THREE.Mesh(voidGeo, voidMat);
      whGroup.add(voidMesh);

      // 2. Inner Event Horizon Lens Ring
      const innerRingGeo = new THREE.TorusGeometry(1.12, 0.045, 16, 48);
      const innerRingMat = new THREE.MeshBasicMaterial({
        color: whColor.clone().lerp(new THREE.Color('#ffffff'), 0.35),
        transparent: true,
        opacity: 0.85,
      });
      const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
      whGroup.add(innerRing);

      // 3. Outer Tilted Accretion Disk Rings (sleek precision rings)
      const outerRingGeo = new THREE.TorusGeometry(2.15, 0.032, 16, 64);
      const outerRingMat = new THREE.MeshBasicMaterial({
        color: whColor,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
      outerRing.rotation.x = Math.PI * 0.36;
      outerRing.rotation.y = Math.PI * 0.14;
      whGroup.add(outerRing);

      const midRingGeo = new THREE.TorusGeometry(1.65, 0.024, 14, 56);
      const midRingMat = new THREE.MeshBasicMaterial({
        color: whColor.clone().lerp(new THREE.Color('#38bdf8'), 0.4),
        transparent: true,
        opacity: 0.48,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const midRing = new THREE.Mesh(midRingGeo, midRingMat);
      midRing.rotation.x = -Math.PI * 0.28;
      midRing.rotation.z = Math.PI * 0.22;
      whGroup.add(midRing);

      // 4. Swirling 3-Arm Spiral Vortex Particles
      const pCount = 120;
      const pPos = new Float32Array(pCount * 3);
      const pCol = new Float32Array(pCount * 3);
      for (let i = 0; i < pCount; i++) {
        const arm = i % 3;
        const frac = (i / pCount);
        const r = 1.25 + frac * 1.9;
        const angle = arm * ((Math.PI * 2) / 3) + frac * Math.PI * 3.4;
        const funnelZ = (1 - frac) * 0.45 * (i % 2 === 0 ? 1 : -1);
        pPos[i * 3] = Math.cos(angle) * r;
        pPos[i * 3 + 1] = Math.sin(angle) * r;
        pPos[i * 3 + 2] = funnelZ;

        const c = whColor.clone().lerp(new THREE.Color('#ffffff'), (1 - frac) * 0.45);
        pCol[i * 3] = c.r;
        pCol[i * 3 + 1] = c.g;
        pCol[i * 3 + 2] = c.b;
      }
      const vortexGeo = new THREE.BufferGeometry();
      vortexGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
      vortexGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
      const vortexMat = new THREE.PointsMaterial({
        size: 0.28,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const vortexPoints = new THREE.Points(vortexGeo, vortexMat);
      vortexPoints.rotation.x = Math.PI * 0.34;
      whGroup.add(vortexPoints);

      // 5. Invisible Hit Sphere for Hover & Click
      const hitGeo = new THREE.SphereGeometry(2.7, 14, 14);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      this.graphGroup.add(hitMesh);

      // 6. CSS2D Wormhole Label
      const labelEl = document.createElement('div');
      labelEl.className = 'wormhole-label';
      const icon = document.createElement('span');
      icon.className = 'wh-icon';
      icon.textContent = '🌀';
      labelEl.append(icon, ` 虫洞 → ${whRaw.targetLabel || whRaw.targetUniverseId}`);
      const labelObj = new CSS2DObject(labelEl);
      labelObj.position.set(0, -2.6, 0);
      whGroup.add(labelObj);

      // 7. Tether Line to Anchor Star
      const tetherPositions = new Float32Array(6);
      const tetherGeo = new THREE.BufferGeometry();
      tetherGeo.setAttribute('position', new THREE.BufferAttribute(tetherPositions, 3));
      const tetherMat = new THREE.LineDashedMaterial({
        color: whColor,
        dashSize: 0.65,
        gapSize: 0.45,
        transparent: true,
        opacity: 0.6,
      });
      const tetherLine = new THREE.Line(tetherGeo, tetherMat);
      this.graphGroup.add(tetherLine);

      // 8. Faint Curved Arc Light-Band projecting toward target parallel universe galaxy
      const arcSegs = 24;
      const arcPositions = new Float32Array((arcSegs + 1) * 3);
      const arcColors = new Float32Array((arcSegs + 1) * 3);
      for (let i = 0; i <= arcSegs; i++) {
        const fade = Math.pow(1 - i / arcSegs, 1.6) * 0.85;
        arcColors[i * 3] = whColor.r * fade;
        arcColors[i * 3 + 1] = whColor.g * fade;
        arcColors[i * 3 + 2] = whColor.b * fade;
      }
      const arcGeo = new THREE.BufferGeometry();
      arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPositions, 3));
      arcGeo.setAttribute('color', new THREE.BufferAttribute(arcColors, 3));
      const arcMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.46,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const arcLine = new THREE.Line(arcGeo, arcMat);
      this.graphGroup.add(arcLine);

      const whObj = {
        ...whRaw,
        anchorNode,
        color: whColor,
        group: whGroup,
        innerRing,
        outerRing,
        midRing,
        vortexPoints,
        hitMesh,
        labelEl,
        tetherLine,
        tetherGeo,
        arcLine,
        arcGeo,
        arcSegs,
        phase: idx * 1.7,
        pos: new THREE.Vector3(),
      };

      hitMesh.userData = { type: 'wormhole', wormhole: whObj };
      this.wormholeHitMeshes.push(hitMesh);
      this.graphGroup.add(whGroup);
      this.wormholes.push(whObj);
    });

    // Build volumetric domain nebulae + large light-weight domain labels
    this._buildDomainNebulae();

    // Run a full warm-up of physics so initial layout is settled and labels stay still
    for (let i = 0; i < 180; i++) {
      this._stepPhysics(0.016);
    }
    this.traceState = this._emptyTraceState();
    this.tourHighlight = null;
    this.callbacks.onTraceChange?.(null);
    this._syncPositions();
    this._clearHover();
    if (this.selectedNode) {
      this.selectedNode = this.nodeMap.get(this.selectedNode.id) ?? null;
      this.callbacks.onSelectNode(this.selectedNode);
    }
    this._applyVisualStates();
    if (prevPositions.size === 0) {
      this.fitToUniverse(true);
    }
    this.needsRaycast = true;
  }

  _buildDomainNebulae() {
    const byCat = new Map();
    for (const n of this.nodes) {
      if (!byCat.has(n.category)) byCat.set(n.category, []);
      byCat.get(n.category).push(n);
    }

    for (const [catId, catNodes] of byCat.entries()) {
      const cat = Object.hasOwn(this.categories, catId)
        ? this.categories[catId]
        : { name: catId, color: '#38bdf8' };
      const color = new THREE.Color(cat.color || '#38bdf8');
      const nebGroup = new THREE.Group();

      const matA = new THREE.SpriteMaterial({
        map: this.nebulaTexture,
        color,
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const spriteA = new THREE.Sprite(matA);

      const matB = new THREE.SpriteMaterial({
        map: this.nebulaTexture,
        color: color.clone().lerp(WHITE_COLOR, 0.2),
        transparent: true,
        opacity: 0.075,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const spriteB = new THREE.Sprite(matB);

      nebGroup.add(spriteA);
      nebGroup.add(spriteB);

      const labelEl = document.createElement('div');
      labelEl.className = 'nebula-label';
      labelEl.style.color = cat.color || '#7dd3fc';
      labelEl.textContent = cat.name;
      const labelObj = new CSS2DObject(labelEl);
      nebGroup.add(labelObj);

      this.nebulaeGroup.add(nebGroup);
      this.nebulae.push({
        catId,
        nodes: catNodes,
        group: nebGroup,
        spriteA,
        matA,
        spriteB,
        matB,
        labelEl,
        labelObj,
        centroid: new THREE.Vector3(),
        radius: 16,
      });
    }
  }

  _syncNebulae() {
    for (const neb of this.nebulae) {
      if (neb.nodes.length === 0) continue;
      neb.centroid.set(0, 0, 0);
      for (const n of neb.nodes) {
        neb.centroid.add(n.pos);
      }
      neb.centroid.divideScalar(neb.nodes.length);

      let maxDist = 8;
      for (const n of neb.nodes) {
        const d = neb.centroid.distanceTo(n.pos);
        if (d > maxDist) maxDist = d;
      }
      neb.radius = maxDist + 8;
      neb.group.position.copy(neb.centroid);
      const scale = neb.radius * 2.55;
      neb.spriteA.scale.set(scale, scale * 0.85, 1);
      neb.spriteB.scale.set(scale * 0.88, scale * 1.04, 1);
      neb.labelObj.position.set(0, neb.radius * 0.56, 0);
    }
  }

  refreshNodeLearningStates() {
    for (const n of this.nodes) {
      const info = this._getLearningInfo(n.id);
      n.mastery = info.mastery || 'unlearned';
      n.isDue = Boolean(info.isDue);
    }
    this._applyVisualStates();
  }

  fitToUniverse(immediate = false) {
    if (this.nodes.length === 0) {
      const target = new THREE.Vector3(0, 0, 0);
      const pos = new THREE.Vector3(0, 20, 108);
      if (immediate || this.reducedMotion) {
        this.controls.target.copy(target);
        this.camera.position.copy(pos);
        this.cameraFlyAnim = null;
      } else {
        this._startCameraFly(target, pos, 950);
      }
      return;
    }

    const box = new THREE.Box3();
    for (const n of this.nodes) {
      box.expandByPoint(n.pos);
    }
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = Math.max(52, Math.min(200, ((sphere.radius + 10) / Math.sin(fovRad / 2)) * 1.18));
    const dir = new THREE.Vector3(0, 0.18, 1).normalize();
    const pos = sphere.center.clone().addScaledVector(dir, dist);

    if (immediate || this.reducedMotion) {
      this.controls.target.copy(sphere.center);
      this.camera.position.copy(pos);
      this.controls.update();
      this.cameraFlyAnim = null;
    } else {
      this._startCameraFly(sphere.center, pos, 950);
    }
  }

  _stepPhysics(dt) {
    const nCount = this.nodes.length;
    if (nCount === 0) return;

    const repulsion = 290;
    const springK = 0.036;
    const restLength = 17.5;
    const centerGravity = 0.008;
    const clusterGravity = 0.022;
    const damping = 0.86;

    // Repulsion between all pairs (stronger short-range separation to avoid label overlaps)
    for (let i = 0; i < nCount; i++) {
      const a = this.nodes[i];
      for (let j = i + 1; j < nCount; j++) {
        const b = this.nodes[j];
        const dx = a.pos.x - b.pos.x;
        const dy = a.pos.y - b.pos.y;
        const dz = a.pos.z - b.pos.z;
        let distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < 1.5) distSq = 1.5;
        const dist = Math.sqrt(distSq);
        let force = repulsion / distSq;
        if (dist < 12.0) {
          force += (12.0 - dist) * 0.45;
        }
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fz = (dz / dist) * force;

        a.vel.x += fx * dt * 10;
        a.vel.y += fy * dt * 10;
        a.vel.z += fz * dt * 10;

        b.vel.x -= fx * dt * 10;
        b.vel.y -= fy * dt * 10;
        b.vel.z -= fz * dt * 10;
      }
    }

    // Spring attraction along edges
    for (const e of this.edges) {
      const a = e.sourceNode;
      const b = e.targetNode;
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const dz = b.pos.z - a.pos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
      const diff = dist - restLength;
      const force = diff * springK;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const fz = (dz / dist) * force;

      a.vel.x += fx;
      a.vel.y += fy;
      a.vel.z += fz;

      b.vel.x -= fx;
      b.vel.y -= fy;
      b.vel.z -= fz;
    }

    // Center & cluster gravity + integration
    for (const n of this.nodes) {
      const anchor = (this.clusterAnchors && this.clusterAnchors[n.category]) || new THREE.Vector3();
      n.vel.x += -n.pos.x * centerGravity + (anchor.x - n.pos.x) * clusterGravity;
      n.vel.y += -n.pos.y * centerGravity + (anchor.y - n.pos.y) * clusterGravity;
      n.vel.z += -n.pos.z * centerGravity + (anchor.z - n.pos.z) * clusterGravity;

      n.vel.multiplyScalar(damping);
      if (n.vel.lengthSq() > 9) {
        n.vel.setLength(3);
      }
      n.pos.add(n.vel);
    }
  }

  _syncPositions() {
    for (const n of this.nodes) {
      n.mesh.position.copy(n.pos);
    }
    const upVec = new THREE.Vector3(0, 1, 0);
    const altUp = new THREE.Vector3(1, 0, 0);
    const dirVec = new THREE.Vector3();
    const perpVec = new THREE.Vector3();

    for (const e of this.edges) {
      const sPos = e.sourceNode.pos;
      const tPos = e.targetNode.pos;
      dirVec.subVectors(tPos, sPos);
      const len = dirVec.length();

      const posAttr = e.geo.getAttribute('position');
      if (e.isDouble) {
        if (len > 0.001) {
          dirVec.divideScalar(len);
          const ref = Math.abs(dirVec.y) > 0.9 ? altUp : upVec;
          perpVec.crossVectors(dirVec, ref).normalize().multiplyScalar(0.24);
        } else {
          perpVec.set(0.24, 0, 0);
        }
        posAttr.setXYZ(0, sPos.x + perpVec.x, sPos.y + perpVec.y, sPos.z + perpVec.z);
        posAttr.setXYZ(1, tPos.x + perpVec.x, tPos.y + perpVec.y, tPos.z + perpVec.z);
        posAttr.setXYZ(2, sPos.x - perpVec.x, sPos.y - perpVec.y, sPos.z - perpVec.z);
        posAttr.setXYZ(3, tPos.x - perpVec.x, tPos.y - perpVec.y, tPos.z - perpVec.z);
      } else {
        posAttr.setXYZ(0, sPos.x, sPos.y, sPos.z);
        posAttr.setXYZ(1, tPos.x, tPos.y, tPos.z);
        if (len > 0.001) dirVec.divideScalar(len);
      }
      posAttr.needsUpdate = true;
      e.geo.computeBoundingSphere();

      if (e.relStyle.lineStyle === 'dashed' || e.relStyle.lineStyle === 'dotted') {
        e.line.computeLineDistances();
      }

      // Position & orient luminous cone just before target star
      if (len > 0.001) {
        const offset = e.targetNode.radius + 0.72;
        e.arrowMesh.position.copy(tPos).addScaledVector(dirVec, -Math.min(offset, len * 0.45));
        e.arrowMesh.quaternion.setFromUnitVectors(upVec, dirVec);
      }
    }

    this._syncHoverEdgeBeam();
    this._syncNebulae();

    // Position wormholes radially outside their anchor stars & project curved arc toward target galaxy
    const radialDir = new THREE.Vector3();
    const targetDir = new THREE.Vector3();
    const ctrlPt = new THREE.Vector3();
    const endPt = new THREE.Vector3();

    for (const wh of this.wormholes) {
      radialDir.copy(wh.anchorNode.pos);
      if (radialDir.lengthSq() < 1) {
        radialDir.set(1, 0.5, 0.5);
      }
      radialDir.normalize();
      wh.pos.copy(wh.anchorNode.pos).addScaledVector(radialDir, 24.0);
      wh.group.position.copy(wh.pos);
      wh.hitMesh.position.copy(wh.pos);

      const tAttr = wh.tetherGeo.getAttribute('position');
      tAttr.setXYZ(0, wh.anchorNode.pos.x, wh.anchorNode.pos.y, wh.anchorNode.pos.z);
      tAttr.setXYZ(1, wh.pos.x, wh.pos.y, wh.pos.z);
      tAttr.needsUpdate = true;
      wh.tetherLine.computeLineDistances();
      wh.tetherGeo.computeBoundingSphere();

      const targetGalaxy = this.distantGalaxyMap.get(wh.targetUniverseId);
      if (targetGalaxy) {
        wh.arcLine.visible = true;
        targetDir.subVectors(targetGalaxy.pos, wh.pos).normalize();
        endPt.copy(wh.pos).addScaledVector(targetDir, 90);
        ctrlPt.copy(wh.pos).lerp(endPt, 0.45);
        ctrlPt.y += 18;
        const curve = new THREE.QuadraticBezierCurve3(wh.pos, ctrlPt, endPt);
        const pts = curve.getPoints(wh.arcSegs);
        const aAttr = wh.arcGeo.getAttribute('position');
        for (let i = 0; i <= wh.arcSegs; i++) {
          aAttr.setXYZ(i, pts[i].x, pts[i].y, pts[i].z);
        }
        aAttr.needsUpdate = true;
        wh.arcGeo.computeBoundingSphere();
      } else {
        wh.arcLine.visible = false;
      }
    }
  }

  _syncHoverEdgeBeam() {
    if (!this.hoverEdgeBeam) return;
    const focusEdge = this.hoveredNode ? null : this.hoveredEdge;
    if (!focusEdge) {
      this.hoverEdgeBeam.visible = false;
      return;
    }
    const sPos = focusEdge.sourceNode.pos;
    const tPos = focusEdge.targetNode.pos;
    const diff = new THREE.Vector3().subVectors(tPos, sPos);
    const len = diff.length();
    if (len < 0.01) {
      this.hoverEdgeBeam.visible = false;
      return;
    }
    this.hoverEdgeBeam.position.addVectors(sPos, tPos).multiplyScalar(0.5);
    this.hoverEdgeBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.divideScalar(len));
    this.hoverEdgeBeam.scale.set(1, len, 1);
    this.hoverEdgeBeam.material.color
      .copy(focusEdge.sourceNode.color)
      .lerp(focusEdge.targetNode.color, 0.4)
      .lerp(WHITE_COLOR, 0.35);
    this.hoverEdgeBeam.visible = true;
  }

  _isNodeMatchingFilter(node) {
    const catMatch = this.activeCategory === 'all' || node.category === this.activeCategory;
    if (!catMatch) return false;
    if (!this.searchQuery) return true;
    const q = this.searchQuery.toLowerCase();
    return (
      node.name.toLowerCase().includes(q) ||
      node.en.toLowerCase().includes(q) ||
      node.summary.toLowerCase().includes(q)
    );
  }

  _applyVisualStates() {
    const traceActive = this.traceState.active;
    const focusNode = this.hoveredNode || this.selectedNode;
    const focusEdge = this.hoveredNode ? null : this.hoveredEdge;
    const tourHl = this.tourHighlight;
    const hasFilter = this.activeCategory !== 'all' || this.searchQuery.length > 0;

    for (const n of this.nodes) {
      const matchesFilter = this._isNodeMatchingFilter(n);
      let state = 'normal';

      if (traceActive) {
        if (
          n.id === this.traceState.focusedId ||
          n.id === this.traceState.rootId ||
          (this.hoveredNode && n.id === this.hoveredNode.id)
        ) {
          state = 'primary';
        } else if (this.traceState.nodeIds.has(n.id)) {
          state = 'neighbor';
        } else {
          state = 'dimmed';
        }
      } else if (tourHl) {
        if (n.id === tourHl.currId) state = 'primary';
        else if (n.id === tourHl.prevId || focusNode?.neighbors?.has(n.id)) state = 'neighbor';
        else state = 'dimmed';
      } else if (focusNode) {
        if (n.id === focusNode.id) state = 'primary';
        else if (focusNode.neighbors.has(n.id)) state = 'neighbor';
        else state = 'dimmed';
      } else if (focusEdge) {
        if (n.id === focusEdge.sourceNode.id || n.id === focusEdge.targetNode.id) state = 'primary';
        else state = 'dimmed';
      } else if (hasFilter) {
        state = matchesFilter ? 'primary' : 'dimmed';
      }

      const mastery = n.mastery || 'unlearned';
      const isMastered = mastery === 'mastered';
      const isLearning = mastery === 'learning';

      // Mastery color luminance control (high threshold bloom 0.68 keeps unlearned/learning non-blooming)
      if (state === 'dimmed') {
        n.coreMat.color.copy(n.color).multiplyScalar(0.28);
        n.coreMat.opacity = traceActive ? 0.12 : 0.14;
        n.spriteMat.opacity = 0.03;
        n.hollowRingMat.opacity = isMastered ? 0 : 0.12;
        if (n.flareMat) n.flareMat.opacity = 0.08;
        n.coreMesh.scale.setScalar(0.84);
        n.labelEl.classList.remove('highlighted');
        n.labelEl.classList.add('dimmed');
      } else if (state === 'primary') {
        n.coreMat.color.copy(n.color).lerp(WHITE_COLOR, 0.35).multiplyScalar(isMastered ? 1.55 : 1.15);
        n.coreMat.opacity = isMastered || isLearning ? 1.0 : 0.52;
        n.spriteMat.opacity = isMastered ? 0.92 : 0.68;
        n.hollowRingMat.opacity = isMastered ? 0 : isLearning ? 0.25 : 0.9;
        if (n.flareMat) n.flareMat.opacity = 1.0;
        n.coreMesh.scale.setScalar(1.3);
        n.labelEl.classList.add('highlighted');
        n.labelEl.classList.remove('dimmed');
      } else if (state === 'neighbor') {
        n.coreMat.color.copy(n.color).lerp(WHITE_COLOR, 0.18).multiplyScalar(isMastered ? 1.38 : 0.88);
        n.coreMat.opacity = isMastered ? 0.98 : isLearning ? 0.78 : 0.34;
        n.spriteMat.opacity = isMastered ? 0.75 : 0.45;
        n.hollowRingMat.opacity = isMastered ? 0 : isLearning ? 0.18 : 0.72;
        if (n.flareMat) n.flareMat.opacity = 0.85;
        n.coreMesh.scale.setScalar(1.12);
        n.labelEl.classList.remove('highlighted', 'dimmed');
      } else {
        // Normal panoramic view: clear 3-tier mastery differentiation
        if (isMastered) {
          n.coreMat.color.copy(n.color).lerp(WHITE_COLOR, 0.24).multiplyScalar(1.45);
          n.coreMat.opacity = 1.0;
          n.spriteMat.opacity = 0.74;
          n.hollowRingMat.opacity = 0;
        } else if (isLearning) {
          n.coreMat.color.copy(n.color).multiplyScalar(0.82);
          n.coreMat.opacity = 0.72;
          n.spriteMat.opacity = 0.38;
          n.hollowRingMat.opacity = 0.18;
        } else {
          // unlearned: dim hollow ring below bloom threshold
          n.coreMat.color.copy(n.color).multiplyScalar(0.35);
          n.coreMat.opacity = 0.16;
          n.spriteMat.opacity = 0.14;
          n.hollowRingMat.opacity = 0.62;
        }
        if (n.flareMat) n.flareMat.opacity = isMastered ? 0.95 : 0.72;
        n.coreMesh.scale.setScalar(1.0);
        n.labelEl.classList.remove('highlighted', 'dimmed');
      }

      n.hollowRingMesh.visible = !isMastered;
      n.reviewRingMesh.visible = n.isDue && state !== 'dimmed';
      n.labelAllowed = this.showLabels || state === 'primary' || state === 'neighbor';
      n.labelPriority =
        state === 'primary'
          ? 1000
          : state === 'neighbor'
            ? 500 + n.degree
            : state === 'dimmed'
              ? -10
              : (n.isHub ? 200 : 0) + n.degree * 10;
    }

    this._updateLabelLODAndCollision();

    for (const e of this.edges) {
      let highlighted = false;
      let dimmed = false;

      if (traceActive) {
        if (this.traceState.edgeSet.has(e)) highlighted = true;
        else dimmed = true;
      } else if (tourHl) {
        const isTourPair =
          (tourHl.prevId &&
            ((e.sourceNode.id === tourHl.prevId && e.targetNode.id === tourHl.currId) ||
              (e.sourceNode.id === tourHl.currId && e.targetNode.id === tourHl.prevId))) ||
          e.sourceNode.id === tourHl.currId ||
          e.targetNode.id === tourHl.currId;
        if (isTourPair) highlighted = true;
        else dimmed = true;
      } else if (focusNode) {
        if (e.sourceNode.id === focusNode.id || e.targetNode.id === focusNode.id) {
          highlighted = true;
        } else {
          dimmed = true;
        }
      } else if (focusEdge) {
        if (e === focusEdge) highlighted = true;
        else dimmed = true;
      } else if (hasFilter) {
        const sMatch = this._isNodeMatchingFilter(e.sourceNode);
        const tMatch = this._isNodeMatchingFilter(e.targetNode);
        if (sMatch && tMatch) highlighted = true;
        else if (!sMatch && !tMatch) dimmed = true;
      }

      if (highlighted) {
        e.visualState = focusEdge === e ? 'hover' : traceActive ? 'trace' : 'highlighted';
        e.mat.opacity = 0.96;
        e.arrowMat.opacity = 0.98;
        e.arrowMesh.scale.setScalar(focusEdge === e ? 1.38 : 1.24);
      } else if (dimmed) {
        e.visualState = 'dimmed';
        e.mat.opacity = traceActive ? 0.07 : 0.06;
        e.arrowMat.opacity = 0.06;
        e.arrowMesh.scale.setScalar(0.78);
      } else {
        e.visualState = 'normal';
        e.mat.opacity = e.baseOpacity;
        e.arrowMat.opacity = 0.8;
        e.arrowMesh.scale.setScalar(1.0);
      }
    }

    this._syncHoverEdgeBeam();
  }

  _performRaycast() {
    const pointerMoved = this.pointerMoved;
    this.pointerMoved = false;
    this.needsRaycast = false;
    if (!this.pointerInside) {
      if (this._clearHover()) this._applyVisualStates();
      return;
    }

    this.camera.updateMatrixWorld();
    this.graphGroup.updateMatrixWorld();
    this.distantGalaxyGroup.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, this.camera);

    // 0. Check wormholes first
    const whHits = this.raycaster.intersectObjects(this.wormholeHitMeshes, false);
    if (whHits.length > 0) {
      const hitWh = whHits[0].object.userData.wormhole;
      const changed = this.hoveredWormhole !== hitWh;
      if (changed) {
        this.hoveredWormhole = hitWh;
        this.hoveredNode = null;
        this.hoveredEdge = null;
        this.hoveredGalaxy = null;
        this.container.classList.add('pointer-cursor');
        this._applyVisualStates();
      }
      if (changed || pointerMoved) {
        this.callbacks.onHoverWormhole?.(hitWh, this.pointerScreen);
      }
      return;
    }

    // 1. Check nodes
    const nodeHits = this.raycaster.intersectObjects(this.nodeHitMeshes, false);
    if (nodeHits.length > 0) {
      const hitNode = nodeHits[0].object.userData.node;
      const changed = this.hoveredNode !== hitNode;
      if (changed) {
        this.hoveredNode = hitNode;
        this.hoveredEdge = null;
        this.hoveredWormhole = null;
        this.hoveredGalaxy = null;
        this.container.classList.add('pointer-cursor');
        this._applyVisualStates();
      }
      if (changed || pointerMoved) this.callbacks.onHoverNode(hitNode, this.pointerScreen);
      return;
    }

    // 2. Check edges next
    const edgeHits = this.raycaster.intersectObjects(this.edgeLines, false);
    if (edgeHits.length > 0) {
      const hitEdge = edgeHits[0].object.userData.edge;
      const changed = this.hoveredEdge !== hitEdge;
      if (changed) {
        this.hoveredEdge = hitEdge;
        this.hoveredNode = null;
        this.hoveredWormhole = null;
        this.hoveredGalaxy = null;
        this.container.classList.add('pointer-cursor');
        this._applyVisualStates();
      }
      if (changed || pointerMoved) this.callbacks.onHoverEdge(hitEdge, this.pointerScreen);
      return;
    }

    // 3. Check distant parallel universe galaxies
    const galaxyHits = this.raycaster.intersectObjects(this.distantGalaxyHitMeshes, false);
    if (galaxyHits.length > 0) {
      const hitGalaxy = galaxyHits[0].object.userData.galaxy;
      const changed = this.hoveredGalaxy !== hitGalaxy;
      if (changed) {
        this.hoveredGalaxy = hitGalaxy;
        this.hoveredNode = null;
        this.hoveredEdge = null;
        this.hoveredWormhole = null;
        this.container.classList.add('pointer-cursor');
        this.highlightDistantGalaxy(hitGalaxy.universe.id);
      }
      if (changed || pointerMoved) {
        this.callbacks.onHoverGalaxy?.(hitGalaxy.universe, this.pointerScreen);
      }
      return;
    }

    if (this._clearHover()) this._applyVisualStates();
  }

  _clearHover() {
    if (!this.hoveredNode && !this.hoveredEdge && !this.hoveredWormhole && !this.hoveredGalaxy) return false;
    this.hoveredNode = null;
    this.hoveredEdge = null;
    this.hoveredWormhole = null;
    if (this.hoveredGalaxy) {
      this.hoveredGalaxy = null;
      this.highlightDistantGalaxy(null);
    }
    this.container.classList.remove('pointer-cursor');
    this.callbacks.onHoverClear();
    return true;
  }

  focusOnNode(nodeId) {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;
    if (this.traceState.active) {
      this.traceState = this._emptyTraceState();
      this.callbacks.onTraceChange?.(null);
    }
    this.selectedNode = node;
    this._applyVisualStates();
    this._flyToPosition(node.pos, 34);
    this.callbacks.onSelectNode(node);
  }

  _updateLabelLODAndCollision() {
    if (!this.nodes || this.nodes.length === 0) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    if (width <= 0 || height <= 0) return;

    const overviewDist = this.camera.position.distanceTo(this.controls.target);
    const farOverview = overviewDist > 175;
    const candidates = [];

    for (const n of this.nodes) {
      if (!n.labelAllowed) {
        n.labelObj.visible = false;
        continue;
      }

      const camDist = this.camera.position.distanceTo(n.pos);
      const isFocusedOrNeighbor = n.labelPriority >= 450;

      // LOD: far views show only hubs (and focused/neighbor nodes); zooming in reveals more
      if (!isFocusedOrNeighbor) {
        if (n.labelPriority < 0) {
          n.labelObj.visible = false;
          continue;
        }
        if (farOverview && !n.isHub) {
          n.labelObj.visible = false;
          continue;
        }
        if (camDist > 125 && !n.isHub && n.degree < 2) {
          n.labelObj.visible = false;
          continue;
        }
      }

      _projVec.set(n.pos.x, n.pos.y - n.radius * 1.25, n.pos.z).project(this.camera);
      if (_projVec.z > 1 || _projVec.z < -1) {
        n.labelObj.visible = false;
        continue;
      }

      const sx = (_projVec.x * 0.5 + 0.5) * width;
      const sy = (-_projVec.y * 0.5 + 0.5) * height + 12;
      candidates.push({
        node: n,
        priority: n.labelPriority - camDist * 0.05,
        sx,
        sy,
        hw: n.approxWidth * 0.5 + 5,
        hh: n.approxHeight * 0.5 + 3,
      });
    }

    candidates.sort((a, b) => b.priority - a.priority);

    const placed = [];
    for (const c of candidates) {
      const x1 = c.sx - c.hw;
      const x2 = c.sx + c.hw;
      const y1 = c.sy - c.hh;
      const y2 = c.sy + c.hh;

      let collides = false;
      if (c.node.labelPriority < 900) {
        for (const r of placed) {
          if (x1 < r.x2 && x2 > r.x1 && y1 < r.y2 && y2 > r.y1) {
            collides = true;
            break;
          }
        }
      }

      if (collides) {
        c.node.labelObj.visible = false;
      } else {
        c.node.labelObj.visible = true;
        placed.push({ x1, y1, x2, y2 });
      }
    }
  }

  _startCameraFly(targetVec, posVec, duration = 950) {
    if (this.reducedMotion || duration <= 0) {
      this.controls.target.copy(targetVec);
      this.camera.position.copy(posVec);
      this.controls.update();
      this.cameraFlyAnim = null;
      this.needsRaycast = true;
      return;
    }
    this.cameraFlyAnim = {
      startTime: performance.now(),
      duration,
      startTarget: this.controls.target.clone(),
      startPos: this.camera.position.clone(),
      endTarget: targetVec.clone(),
      endPos: posVec.clone(),
    };
  }

  _flyToPosition(targetVec, distance = 34) {
    const offsetDir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (offsetDir.lengthSq() < 0.01) offsetDir.set(0, 0.3, 1).normalize();
    const destPos = targetVec.clone().add(offsetDir.multiplyScalar(distance));
    this._startCameraFly(targetVec, destPos, 950);
  }

  _fitNodesCamera(nodeIds) {
    const pts = [];
    for (const id of nodeIds) {
      const n = this.nodeMap.get(id);
      if (n) pts.push(n.pos);
    }
    if (pts.length === 0) return;
    if (pts.length === 1) {
      this._flyToPosition(pts[0], 34);
      return;
    }
    const box = new THREE.Box3().setFromPoints(pts);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = Math.max(36, Math.min(165, (sphere.radius / Math.sin(fovRad / 2)) * 1.18));
    this._flyToPosition(sphere.center, dist);
  }

  isTraceActive() {
    return this.traceState.active;
  }

  getTraceSummary() {
    if (!this.traceState.active) return null;
    const rootNode = this.nodeMap.get(this.traceState.rootId);
    return {
      mode: this.traceState.mode,
      rootNode,
      focusedId: this.traceState.focusedId,
      maxLayer: this.traceState.maxLayer,
      topoOrder: this.traceState.topoOrder,
    };
  }

  startTrace(nodeId, mode = 'upstream') {
    const rootNode = this.nodeMap.get(nodeId);
    if (!rootNode) return null;

    // BFS to collect all upstream prerequisites or downstream consequences
    const visited = new Set([nodeId]);
    const queue = [nodeId];
    while (queue.length > 0) {
      const cur = queue.shift();
      for (const e of this.edges) {
        if (mode === 'upstream' && e.targetNode.id === cur) {
          if (!visited.has(e.sourceNode.id)) {
            visited.add(e.sourceNode.id);
            queue.push(e.sourceNode.id);
          }
        } else if (mode === 'downstream' && e.sourceNode.id === cur) {
          if (!visited.has(e.targetNode.id)) {
            visited.add(e.targetNode.id);
            queue.push(e.targetNode.id);
          }
        }
      }
    }

    const edgeSet = new Set();
    const inDegSub = new Map();
    const outSub = new Map();
    for (const id of visited) {
      inDegSub.set(id, 0);
      outSub.set(id, []);
    }

    for (const e of this.edges) {
      if (visited.has(e.sourceNode.id) && visited.has(e.targetNode.id)) {
        edgeSet.add(e);
        inDegSub.set(e.targetNode.id, (inDegSub.get(e.targetNode.id) || 0) + 1);
        outSub.get(e.sourceNode.id).push({ targetId: e.targetNode.id, edge: e });
      }
    }

    // Kahn's topological sort with deterministic cycle fallback
    const layerMap = new Map();
    for (const id of visited) layerMap.set(id, 0);

    const kahnQueue = [...visited]
      .filter((id) => (inDegSub.get(id) || 0) === 0)
      .sort((a, b) => (a === nodeId ? 1 : b === nodeId ? -1 : a.localeCompare(b)));
    const processed = new Set();
    const orderedIds = [];

    while (processed.size < visited.size) {
      if (kahnQueue.length === 0) {
        const remaining = [...visited]
          .filter((id) => !processed.has(id))
          .sort((a, b) => (inDegSub.get(a) || 0) - (inDegSub.get(b) || 0));
        if (remaining.length > 0) kahnQueue.push(remaining[0]);
      }
      const u = kahnQueue.shift();
      if (!u || processed.has(u)) continue;
      processed.add(u);
      orderedIds.push(u);

      const uLayer = layerMap.get(u) || 0;
      for (const { targetId: v } of outSub.get(u) || []) {
        if (processed.has(v)) continue;
        if (layerMap.get(v) < uLayer + 1) {
          layerMap.set(v, uLayer + 1);
        }
        const nextDeg = (inDegSub.get(v) || 0) - 1;
        inDegSub.set(v, nextDeg);
        if (nextDeg <= 0) kahnQueue.push(v);
      }
    }

    let maxLayer = 0;
    for (const layer of layerMap.values()) {
      if (layer > maxLayer) maxLayer = layer;
    }

    const orderIdx = new Map(orderedIds.map((id, i) => [id, i]));
    const topoOrder = [...visited]
      .sort((a, b) => {
        const la = layerMap.get(a) || 0;
        const lb = layerMap.get(b) || 0;
        if (la !== lb) return la - lb;
        return (orderIdx.get(a) ?? 0) - (orderIdx.get(b) ?? 0);
      })
      .map((id) => {
        const node = this.nodeMap.get(id);
        const rels = [];
        for (const e of edgeSet) {
          if (mode === 'upstream' && e.sourceNode.id === id) {
            rels.push({ targetName: e.targetNode.name, relation: e.relation });
          } else if (mode === 'downstream' && e.targetNode.id === id) {
            rels.push({ sourceName: e.sourceNode.name, relation: e.relation });
          }
        }
        return {
          node,
          layer: layerMap.get(id) || 0,
          isRoot: id === nodeId,
          relations: rels,
        };
      });

    this.selectedNode = rootNode;
    this.traceState = {
      active: true,
      mode,
      rootId: nodeId,
      focusedId: nodeId,
      nodeIds: visited,
      edgeSet,
      layerMap,
      maxLayer,
      topoOrder,
    };

    this._applyVisualStates();
    this._fitNodesCamera(visited);
    const summary = this.getTraceSummary();
    this.callbacks.onTraceChange?.(summary);
    return summary;
  }

  flyToNodeInTrace(nodeId) {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;
    if (this.traceState.active) {
      this.traceState.focusedId = nodeId;
      this._applyVisualStates();
      this._flyToPosition(node.pos, 32);
      this.callbacks.onTraceChange?.(this.getTraceSummary());
    } else {
      this.focusOnNode(nodeId);
    }
  }

  clearTrace() {
    if (!this.traceState.active) return false;
    this.traceState = this._emptyTraceState();
    this._applyVisualStates();
    this.callbacks.onTraceChange?.(null);
    return true;
  }

  clearSelection() {
    if (this.traceState.active) {
      this.traceState = this._emptyTraceState();
      this.callbacks.onTraceChange?.(null);
    }
    this.selectedNode = null;
    this._applyVisualStates();
    this.callbacks.onSelectNode(null);
  }

  resetView() {
    if (this.traceState.active) {
      this.traceState = this._emptyTraceState();
      this.callbacks.onTraceChange?.(null);
    }
    this.tourHighlight = null;
    this.selectedNode = null;
    this.fitToUniverse(false);
    this._applyVisualStates();
    this.callbacks.onSelectNode(null);
  }

  showTourPreview(steps = []) {
    this._disposeObjectGroup(this.tourGroup);
    this.tourStopBadges.clear();
    if (!steps || steps.length === 0) return;

    const validNodes = [];
    steps.forEach((step, idx) => {
      const node = this.nodeMap.get(step.nodeId);
      if (!node) return;
      validNodes.push(node);

      const badgeEl = document.createElement('div');
      badgeEl.className = 'tour-stop-badge';
      badgeEl.textContent = String(idx + 1);
      const badgeObj = new CSS2DObject(badgeEl);
      badgeObj.position.set(node.pos.x, node.pos.y + node.radius * 2.1 + 1.2, node.pos.z);
      this.tourGroup.add(badgeObj);
      this.tourStopBadges.set(node.id, badgeEl);
    });

    if (validNodes.length >= 2) {
      const pts = validNodes.map((n) => n.pos.clone());
      const routeGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const routeMat = new THREE.LineDashedMaterial({
        color: new THREE.Color('#7dd3fc'),
        dashSize: 1.6,
        gapSize: 1.0,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const routeLine = new THREE.Line(routeGeo, routeMat);
      routeLine.computeLineDistances();
      this.tourGroup.add(routeLine);
    }

    this._fitNodesCamera(validNodes.map((n) => n.id));
  }

  setTourStepHighlight(prevNodeId, currNodeId) {
    this.tourHighlight = currNodeId ? { prevId: prevNodeId || null, currId: currNodeId } : null;
    for (const [id, el] of this.tourStopBadges.entries()) {
      el.classList.toggle('active', id === currNodeId);
    }
    if (currNodeId) {
      const node = this.nodeMap.get(currNodeId);
      if (node) {
        this.selectedNode = node;
        this._flyToPosition(node.pos, 32);
      }
    }
    this._applyVisualStates();
  }

  clearTourVisuals() {
    this._disposeObjectGroup(this.tourGroup);
    this.tourStopBadges.clear();
    this.tourHighlight = null;
    this._applyVisualStates();
  }

  playWarpTransition(onMidpoint) {
    const startTime = performance.now();
    this.warpAnim = {
      startTime,
      duration: 600,
      midFired: false,
      onMidpoint,
    };
  }

  setCategoryFilter(categoryId) {
    this.activeCategory = categoryId;
    this._applyVisualStates();
  }

  setSearchQuery(query) {
    this.searchQuery = query.trim();
    this._applyVisualStates();
  }

  setAutoOrbit(enabled) {
    this.autoOrbit = enabled;
    this.controls.autoRotate = enabled;
  }

  setPhysicsEnabled(enabled) {
    this.physicsEnabled = enabled;
  }

  setShowLabels(enabled) {
    this.showLabels = enabled;
    this._applyVisualStates();
  }

  _bindEvents() {
    const dom = this.renderer.domElement;
    this._eventController = new AbortController();
    const options = { signal: this._eventController.signal };

    const updatePointer = (x, y) => {
      const rect = dom.getBoundingClientRect();
      this.pointerScreen = { x, y };
      const u = (x - rect.left) / rect.width;
      const v = (y - rect.top) / rect.height;
      this.pointerInside = u >= 0 && u <= 1 && v >= 0 && v <= 1;
      this.pointer.set(u * 2 - 1, 1 - v * 2);
      this.needsRaycast = true;
      this.pointerMoved = true;
    };
    dom.addEventListener('pointermove', (e) => updatePointer(e.clientX, e.clientY), options);

    dom.addEventListener('pointerdown', (e) => {
      this.isPointerDown = true;
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
      // Cancel fly-to if user grabs camera
      this.cameraFlyAnim = null;
    }, options);

    dom.addEventListener('pointerup', (e) => {
      if (!this.isPointerDown) return;
      this.isPointerDown = false;
      const dx = e.clientX - this.pointerDownPos.x;
      const dy = e.clientY - this.pointerDownPos.y;
      const moved = Math.hypot(dx, dy);

      if (moved < 5) {
        updatePointer(e.clientX, e.clientY);
        this._performRaycast();
        if (this.hoveredWormhole && this.callbacks.onClickWormhole) {
          this.callbacks.onClickWormhole(this.hoveredWormhole);
        } else if (this.hoveredNode) {
          this.focusOnNode(this.hoveredNode.id);
        } else if (this.hoveredGalaxy && this.callbacks.onClickGalaxy) {
          this.callbacks.onClickGalaxy(this.hoveredGalaxy.universe);
        } else {
          this.clearSelection();
        }
      }
    }, options);

    const leave = () => {
      this.isPointerDown = false;
      this.pointerInside = false;
      if (this._clearHover()) this._applyVisualStates();
    };
    dom.addEventListener('pointerleave', leave, options);
    dom.addEventListener('pointercancel', leave, options);

    window.addEventListener('resize', () => {
      const width = this.container.clientWidth || window.innerWidth;
      const height = this.container.clientHeight || window.innerHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      this.labelRenderer.setSize(width, height);
      this.composer.setSize(width, height);
      if (this.pointerInside) {
        updatePointer(this.pointerScreen.x, this.pointerScreen.y);
        if (!this.pointerInside) leave();
      }
    }, options);
  }

  destroy() {
    if (this._rafId === null) return;
    cancelAnimationFrame(this._rafId);
    this._rafId = null;
    this._eventController.abort();
    this._disposeGraphObjects();
    this._disposeObjectGroup(this.distantGalaxyGroup);
    if (this.bgStarLayers) {
      for (const layer of this.bgStarLayers) {
        layer.points.geometry.dispose();
        layer.points.material.dispose();
      }
      this.bgStarLayers = [];
    }
    if (this.fgDust) {
      this.fgDust.geometry.dispose();
      this.fgDust.material.dispose();
      this.fgDust = null;
    }
    this.glowTexture.dispose();
    this.nebulaTexture.dispose();
    this.starflareTexture.dispose();
    this.controls.removeEventListener('change', this._onCameraChange);
    this.controls.dispose();
    this.bloomPass.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelRenderer.domElement.remove();
  }

  _animate() {
    this._rafId = requestAnimationFrame(() => this._animate());
    const nowPerf = performance.now();
    const frameDelta = nowPerf - this._lastFrameTime;
    this._lastFrameTime = nowPerf;
    const elapsed = this.clock.getElapsedTime();

    // Adaptive low-end device bloom degradation (if sustained <28fps)
    if (this.bloomEnabled && frameDelta > 36 && frameDelta < 500) {
      this._lowFpsFrames++;
      if (this._lowFpsFrames > 90) {
        this.bloomEnabled = false;
        this.renderer.setPixelRatio(1);
      }
    } else if (frameDelta <= 36) {
      this._lowFpsFrames = Math.max(0, this._lowFpsFrames - 1);
    }

    if (this.physicsEnabled) {
      this._stepPhysics(0.016);
      this._syncPositions();
      this.needsRaycast = true;
    }

    const traceActive = this.traceState.active;
    const cycleLen = traceActive ? Math.max(1, this.traceState.maxLayer) + 1.8 : 1;
    const cascadeWave = traceActive ? ((elapsed * 1.45) % cycleLen) - 0.5 : -10;

    // Subtle star twinkle + mastery hollow/review ring orientation + trace cascade pulse
    for (const n of this.nodes) {
      let cascadeBoost = 1.0;
      if (traceActive && this.traceState.nodeIds.has(n.id)) {
        const layer = this.traceState.layerMap.get(n.id) ?? 0;
        const dist = Math.abs(cascadeWave - layer);
        if (dist < 0.75) {
          cascadeBoost = 1.0 + (1 - dist / 0.75) * 0.55;
        }
      }
      const pulse = 1 + Math.sin(elapsed * 2.1 + n.phase) * 0.08;
      const s = n.baseSpriteScale * pulse * cascadeBoost;
      n.glowSprite.scale.set(s, s, 1);

      if (n.hollowRingMesh.visible) {
        n.hollowRingMesh.lookAt(this.camera.position);
      }
      if (n.reviewRingMesh.visible) {
        n.reviewRingMesh.lookAt(this.camera.position);
        const rWave = 0.5 + 0.5 * Math.sin(elapsed * 2.2 + n.phase);
        n.reviewRingMat.opacity = 0.25 + rWave * 0.55;
        n.reviewRingMesh.scale.setScalar(0.95 + rWave * 0.22);
      }
    }

    // Animate domain nebulae rotation & camera-proximity label fade
    for (const neb of this.nebulae) {
      neb.spriteA.material.rotation += 0.00045;
      neb.spriteB.material.rotation -= 0.00032;
      const camDist = this.camera.position.distanceTo(neb.centroid);
      const fade = THREE.MathUtils.clamp((camDist - neb.radius * 1.35) / 28, 0, 1);
      neb.labelEl.style.opacity = String((fade * 0.82).toFixed(2));
      neb.labelObj.visible = fade > 0.04;
    }

    // Animate distant parallel universe spiral galaxies
    for (const g of this.distantGalaxies) {
      const hot = g.universe.id === this.highlightedGalaxyId || this.hoveredGalaxy === g;
      g.spiralPoints.rotation.y += hot ? 0.0045 : 0.0014;
      g.ringMesh.lookAt(this.camera.position);
      g.ringMat.opacity = THREE.MathUtils.lerp(g.ringMat.opacity, hot ? 0.72 : 0.16, 0.12);
      const targetScale = hot ? 1.24 : 1.0 + Math.sin(elapsed * 1.4 + g.phase) * 0.04;
      g.group.scale.setScalar(THREE.MathUtils.lerp(g.group.scale.x, targetScale, 0.12));
    }

    // Animate InstancedMesh directional starlight particles along all edges (source -> target)
    if (this.edgeParticlesMesh && this.edges.length > 0) {
      let instanceIdx = 0;
      for (const e of this.edges) {
        const sPos = e.sourceNode.pos;
        const tPos = e.targetNode.pos;
        _tmpDir.subVectors(tPos, sPos);
        const edgeLen = _tmpDir.length();
        if (edgeLen > 0.001) {
          _tmpDir.divideScalar(edgeLen);
          _tmpQuat.setFromUnitVectors(_upAxis, _tmpDir);
        } else {
          _tmpQuat.identity();
        }

        const isDimmed = e.visualState === 'dimmed';
        const isHot = e.visualState === 'hover' || e.visualState === 'highlighted' || e.visualState === 'trace';
        let speed = e.flowSpeed;
        let cascadeEdgeBoost = 0;

        if (traceActive && this.traceState.edgeSet.has(e)) {
          speed = 0.62;
          const sLayer = this.traceState.layerMap.get(e.sourceNode.id) ?? 0;
          const tLayer = this.traceState.layerMap.get(e.targetNode.id) ?? sLayer + 1;
          if (cascadeWave >= sLayer - 0.45 && cascadeWave <= tLayer + 0.45) {
            const midLayer = (sLayer + tLayer) * 0.5;
            const span = Math.max(0.6, (tLayer - sLayer) * 0.5 + 0.55);
            cascadeEdgeBoost = Math.max(0, 1 - Math.abs(cascadeWave - midLayer) / span);
            e.mat.opacity = 0.75 + cascadeEdgeBoost * 0.25;
            e.arrowMat.opacity = 0.8 + cascadeEdgeBoost * 0.2;
          } else {
            e.mat.opacity = 0.58;
            e.arrowMat.opacity = 0.78;
          }
        }

        for (let k = 0; k < PARTICLES_PER_EDGE; k++) {
          const t = (elapsed * speed + e.pulseOffset + k / PARTICLES_PER_EDGE) % 1;
          _tmpPos.lerpVectors(sPos, tPos, t);

          const baseW = isDimmed ? 0.25 : isHot ? 1.15 : 0.88;
          const fadeTail = 1.15 - t * 0.45;
          const boostScale = 1 + cascadeEdgeBoost * 0.75;
          const w = baseW * fadeTail * boostScale;
          _tmpScale.set(w * 0.8, w * 2.5, w * 0.8);

          _tmpMatrix.compose(_tmpPos, _tmpQuat, _tmpScale);
          this.edgeParticlesMesh.setMatrixAt(instanceIdx, _tmpMatrix);

          if (isDimmed) {
            _tmpColor.copy(e.sourceNode.color).multiplyScalar(0.06);
          } else {
            _tmpColor
              .copy(e.sourceNode.color)
              .lerp(e.targetNode.color, t * 0.75)
              .lerp(WHITE_COLOR, isHot ? 0.48 : 0.32);
            if (cascadeEdgeBoost > 0.05) {
              _tmpColor.lerp(TRACE_PULSE_COLOR, cascadeEdgeBoost * 0.75).multiplyScalar(1 + cascadeEdgeBoost * 0.65);
            } else if (isHot) {
              _tmpColor.multiplyScalar(1.25);
            } else {
              _tmpColor.multiplyScalar(0.95);
            }
          }
          this.edgeParticlesMesh.setColorAt(instanceIdx, _tmpColor);
          instanceIdx++;
        }
      }
      this.edgeParticlesMesh.instanceMatrix.needsUpdate = true;
      if (this.edgeParticlesMesh.instanceColor) {
        this.edgeParticlesMesh.instanceColor.needsUpdate = true;
      }
    }

    // Animate 3D Wormholes (swirling accretion rings & spiral vortex)
    for (const wh of this.wormholes) {
      const isHovered = this.hoveredWormhole === wh;
      const speed = isHovered ? 2.4 : 1.0;
      wh.outerRing.rotation.z += 0.014 * speed;
      wh.midRing.rotation.z -= 0.021 * speed;
      wh.innerRing.lookAt(this.camera.position);
      wh.vortexPoints.rotation.z -= 0.025 * speed;

      const targetScale = isHovered ? 1.24 : 1.0 + Math.sin(elapsed * 2.2 + wh.phase) * 0.05;
      wh.group.scale.setScalar(THREE.MathUtils.lerp(wh.group.scale.x, targetScale, 0.14));
      wh.labelEl.classList.toggle('highlighted', isHovered);
    }

    // Warp transition FOV radial stretch (~600ms)
    if (this.warpAnim) {
      const p = Math.min(1, (nowPerf - this.warpAnim.startTime) / this.warpAnim.duration);
      if (p < 0.45) {
        const k = p / 0.45;
        this.camera.fov = 52 + k * k * 34;
      } else {
        if (!this.warpAnim.midFired) {
          this.warpAnim.midFired = true;
          this.warpAnim.onMidpoint?.();
        }
        const k = (p - 0.45) / 0.55;
        const easeOut = 1 - Math.pow(1 - k, 3);
        this.camera.fov = 86 - easeOut * 34;
      }
      this.camera.updateProjectionMatrix();
      if (p >= 1) {
        this.camera.fov = 52;
        this.camera.updateProjectionMatrix();
        this.warpAnim = null;
      }
    }

    // 3-layer parallax starfield rotation + slow star twinkle + foreground dust drift
    if (!this.reducedMotion) {
      if (this.bgStarLayers) {
        for (const layer of this.bgStarLayers) {
          layer.points.rotation.y += layer.rotSpeed;
          if (layer.twinkle && layer.colorAttr) {
            const arr = layer.colorAttr.array;
            const base = layer.baseColors;
            const phases = layer.phases;
            for (let i = 0; i < layer.count; i += 2) {
              const tw = 0.62 + 0.38 * Math.sin(elapsed * 0.95 + phases[i]);
              arr[i * 3] = base[i * 3] * tw;
              arr[i * 3 + 1] = base[i * 3 + 1] * tw;
              arr[i * 3 + 2] = base[i * 3 + 2] * tw;
            }
            layer.colorAttr.needsUpdate = true;
          }
        }
      }
      if (this.fgDust) {
        this.fgDust.rotation.y -= 0.00045;
        this.fgDust.position.y = Math.sin(elapsed * 0.18) * 1.4;
      }
    }

    // Unified cubic-bezier(0.22, 1, 0.36, 1) camera fly-to (800-1200ms)
    if (this.cameraFlyAnim) {
      const p = Math.min(1, (nowPerf - this.cameraFlyAnim.startTime) / this.cameraFlyAnim.duration);
      const eased = cubicBezierOut(p);
      this.controls.target.lerpVectors(this.cameraFlyAnim.startTarget, this.cameraFlyAnim.endTarget, eased);
      this.camera.position.lerpVectors(this.cameraFlyAnim.startPos, this.cameraFlyAnim.endPos, eased);
      this.needsRaycast = true;
      if (p >= 1) {
        this.cameraFlyAnim = null;
      }
    }

    this.controls.update();
    if (this.needsRaycast && this.pointerInside) {
      this._performRaycast();
    }

    // Throttled screen-space label LOD & collision avoidance (every 3 frames)
    this._labelFrameCounter = (this._labelFrameCounter + 1) % 3;
    if (this._labelFrameCounter === 0) {
      this._updateLabelLODAndCollision();
    }

    if (this.bloomEnabled) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.labelRenderer.render(this.scene, this.camera);
  }
}
