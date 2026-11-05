import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { get, type Scene } from './api';

// three.js axes: x = east, y = up, z = south (map rows grow southwards).
// Map cell (c, r) centre: x = -half + (c + .5) * cell, z = -half + (r + .5) * cell.
const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const cellName = (c: number, r: number) => {
  let col = '';
  for (c++; c > 0; c = Math.floor((c - 1) / 26)) col = COLS[(c - 1) % 26] + col;
  return col + (r + 1);
};
const DRONE = 0xa8d9c4; // brand mint (logo); its arms use the logo's darker teal
const DRONE_DARK = 0x48766c;
const GREEN = 0xd9b775; // Grok's plan: the design's amber 'what next' colour
const ROVER = 0x8fb8e0; // soft blue, distinct from the drone and the plan
const BASE_PX = 64; // floor texture pixels per cell on small grids

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

export default function Map3D({ onPick, endpoint = '/points' }: { onPick?: (cell: string) => void; endpoint?: string }) {
  const pick = useRef(onPick); pick.current = onPick;
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current!;
    const r = new THREE.WebGLRenderer({ antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    el.appendChild(r.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x080d14);
    const cam = new THREE.PerspectiveCamera(50, 1, 0.05, 100); cam.position.set(0, 5.2, 5.2);
    const ctl = new OrbitControls(cam, r.domElement); ctl.target.set(0, 0, -0.9); ctl.enableDamping = true;

    // drone: a small quadcopter (body, 4 arms, 4 rotor discs, a nose that shows where it looks) + a rod to its cell.
    // transparent (opacity 1) puts it in the transparent pass, drawn after the point cloud; renderOrder puts it last.
    const drone = new THREE.Group();
    const dm = (color: number, opacity = 1) =>
      new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.2), dm(DRONE)); drone.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 12), dm(0xe5edef));
    nose.rotation.x = -Math.PI / 2; nose.position.z = -0.15; drone.add(nose);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.3), dm(DRONE_DARK));
      arm.position.set(sx * 0.1, 0, sz * 0.1); arm.rotation.y = sx * sz * Math.PI / 4; drone.add(arm);
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.05, 10), dm(0x0d1a17));
      motor.position.set(sx * 0.2, 0.02, sz * 0.2); drone.add(motor);
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.008, 24), dm(DRONE, 0.45));
      rotor.position.set(sx * 0.2, 0.05, sz * 0.2); drone.add(rotor);
    }
    drone.scale.setScalar(1.6);
    drone.traverse(o => { o.renderOrder = 20; }); scene.add(drone);
    // thin, faint, and drawn BEFORE the drone so it never crosses over the quadcopter
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8),
      new THREE.MeshBasicMaterial({ color: DRONE, depthTest: false, depthWrite: false, transparent: true, opacity: 0.45 }));
    stem.renderOrder = 17; scene.add(stem);
    const rover = new THREE.Mesh(new THREE.BoxGeometry(.45, .25, .6),
      new THREE.MeshBasicMaterial({ color: ROVER, transparent: true, depthTest: false, depthWrite: false }));
    rover.renderOrder = 20; rover.visible = false; scene.add(rover);
    const roverLabel = label('ROVER', '#8fb8e0'); roverLabel.visible = false; scene.add(roverLabel);
    const roverTrail = new THREE.Line(new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: ROVER, transparent: true, depthTest: false, depthWrite: false }));
    roverTrail.renderOrder = 18; scene.add(roverTrail);

    // A look-ahead reference, not the drone's position or a promise that the first metre is clear.
    const view = new THREE.Group(); scene.add(view);
    const viewMat = new THREE.LineDashedMaterial({ color: DRONE, dashSize: 0.1, gapSize: 0.07,
      transparent: true, depthTest: false, depthWrite: false });
    const viewLine = new THREE.Line(new THREE.BufferGeometry(), viewMat); viewLine.renderOrder = 19; view.add(viewLine);
    const viewRing = new THREE.Mesh(new THREE.RingGeometry(0.19, 0.23, 32),
      new THREE.MeshBasicMaterial({ color: DRONE, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    viewRing.rotation.x = -Math.PI / 2; viewRing.renderOrder = 19; view.add(viewRing);
    const viewLabel = label('VIEW ~1m AHEAD', '#a8d9c4', 1.35); viewLabel.renderOrder = 19; view.add(viewLabel);

    // point cloud: see-through so the floor cells and the plan stay readable
    let cloud: THREE.Points | null = null;
    const mat = new THREE.PointsMaterial({ size: 0.04, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });

    // floor: one canvas texture with every cell, its state and its name
    const fc = document.createElement('canvas'); const fctx = fc.getContext('2d')!;
    const tex = new THREE.CanvasTexture(fc); tex.anisotropy = 8; tex.colorSpace = THREE.SRGBColorSpace;
    let floor: THREE.Mesh | null = null, floorKey = '', planKey = '', focusKey = '';
    const centre = (s: Scene, c: number, rr: number) => new THREE.Vector3(-s.half + (c + 0.5) * s.cell, 0, -s.half + (rr + 0.5) * s.cell);

    function drawFloor(s: Scene) {
      // big grids: smaller cells in the texture, or every redraw uploads a 20+ megapixel canvas to the GPU
      const n = s.n, PX = n > 40 ? 32 : BASE_PX, k = PX / BASE_PX; fc.width = fc.height = n * PX; const vis = new Set(s.visited);
      const path = new Set((s.plan?.path || []).map(([c, rr]) => `${c},${rr}`));
      const tgt = s.plan?.path?.length ? s.plan.path[s.plan.path.length - 1] : null;
      for (let rr = 0; rr < n; rr++) for (let c = 0; c < n; c++) {
        const g = s.grid[rr][c], x = c * PX, y = rr * PX, name = cellName(c, rr);
        fctx.fillStyle = g === 2 ? '#6e2b27' : g === 1 ? (vis.has(name) ? '#2f5e86' : '#9aa5b1') : '#141c26';
        fctx.fillRect(x, y, PX, PX);
        if (path.has(`${c},${rr}`)) { fctx.fillStyle = 'rgba(217,183,117,.5)'; fctx.fillRect(x, y, PX, PX); }
        fctx.strokeStyle = 'rgba(0,0,0,.55)'; fctx.lineWidth = 2 * k; fctx.strokeRect(x + k, y + k, PX - 2 * k, PX - 2 * k);
        fctx.font = `bold ${Math.round(18 * k)}px Inter, system-ui`; fctx.textAlign = 'left'; fctx.textBaseline = 'top';
        fctx.fillStyle = g === 1 && !vis.has(name) ? 'rgba(10,15,20,.75)' : g === 0 ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.6)';
        fctx.fillText(name, x + 9 * k, y + 8 * k); // corner, so a path over the centre never hides it
      }
      const dc = s.state.drone_cell, parts = dc.match(/^([A-Z]+)(\d+)$/)!;
      const dcc = [...parts[1]].reduce((n, ch) => n * 26 + COLS.indexOf(ch) + 1, 0) - 1, dcr = +parts[2] - 1;
      fctx.strokeStyle = '#a8d9c4'; fctx.lineWidth = 8 * k; fctx.strokeRect(dcc * PX + 4 * k, dcr * PX + 4 * k, PX - 8 * k, PX - 8 * k);
      if (tgt) { fctx.strokeStyle = '#d9b775'; fctx.lineWidth = 10 * k; fctx.strokeRect(tgt[0] * PX + 5 * k, tgt[1] * PX + 5 * k, PX - 10 * k, PX - 10 * k); }
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
      const gm = new THREE.MeshBasicMaterial({ color: GREEN, depthTest: false, depthWrite: false, transparent: true });
      if (p.path && p.path.length > 1) {
        const pts = (p.route || p.path).map(([c, rr]) => centre(s, c, rr).setY(FL));
        const curve = new THREE.CurvePath<THREE.Vector3>();
        for (let i = 0; i < pts.length - 1; i++) curve.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
        planGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64 * (pts.length - 1), 0.05, 8, false), gm));
        const t = pts[pts.length - 1];
        const col = new THREE.Mesh(new THREE.BoxGeometry(s.cell * 0.92, 1.2, s.cell * 0.92),
          new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.2, depthWrite: false, depthTest: false }));
        col.position.set(t.x, 0.6, t.z); planGroup.add(col);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(col.geometry), new THREE.LineBasicMaterial({ color: GREEN, depthTest: false, depthWrite: false, transparent: true }));
        edges.position.copy(col.position); planGroup.add(edges);
        const l = label(p.label.toUpperCase(), '#d9b775'); l.position.set(t.x, 1.45, t.z); planGroup.add(l);
      } else if (p.heading !== null && p.heading !== undefined) {
        const a = (p.heading * Math.PI) / 180, dir = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
        const to = here.clone().addScaledVector(dir, 1.25);
        planGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(here, to), 8, 0.05, 8, false), gm));
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 16), gm);
        head.position.copy(to).addScaledVector(dir, 0.2); head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        planGroup.add(head);
        const l = label(p.label.toUpperCase(), '#d9b775'); l.position.copy(to).setY(0.5); planGroup.add(l);
      } else if (p.action === 'spin') {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.03, 8, 48), gm);
        ring.rotation.x = Math.PI / 2; ring.position.copy(here); planGroup.add(ring);
        const l = label('SPIN 360', '#d9b775'); l.position.copy(here).setY(0.9); planGroup.add(l);
      }
      // Object order is not inherited from the group. Draw the whole plan after the transparent cloud/floor.
      planGroup.traverse(o => { o.renderOrder = 15; });
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

    // double-click a floor cell: ask to fly there (single clicks and drags stay for orbiting)
    let last: Scene | null = null;
    const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const onDbl = (e: MouseEvent) => {
      if (!last) return;
      const b = r.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1), cam);
      const hit = ray.ray.intersectPlane(ground, new THREE.Vector3()); if (!hit) return;
      const c = Math.floor((hit.x + last.half) / last.cell), rr = Math.floor((hit.z + last.half) / last.cell);
      if (c >= 0 && rr >= 0 && c < last.n && rr < last.n) pick.current?.(cellName(c, rr));
    };
    r.domElement.addEventListener('dblclick', onDbl);

    async function load() {
      const s = await get<Scene>(endpoint); last = s;
      rover.visible = roverLabel.visible = !!s.rover;
      if (s.rover) {
        rover.position.set(s.rover.x, .18, -s.rover.y); rover.rotation.y = -s.rover.yaw * Math.PI / 180;
        roverLabel.position.set(s.rover.x, .55, -s.rover.y);
      }
      // one preallocated buffer, refilled in place: no per-second geometry rebuild or GPU reallocation
      const n = s.points.length;
      if (!cloud || cloud.userData.cap < n) {
        const cap = Math.max(n, 30000), g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
        if (cloud) { scene.remove(cloud); cloud.geometry.dispose(); }
        cloud = new THREE.Points(g, mat); cloud.userData.cap = cap; cloud.frustumCulled = false; scene.add(cloud);
      }
      const pa = cloud.geometry.attributes.position as THREE.BufferAttribute, ca = cloud.geometry.attributes.color as THREE.BufferAttribute;
      const pos = pa.array as Float32Array, col = ca.array as Float32Array;
      for (let i = 0; i < n; i++) {
        const p = s.points[i], j = i * 3;
        pos[j] = p[0]; pos[j + 1] = p[2]; pos[j + 2] = -p[1]; col[j] = p[3]; col[j + 1] = p[4]; col[j + 2] = p[5];
      }
      pa.needsUpdate = ca.needsUpdate = true; cloud.geometry.setDrawRange(0, n);
      const trail = s.rover_trail || [];
      roverTrail.visible = trail.length > 1;
      if (roverTrail.visible) {
        roverTrail.geometry.dispose();
        roverTrail.geometry = new THREE.BufferGeometry().setFromPoints(trail.map(([x, y]) => new THREE.Vector3(x, 0.06, -y)));
      }
      const hz = Math.max(0.3, s.pose.z);
      drone.position.set(s.pose.x, hz, -s.pose.y); drone.rotation.y = (-s.pose.yaw * Math.PI) / 180;
      stem.scale.y = Math.max(0.01, hz - 0.08); stem.position.set(s.pose.x, (hz - 0.08) / 2, -s.pose.y); // stops under the body
      const cv = s.state.camera_view; view.visible = !!cv;
      if (cv) {
        viewLine.geometry.dispose();
        viewLine.geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(s.pose.x, 0.06, -s.pose.y), new THREE.Vector3(cv.x, 0.06, -cv.y),
        ]);
        viewLine.computeLineDistances();
        viewRing.position.set(cv.x, 0.06, -cv.y); viewLabel.position.set(cv.x, 0.3, -cv.y);
      }
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
    return () => { alive = false; window.clearTimeout(timer); cancelAnimationFrame(frame); ro.disconnect(); r.domElement.removeEventListener('dblclick', onDbl); ctl.dispose(); r.dispose(); el.removeChild(r.domElement); };
  }, [endpoint]);
  return <div ref={host} className="live-3d" />;
}
