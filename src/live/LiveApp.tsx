import { useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, RotateCw, Square, X, Plus } from 'lucide-react';
import DecisionGraph, { NodeDetail } from './DecisionGraph';
import Narrator from './Narrator';
import Logo from './Logo';
import Map3D from './Map3D';
import VoiceButton from './VoiceButton';
import { get, post, url, usePoll, useStream, type Graph, type GraphNode, type LiveState } from './api';
import './live.css';

/** SEEK live command center: drone camera and 3D map on top, Grok's state graph across the bottom. */
export default function LiveApp() {
  const state = usePoll<LiveState>('/state', 700);
  const graph = useStream<Graph>('/graph/stream', '/graph');
  const [goal, setGoal] = useState('');
  const [open, setOpen] = useState<GraphNode | null>(null);
  const [toast, setToast] = useState('');
  const [pick, setPick] = useState('');
  type Settings = { speed: number; hop_cells: number; takeoff_height_m?: number };
  const [set, setSet] = useState<Settings | null>(null);
  useEffect(() => { get<Settings>('/settings').then(setSet).catch(() => {}); }, [state !== null]);
  const change = async (q: string) => {
    try { const r = await post<Settings & { reply: string }>(`/settings?${q}`); setSet(r); if (r.reply !== 'ok') setToast(r.reply); }
    catch (e) { setToast(e instanceof Error ? e.message : String(e)); }
  };
  const connected = state !== null;
  const running = !!state?.running;

  useEffect(() => { if (running && state?.goal && document.activeElement?.id !== 'goal') setGoal(state.goal); }, [running, state?.goal]);
  // A drone command runs in the background: when one is refused or fails, say why.
  const lastLog = state?.log[state.log.length - 1];
  const seenLog = useRef(0);
  useEffect(() => {
    if (!lastLog || lastLog.t <= seenLog.current) return;
    const first = seenLog.current === 0;
    seenLog.current = lastLog.t;
    if (!first && lastLog.reply !== 'ok' && lastLog.reply !== 'sent') setToast(`${lastLog.cmd}: ${lastLog.reply}`);
  }, [lastLog]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(''), 4000); return () => window.clearTimeout(t); }, [toast]);

  const act = async (path: string, body?: unknown) => {
    try { const r = await post<{ reply?: string }>(path, body); if (r?.reply && r.reply !== 'started' && r.reply !== 'ok') setToast(r.reply); }
    catch (e) { setToast(e instanceof Error ? e.message : String(e)); }
  };
  const start = () => { if (!goal.trim()) { document.getElementById('goal')?.focus(); return; } setOpen(null); void act('/agent/start', { goal: goal.trim() }); };
  useEffect(() => {
    const keys: Record<string, [string, number]> = {
      KeyW: ['forward', 20], ArrowUp: ['forward', 20], KeyS: ['back', 20], ArrowDown: ['back', 20],
      KeyA: ['left', 20], ArrowLeft: ['left', 20], KeyD: ['right', 20], ArrowRight: ['right', 20],
      KeyQ: ['turn_left', 15], KeyE: ['turn_right', 15], KeyR: ['up', 20], KeyF: ['down', 20],
      Space: ['stop', 0], Escape: ['stop', 0], KeyL: ['land', 0],
    };
    const keydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const move = keys[e.code]; if (!move) return;
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) void act(`/manual/${move[0]}?arg=${move[1]}`);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);

  return <div className="live-shell">
    <header className="live-top">
      <Logo href="#" />
      <div className="live-goal">
        <span className="eyebrow">FIND</span>
        <input id="goal" value={goal} disabled={running} onChange={e => setGoal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') start(); }}
          placeholder="Describe the person or object, e.g. a person in a dark blue t-shirt working on a laptop" />
        <VoiceButton disabled={running} onText={setGoal} />
      </div>
      <label className="live-auto" title="Off: you approve every action before it runs">
        <button className={`switch ${state && !state.approve_each ? 'on' : ''}`} role="switch" aria-checked={!!state && !state.approve_each}
          onClick={() => void act(`/auto/${state?.approve_each ? 'on' : 'off'}`)}><span /></button>Automatic</label>
      {!running && <button className="button button-primary" disabled={!connected} onClick={start}><Play size={12} fill="currentColor" />Start search</button>}
      <button className="button live-hover" disabled={!connected} onClick={() => void act('/cmd/stop')}
        title="Stop moving NOW and hover in the air. Cancels the search and manual route. Does not land or cut motors."><Square size={20} fill="currentColor" />STOP / HOVER</button>
      <Narrator graph={graph} found={state?.confirm?.evidence} />
      <button className="live-ghost" disabled={running} onClick={() => { setOpen(null); void act('/map/reset'); }} title="Forget the map: start over in a new place"><RotateCcw size={12} />New map</button>
      <span className={`live-status ${connected ? '' : 'down'}`}><i />{!connected ? 'Backend offline: run uv run fleet-viewer' : state!.mode === 'manual' && state!.manual_status ? state!.manual_status : state!.status || 'Ready'}</span>
      {state?.kind === 'drone' && <button className="button button-land" onClick={() => void act('/cmd/land')} title="Take over from the agent and land now">LAND</button>}
      <button className="button button-danger" onClick={() => void act('/cmd/emergency')} title="Cuts the motors at once: the drone DROPS. Only to avoid a crash.">KILL MOTORS</button>
    </header>

    <main className="live-main">
      <section className="live-camera">
        <a className="add-device" href="/?multi" title="Add a device: open the multi-device view (drone + rover)" aria-label="Add a device">
          <Plus size={16} strokeWidth={2.4} /><span>Add device</span></a>
        <CameraStream />
        <span className="live-keys" title="Each tap overrides the agent/current move. Moves: 20 cm. Turns: 15°. Ignored while typing.">WASD / arrows: move · Q/E: turn · R/F: height · Space: hover · L: land</span>
        <span className="live-tag"><i className={running ? 'on' : ''} />CAMERA · HDG {String(Math.round(state?.pose.yaw ?? 0) % 360).padStart(3, '0')}°{state?.kind === 'drone' ? ` · ALT ${(state.pose.z ?? 0).toFixed(1)} M` : ''}{state?.battery != null ? ` · BAT ${state.battery}%` : ''}</span>
        {state?.height_waiting && <div className="live-height" role="region" aria-label="Set flight height before searching">
          <span className="eyebrow">SET FLIGHT HEIGHT · GROK IS PAUSED</span>
          <strong>{state.pose.z.toFixed(1)} <small>m</small></strong>
          <p>Adjust the height, then begin. No scan or reasoning starts before you confirm.</p>
          <div>
            <button className="button" disabled={state.busy || state.pose.z < 0.6} onClick={() => void act('/cmd/down?arg=20')}>Down 20 cm</button>
            <button className="button" disabled={state.busy || state.pose.z > 3.8} onClick={() => void act('/cmd/up?arg=20')}>Up 20 cm</button>
            <button className="button button-primary" disabled={state.busy} onClick={() => void act('/agent/ready')}><Play size={13} />Begin search</button>
          </div>
          {state.busy && <span className="subtle">Adjusting height…</span>}
        </div>}
        {state?.instruction && <div className="live-instruction"><span>{state.instruction}{state.progress ? ` · ${state.progress}` : ''}</span>
          <button className="button" onClick={() => void act('/done')}>Done</button></div>}
        {state && !state.height_waiting && (!running || state.kind === 'drone') && <div className="live-manual" title={running ? 'Any button takes over from the agent' : undefined}>
          {state.kind === 'drone' && <button onClick={() => void act('/cmd/takeoff')}>Take off</button>}
          <button onClick={() => void act('/cmd/spin')}>Spin</button>
          <button onClick={() => void act('/cmd/turn_left?arg=45')} title="Turn left 45 degrees"><RotateCcw size={11} />45°</button>
          <button onClick={() => void act('/cmd/forward?arg=50')}>Fwd 50</button>
          <button onClick={() => void act('/cmd/turn_right?arg=45')} title="Turn right 45 degrees"><RotateCw size={11} />45°</button>
          {state.kind === 'drone' && <button onClick={() => void act('/cmd/up?arg=60')} title="Climb 60 cm (max 4 m)">Up 60</button>}
          {state.kind === 'drone' && <button onClick={() => void act('/cmd/down?arg=30')} title="Descend 30 cm (min 0.4 m)">Down 30</button>}
          {state.kind === 'drone' && <button onClick={() => void act('/cmd/land')}>Land</button>}
        </div>}
      </section>

      <section className="live-map">
        <Map3D onPick={setPick} />
        {pick && <div className="live-pick"><span>Fly to <b>{pick}</b>?{running ? ' Takes over from the agent.' : ''}</span>
          <button className="button" onClick={() => setPick('')}>Cancel</button>
          <button className="button button-primary" onClick={() => { void act(`/goto/${pick}`); setPick(''); }}>Fly</button></div>}
        {set && <div className="live-settings" title="The map grid stays 50 cm per cell: these only change how the drone flies it">
          <label>Takeoff<select value={set.takeoff_height_m ?? 3.2} disabled={running} onChange={e => void change(`takeoff_height_m=${e.target.value}`)}>
            {[0.8, 1, 1.5, 2, 2.5, 3, 3.2, 3.5, 4].map(v => <option key={v} value={v}>{v.toFixed(1)} m</option>)}</select></label>
          <label>Speed<select value={set.speed} onChange={e => void change(`speed=${e.target.value}`)}>
            {set.speed === 0 && <option value={0}>default</option>}
            {[20, 30, 50, 70, 100].map(v => <option key={v} value={v}>{v} cm/s</option>)}</select></label>
          <label>Hop<select value={set.hop_cells} onChange={e => void change(`hop_cells=${e.target.value}`)}>
            {[1, 2, 3, 4, 6, 8, 10].map(v => <option key={v} value={v}>{v * 50} cm</option>)}</select></label>
          <span className="subtle">double-click a cell to fly there</span>
        </div>}
        <span className="live-tag">3D MAP · BUILT LIVE</span>
        <div className="live-legend"><span><i style={{ background: '#9aa5b1' }} />free</span><span><i style={{ background: '#6e2b27' }} />obstacle</span>
          <span><i style={{ background: '#2f5e86' }} />visited</span><span><i style={{ background: '#d9b775' }} />Grok's plan</span></div>
      </section>

      <section className="live-graph">
        <span className="live-tag">GROK · AGENT GRAPH{graph?.goal ? ` · FIND: ${graph.goal.toUpperCase()}` : ''}</span>
        <DecisionGraph graph={graph} state={state} onOpen={setOpen} />
        {open && <NodeDetail node={open} onClose={() => setOpen(null)} />}
      </section>
    </main>
    {toast && <div className="toast" role="status">{toast}<button aria-label="Dismiss" onClick={() => setToast('')}><X size={13} /></button></div>}
  </div>;
}

/** The MJPEG camera stream; reconnects by itself if the picture stops changing for 4 s. */
function CameraStream() {
  const img = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState(url('/video'));
  useEffect(() => {
    const c = document.createElement('canvas'); c.width = 32; c.height = 18; const x = c.getContext('2d')!;
    let last = 0, same = 0;
    const t = window.setInterval(() => {
      let h = 0;
      try { x.drawImage(img.current!, 0, 0, 32, 18); const d = x.getImageData(0, 0, 32, 18).data; for (let i = 0; i < d.length; i += 8) h = (h * 31 + d[i]) | 0; } catch { /* not loaded yet */ }
      same = h === last ? same + 1 : 0; last = h;
      if (same >= 4) { same = 0; setSrc(url(`/video?${Date.now()}`)); }
    }, 1000);
    return () => window.clearInterval(t);
  }, []);
  // backend offline: hide the browser's broken-image icon + alt text (the watchdog above keeps retrying)
  const [broken, setBroken] = useState(false);
  return <img ref={img} className="live-video" src={src} alt="Drone camera" style={{ visibility: broken ? 'hidden' : 'visible' }}
    onError={() => setBroken(true)} onLoad={() => setBroken(false)} />;
}
