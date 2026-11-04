import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

const PALETTE = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'];
const ENGRAVE_DEPTH = 0.1;
const NON_LAYER_TAGS = new Set(['defs', 'style', 'title', 'desc', 'metadata', 'script']);

const fileInput = document.getElementById('file');
const widthInput = document.getElementById('width');
const heightInput = document.getElementById('height');
const thicknessInput = document.getElementById('thickness');
const renderBtn = document.getElementById('render');
const autoRotateInput = document.getElementById('autorotate');
const statusEl = document.getElementById('status');
const layerPanel = document.getElementById('layer-panel');
const layerList = document.getElementById('layer-list');
const viewport = document.getElementById('viewport');

let svgText = null;
let renderer, scene, camera, controls, mapGroup = null;
const layerEntries = [];
const engraveSet = new Set();
const layerColors = new Map();
let stackItems = null;
let nextGroupId = 1;

init();

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewport.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141922);

  camera = new THREE.PerspectiveCamera(45, viewport.clientWidth / viewport.clientHeight, 0.1, 20000);
  camera.position.set(90, 140, 90);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 2, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x33415c, 1.0));
  const dir = new THREE.DirectionalLight(0xffffff, 1.8);
  dir.position.set(80, 160, 60);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  scene.add(dir);

  const grid = new THREE.GridHelper(600, 60, 0x334455, 0x232d3d);
  grid.position.y = -0.05;
  scene.add(grid);

  window.addEventListener('resize', onResize);
  fileInput.addEventListener('change', onFile);
  renderBtn.addEventListener('click', onRender);
  document.getElementById('add-group').addEventListener('click', () => {
    if (!stackItems) return;
    stackItems.push({ type: 'group', id: nextGroupId++, children: [] });
    renderStackPanel();
  });
  layerList.addEventListener('dragover', (e) => e.preventDefault());
  layerList.addEventListener('drop', (e) => {
    e.preventDefault();
    try {
      handleDrop(JSON.parse(e.dataTransfer.getData('text/plain')), { kind: 'append' });
    } catch { /* ignore malformed drags */ }
  });
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  if (autoRotateInput.checked) controls.autoRotate = true; else controls.autoRotate = false;
  controls.update();
  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = viewport.clientWidth / viewport.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
}

function onFile() {
  const file = fileInput.files[0];
  if (!file) {
    svgText = null;
    renderBtn.disabled = true;
    setStatus('');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    svgText = String(reader.result);
    renderBtn.disabled = false;
    setStatus(`Loaded "${file.name}" — set dimensions and render.`);
  };
  reader.onerror = () => setStatus('Could not read the file.', true);
  reader.readAsText(file);
}

function onRender() {
  if (!svgText) return;
  const wMm = parseFloat(widthInput.value);
  const hMm = parseFloat(heightInput.value);
  const tMm = parseFloat(thicknessInput.value);
  if (!(wMm > 0) || !(hMm > 0) || !(tMm > 0)) {
    setStatus('Width, height and thickness must be positive numbers.', true);
    return;
  }
  engraveSet.clear();
  layerColors.clear();
  stackItems = null;
  try {
    buildMap(svgText, wMm, hMm, tMm);
  } catch (err) {
    console.error(err);
    setStatus(`Render failed: ${err.message}`, true);
  }
}

function rebuild() {
  if (!svgText) return;
  const wMm = parseFloat(widthInput.value);
  const hMm = parseFloat(heightInput.value);
  const tMm = parseFloat(thicknessInput.value);
  if (!(wMm > 0) || !(hMm > 0) || !(tMm > 0)) {
    setStatus('Width, height and thickness must be positive numbers.', true);
    return;
  }
  try {
    buildMap(svgText, wMm, hMm, tMm);
  } catch (err) {
    console.error(err);
    setStatus(`Render failed: ${err.message}`, true);
  }
}

function parseViewBox(svg) {
  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const p = vb.trim().split(/[\s,]+/).map(Number);
    if (p.length === 4 && p.every(n => Number.isFinite(n)) && p[2] > 0 && p[3] > 0) {
      return { minX: p[0], minY: p[1], w: p[2], h: p[3] };
    }
  }
  const w = parseFloat(svg.getAttribute('width')) || 100;
  const h = parseFloat(svg.getAttribute('height')) || 100;
  return { minX: 0, minY: 0, w, h };
}

function layerName(el, index) {
  const tag = el.tagName.toLowerCase();
  const id = el.getAttribute('id');
  const cls = el.getAttribute('class');
  let name = `Layer ${index + 1} <${tag}>`;
  if (id) name += ` #${id}`;
  else if (cls) name += ` .${cls.split(/\s+/)[0]}`;
  return name;
}

function resolveColor(style, fallback) {
  const fill = style && style.fill;
  const stroke = style && style.stroke;
  const candidate = fill && fill !== 'none' ? fill : stroke;
  if (candidate && candidate !== 'none' && candidate !== 'transparent') {
    try {
      const c = new THREE.Color();
      c.set(candidate);
      return c;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function buildMap(text, wMm, hMm, tMm) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('the SVG file is not well-formed XML');
  const svg = doc.documentElement;
  if (!svg || svg.tagName.toLowerCase() !== 'svg') throw new Error('no <svg> root element found');

  const vb = parseViewBox(svg);
  const sx = wMm / vb.w;
  const sy = hMm / vb.h;

  const styleText = [...svg.querySelectorAll('style')].map(s => s.textContent).join('\n');
  const styleTag = styleText ? `<style>${styleText}</style>` : '';

  const layers = [...svg.children].filter(el => !NON_LAYER_TAGS.has(el.tagName.toLowerCase()));
  if (layers.length === 0) throw new Error('the SVG has no drawable layers');
  if (!stackItems) stackItems = layers.map((_, i) => ({ type: 'layer', index: i }));

  if (mapGroup) {
    scene.remove(mapGroup);
    mapGroup.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
  mapGroup = new THREE.Group();
  scene.add(mapGroup);
  layerEntries.length = 0;

  const loader = new SVGLoader();
  let base = 0;
  let built = 0;

  const extractShapes = (el) => {
    const layerSvg = `<svg xmlns="http://www.w3.org/2000/svg">${styleTag}${el.outerHTML}</svg>`;
    const data = loader.parse(layerSvg);
    const shapes = [];
    let style = null;
    for (const path of data.paths) {
      shapes.push(...SVGLoader.createShapes(path));
      if (!style) style = path.userData && path.userData.style;
    }
    return { shapes, style };
  };

  for (const item of stackItems) {
    const indices = item.type === 'group' ? item.children : [item.index];
    if (indices.length === 0) continue;
    const advance = !(item.type === 'layer' && engraveSet.has(item.index));
    for (const i of indices) {
      const { shapes, style } = extractShapes(layers[i]);
      if (shapes.length === 0) continue;
      const engraved = engraveSet.has(i);
      const depth = engraved ? ENGRAVE_DEPTH : tMm;
      const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth,
        bevelEnabled: false,
        curveSegments: 24
      });
      geometry.scale(sx, sy, 1);
      geometry.rotateX(Math.PI / 2);
      geometry.translate(-(vb.minX + vb.w / 2) * sx, base + depth, -(vb.minY + vb.h / 2) * sy);

      const stored = layerColors.get(i);
      const color = stored ? new THREE.Color(stored) : resolveColor(style, new THREE.Color(PALETTE[built % PALETTE.length]));
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.55,
        metalness: 0.05
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mapGroup.add(mesh);
      layerEntries.push({ name: layerName(layers[i], i), material, base, top: base + depth, engraved, index: i });
      built++;
    }
    if (advance) base += tMm;
  }

  if (built === 0) throw new Error('no geometry could be extracted from the SVG layers');

  fitCamera();
  populateLayerPanel(tMm);
  layerPanel.hidden = false;
  setStatus(`Rendered ${built} layer${built === 1 ? '' : 's'} — ${wMm}×${hMm} mm, ${tMm} mm per layer.`);
}

function fitCamera() {
  const box = new THREE.Box3().setFromObject(mapGroup);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.z) / 2;
  const dist = Math.max(radius * 2.2, size.y * 3, 20);
  camera.position.set(center.x + dist * 0.75, center.y + dist, center.z + dist * 0.75);
  controls.target.copy(center);
  controls.update();
}

function populateLayerPanel() {
  renderStackPanel();
}

function locateLayer(index) {
  for (const item of stackItems) {
    if (item.type === 'layer' && item.index === index) return { item, pos: 0 };
    if (item.type === 'group') {
      const p = item.children.indexOf(index);
      if (p !== -1) return { item, pos: p };
    }
  }
  return null;
}

function removeLayer(index) {
  const loc = locateLayer(index);
  if (!loc) return;
  if (loc.item.type === 'layer') stackItems.splice(stackItems.indexOf(loc.item), 1);
  else loc.item.children.splice(loc.pos, 1);
}

function handleDrop(drag, target) {
  if (target.kind === 'append') {
    if (drag.kind === 'layer') {
      removeLayer(drag.index);
      stackItems.push({ type: 'layer', index: drag.index });
    } else {
      const gi = stackItems.findIndex(it => it.type === 'group' && it.id === drag.id);
      if (gi === -1) return;
      const g = stackItems[gi];
      stackItems.splice(gi, 1);
      stackItems.push(g);
    }
    renderStackPanel();
    rebuild();
    return;
  }
  if (drag.kind === 'layer') {
    if (target.kind === 'layer' && drag.index === target.index) return;
    removeLayer(drag.index);
    if (target.kind === 'group') {
      const g = stackItems.find(it => it.type === 'group' && it.id === target.id);
      if (g) g.children.push(drag.index);
    } else {
      const loc = locateLayer(target.index);
      if (!loc) return;
      if (loc.item.type === 'group') loc.item.children.splice(loc.pos + (target.after ? 1 : 0), 0, drag.index);
      else stackItems.splice(stackItems.indexOf(loc.item) + (target.after ? 1 : 0), 0, { type: 'layer', index: drag.index });
    }
  } else {
    const gi = stackItems.findIndex(it => it.type === 'group' && it.id === drag.id);
    if (gi === -1) return;
    const g = stackItems[gi];
    stackItems.splice(gi, 1);
    if (target.kind === 'group') {
      const tp = stackItems.findIndex(it => it.type === 'group' && it.id === target.id);
      stackItems.splice(tp === -1 ? stackItems.length : tp, 0, g);
    } else {
      const loc = locateLayer(target.index);
      stackItems.splice(loc ? stackItems.indexOf(loc.item) + (target.after ? 1 : 0) : stackItems.length, 0, g);
    }
  }
  renderStackPanel();
  rebuild();
}

function makeDraggable(el, drag, target) {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify(drag));
    e.dataTransfer.effectAllowed = 'move';
  });
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('drag-over');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('drag-over');
    try {
      const drag = JSON.parse(e.dataTransfer.getData('text/plain'));
      let t = target;
      if (t.kind === 'layer' && e.offsetY > el.offsetHeight / 2) t = { ...t, after: true };
      handleDrop(drag, t);
    } catch { /* ignore malformed drags */ }
  });
}

function layerRow(i) {
  const entry = layerEntries.find(e => e.index === i);
  const li = document.createElement('li');
  li.className = 'layer-row';
  const picker = document.createElement('input');
  picker.type = 'color';
  picker.value = `#${entry.material.color.getHexString()}`;
  picker.addEventListener('input', () => {
    layerColors.set(i, picker.value);
    entry.material.color.set(picker.value);
  });
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = entry.name;
  name.title = entry.name;
  const engrave = document.createElement('input');
  engrave.type = 'checkbox';
  engrave.checked = entry.engraved;
  engrave.title = `Engrave only: thin ${ENGRAVE_DEPTH} mm plate on the layer below, adds no stack height`;
  engrave.addEventListener('change', () => {
    if (engrave.checked) engraveSet.add(i); else engraveSet.delete(i);
    rebuild();
  });
  const height = document.createElement('span');
  height.className = 'height';
  height.textContent = entry.engraved ? `engraved (${ENGRAVE_DEPTH} mm)` : `${entry.base.toFixed(1)}–${entry.top.toFixed(1)} mm`;
  li.append(picker, name, engrave, height);
  makeDraggable(li, { kind: 'layer', index: i }, { kind: 'layer', index: i });
  return li;
}

function groupItem(item) {
  const li = document.createElement('li');
  li.className = 'group';
  const header = document.createElement('div');
  header.className = 'group-header';
  const label = document.createElement('span');
  label.className = 'name';
  label.textContent = `Group ${item.id} (${item.children.length})`;
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'mini';
  del.textContent = '×';
  del.title = 'Dissolve group: layers become top-level at this position';
  del.addEventListener('click', () => {
    const pos = stackItems.indexOf(item);
    stackItems.splice(pos, 1, ...item.children.map(index => ({ type: 'layer', index })));
    renderStackPanel();
    rebuild();
  });
  header.append(label, del);
  const children = document.createElement('ul');
  children.className = 'group-children';
  item.children.forEach(ci => children.appendChild(layerRow(ci)));
  makeDraggable(children, { kind: 'group', id: item.id }, { kind: 'group', id: item.id });
  li.append(header, children);
  makeDraggable(li, { kind: 'group', id: item.id }, { kind: 'group', id: item.id });
  return li;
}

function renderStackPanel() {
  if (!stackItems) return;
  layerList.innerHTML = '';
  stackItems.forEach(item => {
    layerList.appendChild(item.type === 'group' ? groupItem(item) : layerRow(item.index));
  });
  layerPanel.querySelector('.hint').textContent =
    'First in the list is the bottom layer. Drag rows to reorder; drag a layer onto a group to group it (layers in a group share one height level). Tick a checkbox to engrave. Drag in the 3D view to orbit.';
}
