import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CATEGORIES } from './data/knowledgeGraph.js';

function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.85)');
  grad.addColorStop(0.16, 'rgba(255, 255, 255, 0.45)');
  grad.addColorStop(0.42, 'rgba(255, 255, 255, 0.14)');
  grad.addColorStop(0.75, 'rgba(255, 255, 255, 0.03)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

const CLUSTER_ANCHORS = {
  matrix: new THREE.Vector3(-26, 16, -12),
  decomp: new THREE.Vector3(10, 22, -4),
  cluster: new THREE.Vector3(-22, -16, 16),
  discriminant: new THREE.Vector3(16, -18, -14),
  optim: new THREE.Vector3(-4, 2, -24),
  ml: new THREE.Vector3(28, -4, 14),
  dl: new THREE.Vector3(24, 18, 22),
};

export class StarMapScene {
  constructor(container, { onHoverNode, onHoverEdge, onHoverWormhole, onHoverClear, onSelectNode, onClickWormhole }) {
    this.container = container;
    this.callbacks = { onHoverNode, onHoverEdge, onHoverWormhole, onHoverClear, onSelectNode, onClickWormhole };

    this.nodes = [];
    this.edges = [];
    this.wormholes = [];
    this.nodeMap = new Map();

    this.physicsEnabled = false;
    this.autoOrbit = false;
    this.showLabels = true;
    this.activeCategory = 'all';
    this.searchQuery = '';

    this.hoveredNode = null;
    this.hoveredEdge = null;
    this.hoveredWormhole = null;
    this.selectedNode = null;

    this.cameraFlyTarget = null;
    this.cameraFlyPos = null;

    this.pointer = new THREE.Vector2(-999, -999);
    this.pointerScreen = { x: 0, y: 0 };
    this.isPointerDown = false;
    this.pointerDownPos = { x: 0, y: 0 };

    this.glowTexture = createGlowTexture();
    this.clock = new THREE.Clock();

    this._initScene();
    this._initBackgroundCosmos();
    this._bindEvents();
    this._animate();
  }

  _initScene() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x03050c, 0.0042);

    this.camera = new THREE.PerspectiveCamera(52, width / height, 0.5, 800);
    this.camera.position.set(0, 20, 102);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.container.appendChild(this.renderer.domElement);

    // CSS2D Renderer for crisp star names
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(width, height);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.left = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.container.appendChild(this.labelRenderer.domElement);

    // Post-processing UnrealBloom (subtle, non-blinding)
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.34, 0.4, 0.48);
    this.composer.addPass(this.bloomPass);

    // OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.rotateSpeed = 0.65;
    this.controls.zoomSpeed = 0.9;
    this.controls.minDistance = 16;
    this.controls.maxDistance = 210;
    this.controls.autoRotate = this.autoOrbit;
    this.controls.autoRotateSpeed = 0.42;

    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Line.threshold = 1.65;

    this.graphGroup = new THREE.Group();
    this.scene.add(this.graphGroup);

    this.nodeHitMeshes = [];
    this.edgeLines = [];
    this.wormholeHitMeshes = [];
  }

  _initBackgroundCosmos() {
    // Distant twinkling starfield
    const starCount = 1600;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    const palette = [
      new THREE.Color('#cbd5e1'),
      new THREE.Color('#93c5fd'),
      new THREE.Color('#fde68a'),
      new THREE.Color('#c4b5fd'),
    ];

    for (let i = 0; i < starCount; i++) {
      const r = 110 + Math.random() * 240;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const c = palette[Math.floor(Math.random() * palette.length)];
      const dim = 0.35 + Math.random() * 0.65;
      colors[i * 3] = c.r * dim;
      colors[i * 3 + 1] = c.g * dim;
      colors[i * 3 + 2] = c.b * dim;
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const starMat = new THREE.PointsMaterial({
      size: 0.95,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });

    this.bgStars = new THREE.Points(starGeo, starMat);
    this.scene.add(this.bgStars);
  }

  setGraphData(rawNodes, rawLinks, categories = CATEGORIES, anchors = null, wormholes = []) {
    this.categories = categories || CATEGORIES;
    this.clusterAnchors = {};
    if (anchors) {
      for (const [k, arr] of Object.entries(anchors)) {
        this.clusterAnchors[k] = new THREE.Vector3(arr[0], arr[1], arr[2]);
      }
    } else {
      Object.assign(this.clusterAnchors, CLUSTER_ANCHORS);
    }

    // Preserve existing positions if updating
    const prevPositions = new Map();
    for (const n of this.nodes) {
      prevPositions.set(n.id, n.pos.clone());
    }

    // Clear previous 3D objects
    while (this.graphGroup.children.length > 0) {
      const child = this.graphGroup.children[0];
      this.graphGroup.remove(child);
    }
    this.labelRenderer.domElement.innerHTML = '';

    this.nodes = [];
    this.edges = [];
    this.wormholes = [];
    this.nodeMap.clear();
    this.nodeHitMeshes = [];
    this.edgeLines = [];
    this.wormholeHitMeshes = [];

    // Count degrees for star sizing
    const degreeMap = new Map();
    rawNodes.forEach((n) => degreeMap.set(n.id, 0));
    rawLinks.forEach((l) => {
      degreeMap.set(l.source, (degreeMap.get(l.source) || 0) + 1);
      degreeMap.set(l.target, (degreeMap.get(l.target) || 0) + 1);
    });

    const fallbackCat = Object.values(this.categories)[0] || { color: '#38bdf8' };

    // Build nodes
    rawNodes.forEach((raw, idx) => {
      const degree = degreeMap.get(raw.id) || 0;
      const cat = this.categories[raw.category] || fallbackCat;
      const color = new THREE.Color(cat.color);
      const anchor = this.clusterAnchors[raw.category] || new THREE.Vector3();

      const pos = prevPositions.get(raw.id) || new THREE.Vector3(
        anchor.x + (Math.random() - 0.5) * 26,
        anchor.y + (Math.random() - 0.5) * 26,
        anchor.z + (Math.random() - 0.5) * 26
      );

      const radius = 0.48 + Math.min(degree, 8) * 0.07;

      const nodeGroup = new THREE.Group();
      nodeGroup.position.copy(pos);

      // Core sphere
      const coreGeo = new THREE.SphereGeometry(radius, 20, 20);
      const coreMat = new THREE.MeshBasicMaterial({
        color: color.clone().lerp(new THREE.Color('#ffffff'), 0.14),
        transparent: true,
        opacity: 0.9,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      nodeGroup.add(coreMesh);

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
      const spriteScale = radius * 4.2;
      glowSprite.scale.set(spriteScale, spriteScale, 1);
      coreMesh.add(glowSprite);

      // Invisible hit sphere for easy hovering
      const hitGeo = new THREE.SphereGeometry(radius * 2.2, 12, 12);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      nodeGroup.add(hitMesh);

      // CSS2D label (attached to unscaled nodeGroup so it never shifts on hover)
      const labelEl = document.createElement('div');
      labelEl.className = 'star-label';
      labelEl.textContent = raw.name;
      const labelObj = new CSS2DObject(labelEl);
      labelObj.position.set(0, -radius * 1.15, 0);
      nodeGroup.add(labelObj);

      const nodeObj = {
        ...raw,
        degree,
        color,
        radius,
        baseSpriteScale: spriteScale,
        pos,
        vel: new THREE.Vector3(),
        phase: idx * 0.9 + Math.random() * 2,
        mesh: nodeGroup,
        coreMesh,
        coreMat,
        glowSprite,
        spriteMat,
        hitMesh,
        labelEl,
        labelObj,
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

    // Shared geometries for directed arrowheads & pulses
    const arrowGeo = new THREE.ConeGeometry(0.24, 0.78, 10);

    // Build directed edges
    rawLinks.forEach((raw, idx) => {
      const sourceNode = this.nodeMap.get(raw.source);
      const targetNode = this.nodeMap.get(raw.target);
      if (!sourceNode || !targetNode) return;

      sourceNode.neighbors.add(targetNode.id);
      targetNode.neighbors.add(sourceNode.id);
      sourceNode.outDegree += 1;
      targetNode.inDegree += 1;

      const positions = new Float32Array(6);
      const colors = new Float32Array([
        sourceNode.color.r, sourceNode.color.g, sourceNode.color.b,
        targetNode.color.r, targetNode.color.g, targetNode.color.b,
      ]);

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const mat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const line = new THREE.Line(geo, mat);

      // Directed arrowhead near target star
      const arrowMat = new THREE.MeshBasicMaterial({
        color: targetNode.color,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      });
      const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
      this.graphGroup.add(arrowMesh);

      // Directional starlight pulse traveling source -> target
      const pulseMat = new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: sourceNode.color.clone().lerp(targetNode.color, 0.5),
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const pulseSprite = new THREE.Sprite(pulseMat);
      pulseSprite.scale.set(0.85, 0.85, 1);
      this.graphGroup.add(pulseSprite);

      const edgeObj = {
        ...raw,
        sourceNode,
        targetNode,
        line,
        geo,
        mat,
        arrowMesh,
        arrowMat,
        pulseSprite,
        pulseMat,
        pulseOffset: (idx * 0.27) % 1,
      };
      line.userData = { type: 'edge', edge: edgeObj };

      this.edgeLines.push(line);
      this.graphGroup.add(line);
      this.edges.push(edgeObj);
    });

    // Build 3D Wormholes (spacetime portals to other parallel universes)
    (wormholes || []).forEach((whRaw, idx) => {
      const anchorNode = this.nodeMap.get(whRaw.anchorNodeId);
      if (!anchorNode) return;

      const whColor = new THREE.Color(whRaw.color || '#a78bfa');
      const whGroup = new THREE.Group();

      // 1. Dark Event Horizon Core
      const voidGeo = new THREE.SphereGeometry(1.1, 24, 24);
      const voidMat = new THREE.MeshBasicMaterial({ color: 0x02030a });
      const voidMesh = new THREE.Mesh(voidGeo, voidMat);
      whGroup.add(voidMesh);

      // 2. Inner Event Horizon Glow Ring
      const innerRingGeo = new THREE.TorusGeometry(1.32, 0.085, 16, 48);
      const innerRingMat = new THREE.MeshBasicMaterial({
        color: whColor.clone().lerp(new THREE.Color('#ffffff'), 0.45),
        transparent: true,
        opacity: 0.92,
      });
      const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
      whGroup.add(innerRing);

      // 3. Outer Tilted Accretion Disk Rings
      const outerRingGeo = new THREE.TorusGeometry(2.3, 0.055, 16, 64);
      const outerRingMat = new THREE.MeshBasicMaterial({
        color: whColor,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
      outerRing.rotation.x = Math.PI * 0.36;
      outerRing.rotation.y = Math.PI * 0.14;
      whGroup.add(outerRing);

      const midRingGeo = new THREE.TorusGeometry(1.85, 0.04, 14, 56);
      const midRingMat = new THREE.MeshBasicMaterial({
        color: whColor.clone().lerp(new THREE.Color('#38bdf8'), 0.4),
        transparent: true,
        opacity: 0.65,
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
      whGroup.add(hitMesh);

      // 6. CSS2D Wormhole Label
      const labelEl = document.createElement('div');
      labelEl.className = 'wormhole-label';
      labelEl.innerHTML = `<span class="wh-icon">🌀</span> 虫洞 → ${whRaw.targetLabel || whRaw.targetUniverseId}`;
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
        phase: idx * 1.7,
        pos: new THREE.Vector3(),
      };

      hitMesh.userData = { type: 'wormhole', wormhole: whObj };
      this.wormholeHitMeshes.push(hitMesh);
      this.graphGroup.add(whGroup);
      this.wormholes.push(whObj);
    });

    // Run a full warm-up of physics so initial layout is settled and labels stay still
    for (let i = 0; i < 160; i++) {
      this._stepPhysics(0.016);
    }
    this._syncPositions();
    this._applyVisualStates();
  }

  _stepPhysics(dt) {
    const nCount = this.nodes.length;
    if (nCount === 0) return;

    const repulsion = 200;
    const springK = 0.04;
    const restLength = 15.0;
    const centerGravity = 0.012;
    const clusterGravity = 0.024;
    const damping = 0.86;

    // Repulsion between all pairs
    for (let i = 0; i < nCount; i++) {
      const a = this.nodes[i];
      for (let j = i + 1; j < nCount; j++) {
        const b = this.nodes[j];
        const dx = a.pos.x - b.pos.x;
        const dy = a.pos.y - b.pos.y;
        const dz = a.pos.z - b.pos.z;
        let distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < 1.2) distSq = 1.2;
        const dist = Math.sqrt(distSq);
        const force = repulsion / distSq;
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
      // Clamp velocity
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
    const dirVec = new THREE.Vector3();
    for (const e of this.edges) {
      const posAttr = e.geo.getAttribute('position');
      posAttr.setXYZ(0, e.sourceNode.pos.x, e.sourceNode.pos.y, e.sourceNode.pos.z);
      posAttr.setXYZ(1, e.targetNode.pos.x, e.targetNode.pos.y, e.targetNode.pos.z);
      posAttr.needsUpdate = true;
      e.geo.computeBoundingSphere();

      // Position & orient arrowhead just before target star
      dirVec.subVectors(e.targetNode.pos, e.sourceNode.pos);
      const len = dirVec.length();
      if (len > 0.001) {
        dirVec.divideScalar(len);
        const offset = e.targetNode.radius + 0.68;
        e.arrowMesh.position.copy(e.targetNode.pos).addScaledVector(dirVec, -Math.min(offset, len * 0.45));
        e.arrowMesh.quaternion.setFromUnitVectors(upVec, dirVec);
      }
    }

    // Position wormholes radially outside their anchor stars
    const radialDir = new THREE.Vector3();
    for (const wh of this.wormholes) {
      radialDir.copy(wh.anchorNode.pos);
      if (radialDir.lengthSq() < 1) {
        radialDir.set(1, 0.5, 0.5);
      }
      radialDir.normalize();
      wh.pos.copy(wh.anchorNode.pos).addScaledVector(radialDir, 9.5);
      wh.group.position.copy(wh.pos);

      const tAttr = wh.tetherGeo.getAttribute('position');
      tAttr.setXYZ(0, wh.anchorNode.pos.x, wh.anchorNode.pos.y, wh.anchorNode.pos.z);
      tAttr.setXYZ(1, wh.pos.x, wh.pos.y, wh.pos.z);
      tAttr.needsUpdate = true;
      wh.tetherLine.computeLineDistances();
      wh.tetherGeo.computeBoundingSphere();
    }
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
    const focusNode = this.hoveredNode || this.selectedNode;
    const focusEdge = this.hoveredNode ? null : this.hoveredEdge;
    const hasFilter = this.activeCategory !== 'all' || this.searchQuery.length > 0;

    for (const n of this.nodes) {
      const matchesFilter = this._isNodeMatchingFilter(n);
      let state = 'normal';

      if (focusNode) {
        if (n.id === focusNode.id) state = 'primary';
        else if (focusNode.neighbors.has(n.id)) state = 'neighbor';
        else state = 'dimmed';
      } else if (focusEdge) {
        if (n.id === focusEdge.sourceNode.id || n.id === focusEdge.targetNode.id) state = 'primary';
        else state = 'dimmed';
      } else if (hasFilter) {
        state = matchesFilter ? 'primary' : 'dimmed';
      }

      if (state === 'primary') {
        n.coreMat.opacity = 1.0;
        n.spriteMat.opacity = 0.78;
        n.coreMesh.scale.setScalar(1.28);
        n.labelEl.classList.add('highlighted');
        n.labelEl.classList.remove('dimmed');
      } else if (state === 'neighbor') {
        n.coreMat.opacity = 0.92;
        n.spriteMat.opacity = 0.56;
        n.coreMesh.scale.setScalar(1.1);
        n.labelEl.classList.remove('highlighted', 'dimmed');
      } else if (state === 'dimmed') {
        n.coreMat.opacity = 0.14;
        n.spriteMat.opacity = 0.06;
        n.coreMesh.scale.setScalar(0.84);
        n.labelEl.classList.remove('highlighted');
        n.labelEl.classList.add('dimmed');
      } else {
        n.coreMat.opacity = 0.88;
        n.spriteMat.opacity = 0.44;
        n.coreMesh.scale.setScalar(1.0);
        n.labelEl.classList.remove('highlighted', 'dimmed');
      }

      n.labelObj.visible = this.showLabels || state === 'primary' || state === 'neighbor';
    }

    for (const e of this.edges) {
      let highlighted = false;
      let dimmed = false;

      if (focusNode) {
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
        e.mat.opacity = 0.95;
        e.arrowMat.opacity = 0.96;
        e.arrowMesh.scale.setScalar(1.22);
        e.pulseMat.opacity = 0.85;
      } else if (dimmed) {
        e.mat.opacity = 0.05;
        e.arrowMat.opacity = 0.06;
        e.arrowMesh.scale.setScalar(0.8);
        e.pulseMat.opacity = 0.04;
      } else {
        e.mat.opacity = 0.34;
        e.arrowMat.opacity = 0.65;
        e.arrowMesh.scale.setScalar(1.0);
        e.pulseMat.opacity = 0.48;
      }
    }
  }

  _performRaycast() {
    if (this.pointer.x < -1 || this.pointer.x > 1) return;

    this.raycaster.setFromCamera(this.pointer, this.camera);

    // 0. Check wormholes first
    const whHits = this.raycaster.intersectObjects(this.wormholeHitMeshes, false);
    if (whHits.length > 0) {
      const hitWh = whHits[0].object.userData.wormhole;
      if (this.hoveredWormhole !== hitWh || this.hoveredNode !== null || this.hoveredEdge !== null) {
        this.hoveredWormhole = hitWh;
        this.hoveredNode = null;
        this.hoveredEdge = null;
        this.container.classList.add('pointer-cursor');
        this._applyVisualStates();
      }
      if (this.callbacks.onHoverWormhole) {
        this.callbacks.onHoverWormhole(hitWh, this.pointerScreen);
      }
      return;
    }

    // 1. Check nodes
    const nodeHits = this.raycaster.intersectObjects(this.nodeHitMeshes, false);
    if (nodeHits.length > 0) {
      const hitNode = nodeHits[0].object.userData.node;
      if (this.hoveredNode !== hitNode || this.hoveredEdge !== null || this.hoveredWormhole !== null) {
        this.hoveredNode = hitNode;
        this.hoveredEdge = null;
        this.hoveredWormhole = null;
        this.container.classList.add('pointer-cursor');
        this._applyVisualStates();
      }
      this.callbacks.onHoverNode(hitNode, this.pointerScreen);
      return;
    }

    // 2. Check edges next
    const edgeHits = this.raycaster.intersectObjects(this.edgeLines, false);
    if (edgeHits.length > 0) {
      const hitEdge = edgeHits[0].object.userData.edge;
      if (this.hoveredEdge !== hitEdge || this.hoveredNode !== null || this.hoveredWormhole !== null) {
        this.hoveredEdge = hitEdge;
        this.hoveredNode = null;
        this.hoveredWormhole = null;
        this.container.classList.add('pointer-cursor');
        this._applyVisualStates();
      }
      this.callbacks.onHoverEdge(hitEdge, this.pointerScreen);
      return;
    }

    // 3. Clear hover
    if (this.hoveredNode !== null || this.hoveredEdge !== null || this.hoveredWormhole !== null) {
      this.hoveredNode = null;
      this.hoveredEdge = null;
      this.hoveredWormhole = null;
      this.container.classList.remove('pointer-cursor');
      this._applyVisualStates();
      this.callbacks.onHoverClear();
    }
  }

  focusOnNode(nodeId) {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;
    this.selectedNode = node;
    this._applyVisualStates();

    // Compute smooth camera fly-to destination
    const offsetDir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (offsetDir.lengthSq() < 0.01) offsetDir.set(0, 0.3, 1).normalize();
    this.cameraFlyTarget = node.pos.clone();
    this.cameraFlyPos = node.pos.clone().add(offsetDir.multiplyScalar(34));

    this.callbacks.onSelectNode(node);
  }

  clearSelection() {
    this.selectedNode = null;
    this._applyVisualStates();
    this.callbacks.onSelectNode(null);
  }

  resetView() {
    this.selectedNode = null;
    this.cameraFlyTarget = new THREE.Vector3(0, 0, 0);
    this.cameraFlyPos = new THREE.Vector3(0, 20, 102);
    this._applyVisualStates();
    this.callbacks.onSelectNode(null);
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

    dom.addEventListener('pointermove', (e) => {
      const rect = dom.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.pointerScreen = { x: e.clientX, y: e.clientY };
    });

    dom.addEventListener('pointerdown', (e) => {
      this.isPointerDown = true;
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
      // Cancel fly-to if user grabs camera
      this.cameraFlyTarget = null;
      this.cameraFlyPos = null;
    });

    dom.addEventListener('pointerup', (e) => {
      if (!this.isPointerDown) return;
      this.isPointerDown = false;
      const dx = e.clientX - this.pointerDownPos.x;
      const dy = e.clientY - this.pointerDownPos.y;
      const moved = Math.hypot(dx, dy);

      if (moved < 5) {
        if (this.hoveredWormhole && this.callbacks.onClickWormhole) {
          this.callbacks.onClickWormhole(this.hoveredWormhole);
        } else if (this.hoveredNode) {
          this.focusOnNode(this.hoveredNode.id);
        } else {
          this.clearSelection();
        }
      }
    });

    dom.addEventListener('pointerleave', () => {
      this.pointer.set(-999, -999);
      this.hoveredNode = null;
      this.hoveredEdge = null;
      this.hoveredWormhole = null;
      this._applyVisualStates();
      this.callbacks.onHoverClear();
    });

    window.addEventListener('resize', () => {
      const width = this.container.clientWidth || window.innerWidth;
      const height = this.container.clientHeight || window.innerHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      this.labelRenderer.setSize(width, height);
      this.composer.setSize(width, height);
    });
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const elapsed = this.clock.getElapsedTime();

    if (this.physicsEnabled) {
      this._stepPhysics(0.016);
      this._syncPositions();
    }

    // Subtle star twinkle
    for (const n of this.nodes) {
      const pulse = 1 + Math.sin(elapsed * 2.1 + n.phase) * 0.08;
      const s = n.baseSpriteScale * pulse;
      n.glowSprite.scale.set(s, s, 1);
    }

    // Animate directional starlight pulses along edges (source -> target)
    for (const e of this.edges) {
      const t = (elapsed * 0.36 + e.pulseOffset) % 1;
      e.pulseSprite.position.lerpVectors(e.sourceNode.pos, e.targetNode.pos, t);
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
      wh.group.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.14);
      wh.labelEl.classList.toggle('highlighted', isHovered);
    }

    // Slow cosmos rotation
    if (this.bgStars) {
      this.bgStars.rotation.y += 0.00025;
    }

    // Smooth camera fly-to
    if (this.cameraFlyTarget && this.cameraFlyPos) {
      this.controls.target.lerp(this.cameraFlyTarget, 0.08);
      this.camera.position.lerp(this.cameraFlyPos, 0.08);
      if (this.camera.position.distanceTo(this.cameraFlyPos) < 0.35) {
        this.cameraFlyTarget = null;
        this.cameraFlyPos = null;
      }
    }

    this.controls.update();
    this._performRaycast();

    this.composer.render();
    this.labelRenderer.render(this.scene, this.camera);
  }
}
