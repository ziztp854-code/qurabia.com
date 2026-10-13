import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
const { crops, buildingTypes, buildSlots } = window.FarmGame;

// Original village geometry with physical stone, timber, soil and terracotta materials.
export function createWorld(host, onSelect) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc7e4e9);
  scene.fog = new THREE.Fog(0xc7e4e9, 55, 110);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 180);
  camera.position.set(25, 30, 32);
  const mobile = window.innerWidth < 700;
  const renderer = new THREE.WebGLRenderer({
    antialias: !mobile,
    alpha: false,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1 : 1.5));
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.domElement.setAttribute('aria-label', 'عالم مزرعة السلطان ثلاثي الأبعاد');
  host.prepend(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 14;
  controls.maxDistance = 65;
  controls.maxPolarAngle = Math.PI / 2.25;
  controls.minPolarAngle = 0.3;
  controls.enablePan = true;
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  const cameraChange = () => {
    host.dataset.camera = [
      camera.position.x,
      camera.position.y,
      camera.position.z,
      controls.target.x,
      controls.target.z,
    ]
      .map((n) => n.toFixed(2))
      .join(',');
  };
  controls.addEventListener('change', cameraChange);
  cameraChange();
  scene.add(new THREE.HemisphereLight(0xfff4dd, 0x688876, 2.3));
  const sun = new THREE.DirectionalLight(0xffeccd, 3.2);
  sun.position.set(-14, 28, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -25,
    right: 25,
    top: 25,
    bottom: -25,
    near: 0.5,
    far: 80,
  });
  sun.shadow.bias = -0.002;
  scene.add(sun);
  const textures = new Map();
  function surfaceTexture(kind) {
    if (textures.has(kind)) return textures.get(kind);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const palettes = {
      stone: [184, 165, 132],
      roof: [151, 86, 58],
      wood: [140, 112, 76],
      grass: [106, 139, 72],
      soil: [112, 86, 56],
      path: [167, 153, 120],
    };
    const color = palettes[kind];
    let seed = 731;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    ctx.fillStyle = `rgb(${color.join(',')})`;
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 16000; i++) {
      const v = Math.floor((random() - 0.5) * 38);
      ctx.fillStyle = `rgba(${color.map((c) => Math.max(0, Math.min(255, c + v))).join(',')},.5)`;
      ctx.fillRect(
        random() * 512,
        random() * 512,
        kind === 'grass' ? 2 : 1,
        kind === 'grass' ? 4 : 2,
      );
    }
    if (['stone', 'roof', 'path'].includes(kind))
      for (let row = 0; row < 16; row++)
        for (let col = -1; col < 8; col++) {
          const x = col * 64 + (row % 2) * 32,
            y = row * 32;
          ctx.strokeStyle = kind === 'roof' ? 'rgba(65,42,25,.45)' : 'rgba(78,72,58,.33)';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, 64, 32);
          ctx.strokeStyle = 'rgba(230,220,185,.24)';
          ctx.strokeRect(x + 2, y + 2, 60, 28);
        }
    if (kind === 'wood')
      for (let i = 0; i < 12; i++) {
        ctx.strokeStyle = 'rgba(70,45,29,.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(i * 43, 0);
        ctx.lineTo(i * 43, 512);
        ctx.stroke();
        for (let j = 0; j < 5; j++) {
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(i * 43 + random() * 40, 0);
          ctx.bezierCurveTo(i * 43 + 12, 150, i * 43 + 31, 330, i * 43 + random() * 40, 512);
          ctx.stroke();
        }
      }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    textures.set(kind, texture);
    return texture;
  }
  const wallColors = new Set([
    ...Object.values(buildingTypes).map((b) => b.color),
    0xe5d3aa,
    0xe4dbc2,
    0xcb8566,
    0xe2aa80,
    0xd9cca3,
  ]);
  const roofColors = new Set([0x7ea6a5, 0xcd9d59, 0xcf8061, 0x6b9d96, 0x678f91]);
  const woodColors = new Set([
    0x947654, 0x765743, 0x725641, 0xb28f61, 0xd4b27a, 0x947651, 0x806744, 0xa78255, 0xe5d4ae,
  ]);
  const materials = new Map(),
    geometries = new Map(),
    interactive = [];
  const root = new THREE.Group(),
    dynamic = new THREE.Group();
  scene.add(root, dynamic);
  const botanicalMaterials = ['young', 'flowering', 'ripe'].map((stage) => {
    const texture = new THREE.TextureLoader().load(
      `/game-art/kingdoms/city-scenes/sultan-farm-plants/wheat-${stage}.webp`,
      () => {
        if (disposed) texture.dispose();
      },
      undefined,
      () => {},
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.set('wheat-' + stage, texture);
    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      roughness: 1,
    });
    materials.set('wheat-' + stage, mat);
    return mat;
  });
  const material = (color) => {
    if (!materials.has(color)) {
      const kind = wallColors.has(color)
        ? 'stone'
        : roofColors.has(color)
          ? 'roof'
          : woodColors.has(color)
            ? 'wood'
            : color === 0x86b46c
              ? 'grass'
              : [0x94734e, 0xad895b, 0xc0a17a].includes(color)
                ? 'soil'
                : [0xdeca9c, 0xe0cba0, 0xd9cba5].includes(color)
                  ? 'path'
                  : null;
      const map = kind ? surfaceTexture(kind) : null;
      materials.set(
        color,
        new THREE.MeshStandardMaterial({
          color: map ? 0xffffff : color,
          map,
          bumpMap: map,
          bumpScale: kind === 'stone' ? 0.035 : 0.015,
          roughness: color === 0x76b7bb ? 0.25 : 0.88,
          metalness: 0,
        }),
      );
    }
    return materials.get(color);
  };
  function mesh(parent, geometry, color, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geometry, material(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1),
    sphereGeo = new THREE.SphereGeometry(1, 14, 10),
    cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 12),
    coneGeo = new THREE.ConeGeometry(1, 1, 8),
    botanicalPlane = new THREE.PlaneGeometry(0.9, 1.3);
  function box(p, c, x, y, z, w, h, d) {
    const m = mesh(p, boxGeo, c, x, y, z);
    m.scale.set(w, h, d);
    return m;
  }
  function ball(p, c, x, y, z, sx, sy = sx, sz = sx) {
    const m = mesh(p, sphereGeo, c, x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  }
  function cylinder(p, c, x, y, z, r, h) {
    const m = mesh(p, cylinderGeo, c, x, y, z);
    m.scale.set(r, h, r);
    return m;
  }
  function roof(p, c, y, w, d) {
    const key = `roof:${w}:${d}`;
    if (!geometries.has(key)) {
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, 0);
      shape.lineTo(0, w * 0.42);
      shape.lineTo(w / 2, 0);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
      geo.translate(0, 0, -d / 2);
      geometries.set(key, geo);
    }
    return mesh(p, geometries.get(key), c, 0, y, 0);
  }
  function tree(p, x, z, scale = 1, palm = false) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    p.add(g);
    cylinder(g, 0x947654, 0, 0.8, 0, 0.12, 1.6);
    if (palm) {
      for (let i = 0; i < 5; i++) {
        const leaf = ball(
          g,
          0x4c9965,
          Math.cos(i * 1.256) * 0.5,
          1.75,
          Math.sin(i * 1.256) * 0.5,
          0.8,
          0.12,
          0.3,
        );
        leaf.rotation.y = -i * 1.256;
        leaf.rotation.z = 0.2;
      }
    } else {
      ball(g, 0x66a65c, 0, 1.65, 0, 0.7, 0.85, 0.65);
      ball(g, 0x86bc6c, 0.3, 2, 0, 0.5, 0.55, 0.5);
    }
    return g;
  }
  function house(kind, color, tier = 1) {
    const g = new THREE.Group(),
      tall = kind === 'textile' || kind === 'tailor' ? 1.85 : 1.35;
    box(g, 0xe4dbc2, 0, 0.12, 0, 2.4, 0.24, 2.3);
    box(g, color, 0, 0.3 + tall / 2, 0, 2.1, tall, 1.95);
    for (const x of [-1.05, 1.05]) box(g, 0xe4dbc2, x, 0.3 + tall / 2, 1.02, 0.15, tall, 0.16);
    box(g, 0xe4dbc2, 0, 0.3 + tall, 1.06, 2.25, 0.12, 0.18);
    roof(
      g,
      kind === 'house' ? 0x7ea6a5 : kind === 'coop' ? 0xcd9d59 : 0xcf8061,
      0.3 + tall,
      2.45,
      2.35,
    );
    box(g, 0x765743, 0, 0.62, 1.01, 0.46, 0.95, 0.08);
    for (const x of [-0.7, 0.7]) {
      box(g, 0xf0e5c9, x, 0.9, 1.02, 0.46, 0.5, 0.08);
      box(g, 0x769ead, x, 0.9, 1.075, 0.32, 0.34, 0.06);
    }
    box(g, 0xeddeb4, -1.09, 0.92, 0, 0.08, 0.55, 0.55);
    if (kind === 'mill') {
      cylinder(g, 0xe6dbc3, 0, 1.9, 0, 0.68, 2.5);
      const top = mesh(g, coneGeo, 0x6b9d96, 0, 3.4, 0);
      top.scale.set(0.8, 0.7, 0.8);
      const blades = new THREE.Group();
      blades.position.set(0, 2.45, 1.15);
      g.add(blades);
      for (let i = 0; i < 4; i++) {
        const arm = box(blades, 0xf2e8d3, 0, 0, 0, 0.16, 2.5, 0.09);
        arm.rotation.z = (i * Math.PI) / 2;
        const panel = box(blades, 0xe4d2ad, 0.18, 0.82, 0, 0.28, 0.7, 0.12);
        panel.rotation.z = (i * Math.PI) / 2;
        panel.position.set(
          Math.sin((i * Math.PI) / 2) * 0.82,
          Math.cos((i * Math.PI) / 2) * 0.82,
          0.02,
        );
      }
      g.userData.blades = blades;
    } else if (!['stable', 'coop', 'house'].includes(kind)) {
      box(g, 0xdbc8a9, -0.65, 2.4, -0.45, 0.32, 0.8, 0.32);
      ball(g, 0xffffff, -0.65, 3, -0.45, 0.18, 0.25, 0.18);
    }
    if (tier > 1) {
      box(g, 0xf0ce72, 0, 0.25, 0, 2.6, 0.12, 2.5);
      for (let i = 0; i < tier - 1; i++) ball(g, 0xe2c76b, -0.35 + i * 0.7, 2.2, 1.2, 0.15);
    }
    return g;
  }
  function animal(p, x, z, cow) {
    const g = new THREE.Group();
    g.position.set(x, 0.25, z);
    p.add(g);
    if (cow) {
      ball(g, 0xeee6d7, 0, 0.5, 0, 0.36, 0.3, 0.58);
      ball(g, 0x514b42, 0.3, 0.55, -0.16, 0.08, 0.18, 0.24);
      ball(g, 0xeee6d7, 0, 0.7, 0.62, 0.23, 0.23, 0.28);
      ball(g, 0xe6ae9a, 0, 0.58, 0.87, 0.22, 0.09, 0.1);
      for (const x of [-0.25, 0.25]) {
        ball(g, 0xeee6d7, x, 0.8, 0.6, 0.14, 0.07, 0.1);
        ball(g, 0x423b30, x * 0.7, 0.79, 0.8, 0.025);
      }
      for (const a of [-1, 1])
        for (const b of [-1, 1]) box(g, 0x756757, a * 0.23, 0.15, b * 0.35, 0.12, 0.4, 0.12);
      for (const a of [-1, 1]) box(g, 0xd4ba8a, a * 0.22, 0.94, 0.62, 0.09, 0.18, 0.09);
    } else {
      ball(g, 0xf1deba, 0, 0.2, 0, 0.2, 0.25, 0.25);
      ball(g, 0xf2e3c7, 0, 0.43, 0.14, 0.13);
      box(g, 0xd57553, 0, 0.56, 0.14, 0.08, 0.08, 0.13);
      box(g, 0xe3b054, 0, 0.4, 0.28, 0.08, 0.06, 0.12);
    }
    return g;
  }
  function fence(p, x, z, w, d) {
    for (const side of [-1, 1]) {
      box(p, 0xe5d4ae, x, 0.4, z + (side * d) / 2, w, 0.13, 0.08);
      for (let i = 0; i < 4; i++)
        box(p, 0xe5d4ae, x - w / 2 + (i * w) / 3, 0.4, z + (side * d) / 2, 0.09, 0.7, 0.09);
    }
    box(p, 0xe5d4ae, x + w / 2, 0.4, z, 0.09, 0.12, d);
  }
  box(root, 0x86b46c, 0, -0.45, 0, 25, 0.8, 28);
  box(root, 0xc0a17a, 0, -1, 0, 25, 0.5, 28);
  box(root, 0x76b7bb, 14, -0.45, 0, 7, 0.3, 35);
  box(root, 0xc9d8a4, 10.1, -0.02, 0, 0.7, 0.14, 28);
  box(root, 0xdeca9c, 2, -0.015, 0, 1.2, 0.08, 26);
  box(root, 0xdeca9c, 5.6, -0.015, 1.8, 0.75, 0.08, 22);
  for (const z of [-7, -2, 2, 6, 10]) box(root, 0xe0cba0, 1.5, 0, z, 22, 0.08, 0.85);
  box(root, 0xd9cba5, -2, -0.015, 0, 0.9, 0.08, 26);
  // Courtyard, market tents and the Sultan's original palace silhouette.
  const palace = new THREE.Group();
  palace.position.set(0, 0, -10.4);
  root.add(palace);
  box(palace, 0xe5d3aa, 0, 1, 0, 3.2, 2, 2.6);
  box(palace, 0xb1c6bb, 0, 2.2, 0, 3.5, 0.35, 2.9);
  ball(palace, 0x5c9693, 0, 2.55, 0, 1, 0.85, 1);
  cylinder(palace, 0xd0b665, 0, 3.5, 0, 0.05, 0.6);
  for (const x of [-1.5, 1.5]) {
    cylinder(palace, 0xe5d3aa, x, 1.5, 0.6, 0.3, 3);
    const m = mesh(palace, coneGeo, 0x678f91, x, 3.2, 0.6);
    m.scale.set(0.4, 0.7, 0.4);
  }
  box(palace, 0x7e6b4c, 0, 0.65, 1.35, 0.8, 1.3, 0.12);
  const barn = house('stable', 0xcb8566);
  barn.position.set(-7, 0, -10.4);
  root.add(barn);
  fence(root, -7, -10.4, 3.4, 3.2);
  for (let i = 0; i < 3; i++) {
    const tent = house('market', i % 2 ? 0xe2aa80 : 0xd9cca3);
    tent.scale.set(0.65, 0.65, 0.65);
    tent.position.set(5 + i * 1.9, 0, -10.4);
    root.add(tent);
  }
  box(root, 0xb28f61, 11, 0.1, 7, 4, 0.2, 3);
  for (let i = 0; i < 5; i++) box(root, 0xd4b27a, 10 + i * 0.5, 0.23, 7, 0.08, 0.05, 3);
  const boat = new THREE.Group();
  boat.position.set(13, 0.05, 7);
  root.add(boat);
  box(boat, 0x947651, 0, 0.25, 0, 1.4, 0.5, 3);
  box(boat, 0xddd2b1, 0, 0.55, 0, 1.25, 0.15, 2.7);
  cylinder(boat, 0x806744, 0, 1.7, 0, 0.055, 2.3);
  const sail = box(boat, 0xf0e3c6, 0.5, 2, 0, 1.15, 1.3, 0.035);
  sail.rotation.y = 0.4;
  const cart = new THREE.Group();
  cart.position.set(-2, 0.2, 10);
  root.add(cart);
  box(cart, 0xa78255, 0, 0.55, 0, 0.9, 0.6, 1.25);
  roof(cart, 0xe1d3ac, 0.9, 1.2, 1.5);
  for (const x of [-0.6, 0.6])
    for (const z of [-0.4, 0.4]) {
      const wheel = cylinder(cart, 0x6f604a, x, 0.35, z, 0.3, 0.1);
      wheel.rotation.z = Math.PI / 2;
    }
  const horse = animal(cart, 0, 1.3, true);
  horse.scale.set(0.65, 0.85, 1);
  box(cart, 0x8a7251, 0, 0.38, 0.9, 0.1, 0.1, 1.5);
  for (let i = 0; i < 24; i++) {
    const x = i < 12 ? -11 : 9.9,
      z = -12 + (i % 12) * 2.2;
    tree(root, x, z, 0.65 + (i % 3) * 0.15, i % 4 === 0);
  }
  for (let i = 0; i < 10; i++) {
    tree(root, -10 + (i % 5) * 4.5, 12.7, 0.8, i % 3 === 0);
    ball(root, 0xb6ab8a, -11 + (i % 5) * 5, -0.02, -13, 0.5, 0.3, 0.5);
  }
  for (let i = 0; i < 10; i++)
    ball(root, 0x98c27d, -11 + (i % 5) * 4, 0.05, -8 + Math.floor(i / 5) * 18, 0.32, 0.15, 0.3);
  const selectionRing = mesh(scene, new THREE.RingGeometry(1.35, 1.46, 32), 0xf8dd8b, 0, 0.12, 0);
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.visible = false;
  selectionRing.material.side = THREE.DoubleSide;
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2();
  const pointers = new Set();
  let pointerDown = null,
    currentState = null,
    lastSignature = '',
    spin = [],
    plants = [],
    currentMode = null,
    night = false,
    frameId,
    disposed = false,
    lastFrame = 0;
  function mark(group, type, id) {
    group.userData.hit = { type, id };
    group.traverse((o) => {
      if (o.isMesh) interactive.push(o);
    });
    return group;
  }
  function clearDynamic() {
    dynamic.clear();
    interactive.length = 0;
    spin = [];
    plants = [];
  }
  const plotPoint = (i) => [-8 + (i % 3) * 1.7, -4.4 + Math.floor(i / 3) * 2];
  function update(s, selection, mode) {
    currentState = s;
    currentMode = mode;
    const signature = JSON.stringify([
      s.plots.map((p) => (p ? [p.crop, p.start, p.ready] : null)),
      s.positions,
      s.buildings,
      s.construction,
      s.jobs,
      mode,
    ]);
    if (signature !== lastSignature) {
      lastSignature = signature;
      clearDynamic();
      s.plots.forEach((p, i) => {
        const [x, z] = plotPoint(i),
          g = new THREE.Group();
        g.position.set(x, 0.02, z);
        dynamic.add(g);
        box(g, 0x94734e, 0, 0.03, 0, 1.4, 0.12, 1.6);
        for (let row = 0; row < 3; row++)
          box(g, 0xad895b, -0.45 + row * 0.45, 0.12, 0, 0.1, 0.08, 1.5);
        if (p) {
          const canopy = new THREE.Group();
          g.add(canopy);
          if (p.crop === 'wheat')
            for (let n = 0; n < 4; n++) {
              const plant = new THREE.Mesh(botanicalPlane, botanicalMaterials[0]);
              plant.position.set(-0.35 + (n % 2) * 0.7, 0.66, -0.4 + Math.floor(n / 2) * 0.8);
              plant.rotation.y = n % 2 ? Math.PI / 2 : 0;
              plant.userData.botanical = true;
              canopy.add(plant);
            }
          for (let n = 0; n < 6; n++) {
            const px = -0.4 + (n % 2) * 0.8,
              pz = -0.55 + Math.floor(n / 2) * 0.55;
            cylinder(canopy, 0x6c9a4f, px, 0.3, pz, 0.03, 0.6);
            if (['wheat', 'corn', 'sugar'].includes(p.crop)) {
              ball(canopy, crops[p.crop].color, px, 0.68, pz, 0.1, 0.22, 0.1);
              const leaf = ball(canopy, 0x78a75b, px + 0.1, 0.35, pz, 0.18, 0.045, 0.08);
              leaf.rotation.z = 0.7;
            } else {
              ball(canopy, 0x69a459, px, 0.35, pz, 0.25, 0.25, 0.22);
              ball(canopy, crops[p.crop].color, px, 0.54, pz, 0.11, 0.12, 0.11);
            }
          }
          plants.push({ canopy, plant: p });
        }
        mark(g, 'plot', i);
      });
      for (const [k, p] of Object.entries(s.positions)) {
        const g = new THREE.Group();
        g.position.set(p[0], 0, p[1]);
        dynamic.add(g);
        if (s.construction[k]) {
          box(g, 0xd0bb8c, 0, 0.07, 0, 2.8, 0.15, 2.7);
          for (const x of [-1, 1])
            for (const z of [-1, 1]) box(g, 0xb59a6d, x, 1, z, 0.12, 2, 0.12);
          box(g, 0xdac99b, 0, 1.85, 0, 2.4, 0.15, 2.5);
          roof(g, 0xbfbba0, 2, 2.6, 2.8);
        } else if (k === 'garden') {
          box(g, 0x649d5b, 0, 0.05, 0, 2.6, 0.12, 2.5);
          tree(g, 0, 0, 0.8);
          for (let n = 0; n < 6; n++)
            ball(g, n % 2 ? 0xe8ae9b : 0xf1d587, Math.sin(n) * 0.8, 0.25, Math.cos(n) * 0.8, 0.16);
        } else if (k === 'fountain') {
          cylinder(g, 0xdad8c3, 0, 0.22, 0, 1.1, 0.4);
          cylinder(g, 0x75b8c5, 0, 0.45, 0, 0.94, 0.05);
          cylinder(g, 0xdbd2b6, 0, 0.9, 0, 0.2, 1);
          ball(g, 0x95c9d5, 0, 1.6, 0, 0.28, 0.5, 0.28);
        } else {
          const h = house(k, buildingTypes[k].color, s.buildings[k]);
          g.add(h);
          if (h.userData.blades)
            spin.push({ object: h.userData.blades, active: !!s.jobs[k]?.length });
          if (['stable', 'coop'].includes(k)) {
            fence(g, 0, 1.6, 2.8, 1.6);
            for (let i = 0; i < 3; i++) animal(g, -0.85 + i * 0.8, 1.7, k === 'stable');
          }
        }
        mark(g, 'building', k);
      }
      if (mode)
        for (let i = 0; i < buildSlots.length; i++) {
          const p = buildSlots[i];
          if (
            Object.entries(s.positions).some(
              ([k, x]) => k !== mode.move && x[0] === p[0] && x[1] === p[1],
            )
          )
            continue;
          const g = new THREE.Group();
          g.position.set(p[0], 0.02, p[1]);
          dynamic.add(g);
          box(g, 0xaad295, 0, 0.04, 0, 2.7, 0.1, 2.7);
          box(g, 0xf4e7b6, 0, 0.12, 0, 0.15, 0.05, 1.3);
          box(g, 0xf4e7b6, 0, 0.12, 0, 1.3, 0.05, 0.15);
          mark(g, 'slot', i);
        }
    }
    if (selection?.type === 'plot') {
      const p = plotPoint(selection.id);
      selectionRing.position.set(p[0], 0.16, p[1]);
      selectionRing.scale.setScalar(0.65);
      selectionRing.visible = true;
    } else if (selection?.type === 'building' && s.positions[selection.id]) {
      const p = s.positions[selection.id];
      selectionRing.position.set(p[0], 0.16, p[1]);
      selectionRing.scale.setScalar(1);
      selectionRing.visible = true;
    } else selectionRing.visible = false;
  }
  function pick(event) {
    pointers.delete(event.pointerId);
    if (
      !pointerDown ||
      Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 8
    )
      return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(interactive, false);
    if (hits.length) {
      let o = hits[0].object;
      while (o && !o.userData.hit) o = o.parent;
      if (o) onSelect(o.userData.hit);
    }
    pointerDown = null;
  }
  function down(e) {
    pointers.add(e.pointerId);
    if (pointers.size > 1) {
      pointerDown = null;
      return;
    }
    pointerDown = { x: e.clientX, y: e.clientY };
  }
  function cancelPointer(e) {
    pointers.delete(e.pointerId);
    pointerDown = null;
  }
  renderer.domElement.addEventListener('pointerdown', down);
  renderer.domElement.addEventListener('pointerup', pick);
  renderer.domElement.addEventListener('pointercancel', cancelPointer);
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    host.dataset.renderer = 'lost';
    host.dispatchEvent(new CustomEvent('world-error'));
  });
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  function animate(t) {
    if (disposed) return;
    frameId = requestAnimationFrame(animate);
    if (document.hidden || t - lastFrame < 33) return;
    lastFrame = t;
    controls.update();
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -8, 9);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -9, 10);
    const now = Date.now();
    for (const { canopy, plant } of plants) {
      const progress = THREE.MathUtils.clamp(
        (now - plant.start) / (plant.ready - plant.start),
        0,
        1,
      );
      canopy.scale.setScalar(0.3 + 0.7 * progress);
      for (const specimen of canopy.children)
        if (specimen.userData.botanical)
          specimen.material = botanicalMaterials[progress >= 1 ? 2 : progress >= 0.65 ? 1 : 0];
    }
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const p of spin) if (p.active) p.object.rotation.z = t * 0.0004;
      boat.rotation.z = Math.sin(t * 0.001) * 0.025;
      boat.position.z = currentState?.trips.ship
        ? 7 -
          Math.sin(
            Math.min(
              1,
              (now - currentState.trips.ship.start) /
                (currentState.trips.ship.ready - currentState.trips.ship.start),
            ) * Math.PI,
          ) *
            9
        : 7;
      cart.position.x = currentState?.trips.caravan
        ? -2 +
          Math.sin(
            Math.min(
              1,
              (now - currentState.trips.caravan.start) /
                (currentState.trips.caravan.ready - currentState.trips.caravan.start),
            ) * Math.PI,
          ) *
            9
        : -2;
    }
    renderer.render(scene, camera);
  }
  frameId = requestAnimationFrame(animate);
  return {
    update,
    focus(type, id) {
      const p = type === 'plot' ? plotPoint(id) : currentState?.positions[id];
      if (p) {
        const offset = camera.position.clone().sub(controls.target);
        controls.target.set(p[0], 0, p[1]);
        camera.position.copy(controls.target).add(offset);
      }
    },
    zoom(amount) {
      camera.position.sub(controls.target).multiplyScalar(amount).add(controls.target);
    },
    rotate() {
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
      camera.position.copy(controls.target).add(offset);
    },
    reset() {
      controls.target.set(0, 0, 0);
      camera.position.set(25, 30, 32);
    },
    night() {
      night = !night;
      scene.background.set(night ? 0x344a61 : 0xc7e4e9);
      scene.fog.color.copy(scene.background);
      sun.intensity = night ? 1.1 : 3.2;
      return night;
    },
    quality() {
      renderer.shadowMap.enabled = !renderer.shadowMap.enabled;
      renderer.setPixelRatio(renderer.shadowMap.enabled ? Math.min(devicePixelRatio, 1.5) : 1);
      resize();
      return renderer.shadowMap.enabled;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      controls.dispose();
      controls.removeEventListener('change', cameraChange);
      renderer.dispose();
      for (const m of materials.values()) m.dispose();
      for (const texture of textures.values()) texture.dispose();
      for (const g of [
        boxGeo,
        sphereGeo,
        cylinderGeo,
        coneGeo,
        botanicalPlane,
        ...geometries.values(),
      ])
        g.dispose();
      selectionRing.geometry.dispose();
      renderer.domElement.removeEventListener('pointerdown', down);
      renderer.domElement.removeEventListener('pointerup', pick);
      renderer.domElement.removeEventListener('pointercancel', cancelPointer);
    },
  };
}
