import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { get, type Scene } from './api';

// three.js axes: x = east, y = up, z = south (map rows grow southwards).
// Map cell (c, r) centre: x = -half + (c + .5) * cell, z = -half + (r + .5) * cell.
const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const cellName = (c: number, r: number) => COLS[c] + (r + 1);
const GREEN = 0x76dcc1; // the design's mint
const PX = 96; // floor texture pixels per cell

function label(text: string, color: string, w = 1.1) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = 'rgba(8,13,20,.88)'; x.beginPath(); x.roundRect(4, 14, 504, 100, 22); x.fill();
  x.strokeStyle = color; x.lineWidth = 6; x.stroke();
  x.fillStyle = color; x.font = 'bold 56px Inter, system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 256, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
  s.scale.set(w, w / 4, 1); s.renderOrder = 10;
  return s;
}

export default function Map3D() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current!;
    const r = new THREE.WebGLRenderer({ antialias: true });
    el.appendChild(r.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x080d14);
    const cam = new THREE.PerspectiveCamera(50, 1, 0.05, 100); cam.position.set(0, 5.2, 5.2);
    const ctl = new OrbitControls(cam, r.domElement); ctl.target.set(0, 0, -0.9); ctl.enableDamping = true;

    // drone: cone pointing where it looks + a rod down to its cell
    const drone = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 16), new THREE.MeshBasicMaterial({ color: 0x7cc4ff, depthTest: false }));
    cone.rotation.x = -Math.PI / 2; cone.renderOrder = 6; drone.add(cone); scene.add(drone);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 8),
      new THREE.MeshBasicMaterial({ color: 0x7cc4ff, depthTest: false, transparent: true, opacity: 0.8 }));
    stem.renderOrder = 6; scene.add(stem);

    // point cloud: see-through so the floor cells and the plan stay readable
    let cloud: THREE.Points | null = null;
    const mat = new THREE.PointsMaterial({ size: 0.04, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });

    // floor: one canvas texture with every cell, its state and its name
    const fc = document.createElement('canvas'); const fctx = fc.getContext('2d')!;
    const tex = new THREE.CanvasTexture(fc); tex.anisotropy = 8; tex.colorSpace = THREE.SRGBColorSpace;
    let floor: THREE.Mesh | null = null, floorKey = '', planKey = '', focusKey = '';
    const centre = (s: Scene, c: number, rr: number) => new THREE.Vector3(-s.half + (c + 0.5) * s.cell, 0, -s.half + (rr + 0.5) * s.cell);

    function drawFloor(s: Scene) {
      const n = s.n; fc.width = fc.height = n * PX; const vis = new Set(s.visited);
      const path = new Set((s.plan?.path || []).map(([c, rr]) => `${c},${rr}`));
      const tgt = s.plan?.path?.length ? s.plan.path[s.plan.path.length - 1] : null;
      for (let rr = 0; rr < n; rr++) for (let c = 0; c < n; c++) {
        const g = s.grid[rr][c], x = c * PX, y = rr * PX, name = cellName(c, rr);
        fctx.fillStyle = g === 2 ? '#6e2b27' : g === 1 ? (vis.has(name) ? '#2f5e86' : '#9aa5b1') : '#141c26';
        fctx.fillRect(x, y, PX, PX);
        if (path.has(`${c},${rr}`)) { fctx.fillStyle = 'rgba(118,220,193,.55)'; fctx.fillRect(x, y, PX, PX); }
        fctx.strokeStyle = 'rgba(0,0,0,.55)'; fctx.lineWidth = 2; fctx.strokeRect(x + 1, y + 1, PX - 2, PX - 2);
        fctx.font = 'bold 26px Inter, system-ui'; fctx.textAlign = 'left'; fctx.textBaseline = 'top';
        fctx.fillStyle = g === 1 && !vis.has(name) ? 'rgba(10,15,20,.75)' : g === 0 ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.6)';
        fctx.fillText(name, x + 9, y + 8); // corner, so a path over the centre never hides it
      }
      const dc = s.state.drone_cell, dcc = COLS.indexOf(dc[0]), dcr = +dc.slice(1) - 1;
      fctx.strokeStyle = '#7cc4ff'; fctx.lineWidth = 8; fctx.strokeRect(dcc * PX + 4, dcr * PX + 4, PX - 8, PX - 8);
      if (tgt) { fctx.strokeStyle = '#76dcc1'; fctx.lineWidth = 10; fctx.strokeRect(tgt[0] * PX + 5, tgt[1] * PX + 5, PX - 10, PX - 10); }
      tex.needsUpdate = true;
      if (!floor || floor.userData.n !== n) {
        if (floor) scene.remove(floor);
        const size = n * s.cell;
        floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92, depthWrite: false }));
        floor.rotation.x = -Math.PI / 2; floor.position.y = -0.002; floor.userData.n = n; scene.add(floor);
      }
    }

    // Grok's planned action, on the floor: path + target column for goto, arrow for look, ring for spin
    const planGroup = new THREE.Group(); planGroup.renderOrder = 5; scene.add(planGroup);
    function drawPlan(s: Scene) {
      planGroup.clear(); const p = s.plan; if (!p) return;
      const FL = 0.04, here = new THREE.Vector3(s.pose.x, FL, -s.pose.y);
      const gm = new THREE.MeshBasicMaterial({ color: GREEN, depthTest: false, transparent: true });
      if (p.path && p.path.length > 1) {
        const pts = p.path.map(([c, rr]) => centre(s, c, rr).setY(FL));
        const curve = new THREE.CurvePath<THREE.Vector3>();
        for (let i = 0; i < pts.length - 1; i++) curve.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
        planGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64 * (pts.length - 1), 0.05, 8, false), gm));
        const t = pts[pts.length - 1];
        const col = new THREE.Mesh(new THREE.BoxGeometry(s.cell * 0.92, 1.2, s.cell * 0.92),
          new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.2, depthWrite: false, depthTest: false }));
        col.position.set(t.x, 0.6, t.z); planGroup.add(col);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(col.geometry), new THREE.LineBasicMaterial({ color: GREEN, depthTest: false }));
        edges.position.copy(col.position); planGroup.add(edges);
        const l = label(p.label.toUpperCase(), '#76dcc1'); l.position.set(t.x, 1.45, t.z); planGroup.add(l);
      } else if (p.heading !== null && p.heading !== undefined) {
        const a = (p.heading * Math.PI) / 180, dir = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
        const to = here.clone().addScaledVector(dir, 1.25);
        planGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(here, to), 8, 0.05, 8, false), gm));
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 16), gm);
        head.position.copy(to).addScaledVector(dir, 0.2); head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        planGroup.add(head);
        const l = label(p.label.toUpperCase(), '#76dcc1'); l.position.copy(to).setY(0.5); planGroup.add(l);
      } else if (p.action === 'spin') {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.03, 8, 48), gm);
        ring.rotation.x = Math.PI / 2; ring.position.copy(here); planGroup.add(ring);
        const l = label('SPIN 360', '#76dcc1'); l.position.copy(here).setY(0.9); planGroup.add(l);
      }
    }

    // frame each new plan once: glide to show the drone and the target; the operator's own drag stops it
    let glide: { t0: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromP: THREE.Vector3; toP: THREE.Vector3 } | null = null;
    function focus(s: Scene) {
      const p = s.plan; if (!p) return;
      const k = p.label + JSON.stringify(p.path); if (k === focusKey) return; focusKey = k;
      const here = new THREE.Vector3(s.pose.x, 0, -s.pose.y);
      let far = here.clone().add(new THREE.Vector3(0, 0, -1));
      if (p.path?.length > 1) { const [c, rr] = p.path[p.path.length - 1]; far = centre(s, c, rr); }
      else if (p.heading !== null && p.heading !== undefined) { const a = (p.heading * Math.PI) / 180; far = here.clone().add(new THREE.Vector3(Math.sin(a) * 1.6, 0, -Math.cos(a) * 1.6)); }
      const mid = here.clone().add(far).multiplyScalar(0.5), span = Math.max(1.5, here.distanceTo(far));
      const dir = cam.position.clone().sub(ctl.target); dir.y = Math.max(dir.y, 1.45 * Math.hypot(dir.x, dir.z)); dir.normalize();
      const dist = Math.min(10, Math.max(5, span * 2.2 + 3.5));
      glide = { t0: performance.now(), fromT: ctl.target.clone(), toT: mid, fromP: cam.position.clone(), toP: mid.clone().addScaledVector(dir, dist) };
    }
    ctl.addEventListener('start', () => { glide = null; });

    async function load() {
      const s = await get<Scene>('/points');
      const n = s.points.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      s.points.forEach((p, i) => { pos.set([p[0], p[2], -p[1]], i * 3); col.set([p[3], p[4], p[5]], i * 3); });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (cloud) { scene.remove(cloud); cloud.geometry.dispose(); }
      cloud = new THREE.Points(g, mat); scene.add(cloud);
      const hz = Math.max(0.3, s.pose.z);
      drone.position.set(s.pose.x, hz, -s.pose.y); drone.rotation.y = (-s.pose.yaw * Math.PI) / 180;
      stem.scale.y = hz; stem.position.set(s.pose.x, hz / 2, -s.pose.y);
      const fk = JSON.stringify([s.grid, s.visited, s.plan?.path, s.state.drone_cell]);
      if (fk !== floorKey) { floorKey = fk; drawFloor(s); }
      const pk = JSON.stringify([s.plan, s.pose]);
      if (pk !== planKey) { planKey = pk; drawPlan(s); }
      focus(s);
    }

    let alive = true, timer = 0, frame = 0;
    const tick = async () => { try { await load(); } catch { /* backend down */ } if (alive) timer = window.setTimeout(tick, 1000); };
    void tick();
    const size = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; r.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    const ro = new ResizeObserver(size); ro.observe(el); size();
    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (glide) {
        const t = Math.min(1, (performance.now() - glide.t0) / 700), e = t * (2 - t);
        ctl.target.lerpVectors(glide.fromT, glide.toT, e); cam.position.lerpVectors(glide.fromP, glide.toP, e);
        if (t === 1) glide = null;
      }
      ctl.update(); r.render(scene, cam);
    };
    loop();
    return () => { alive = false; window.clearTimeout(timer); cancelAnimationFrame(frame); ro.disconnect(); ctl.dispose(); r.dispose(); el.removeChild(r.domElement); };
  }, []);
  return <div ref={host} className="live-3d" />;
}
