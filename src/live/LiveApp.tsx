import { useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, RotateCw, Square, X } from 'lucide-react';
import DecisionGraph, { NodeDetail } from './DecisionGraph';
import Map3D from './Map3D';
import { post, url, usePoll, useStream, type Graph, type GraphNode, type LiveState } from './api';
import './live.css';

/** SEEK live command center: drone camera and 3D map on top, Grok's state graph across the bottom. */
export default function LiveApp() {
  const state = usePoll<LiveState>('/state', 700);
  const graph = useStream<Graph>('/graph/stream');
  const [goal, setGoal] = useState('');
  const [open, setOpen] = useState<GraphNode | null>(null);
  const [toast, setToast] = useState('');
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

  return <div className="live-shell">
    <header className="live-top">
      <a className="brand" href="#" aria-label="SEEK command center"><div className="brand-symbol"><span /><span /><span /><span /><i /></div><span className="brand-word">SEEK</span></a>
      <div className="live-goal">
        <span className="eyebrow">FIND</span>
        <input id="goal" value={goal} disabled={running} onChange={e => setGoal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') start(); }}
          placeholder="Describe the person or object, e.g. a person in a dark blue t-shirt working on a laptop" />
      </div>
      <label className="live-auto" title="Off: you approve every action before it runs">
        <button className={`switch ${state && !state.approve_each ? 'on' : ''}`} role="switch" aria-checked={!!state && !state.approve_each}
          onClick={() => void act(`/auto/${state?.approve_each ? 'on' : 'off'}`)}><span /></button>Automatic</label>
      {running
        ? <button className="button button-subtle" onClick={() => void act('/agent/stop')}><Square size={12} />Stop search</button>
        : <button className="button button-primary" disabled={!connected} onClick={start}><Play size={12} fill="currentColor" />Start search</button>}
      <button className="live-ghost" disabled={running} onClick={() => { setOpen(null); void act('/map/reset'); }} title="Forget the map: start over in a new place"><RotateCcw size={12} />New map</button>
      <span className={`live-status ${connected ? '' : 'down'}`}><i />{!connected ? 'Backend offline: run uv run fleet-viewer' : state!.status || 'Ready'}</span>
      {state?.kind === 'drone' && <button className="button button-land" onClick={() => void act('/cmd/land')} title="Take over from the agent and land now">LAND</button>}
      <button className="button button-danger" onClick={() => void act('/cmd/emergency')} title="Cuts the motors at once: the drone DROPS. Only to avoid a crash.">KILL MOTORS</button>
    </header>

    <main className="live-main">
      <section className="live-camera">
        <CameraStream />
        <span className="live-tag"><i className={running ? 'on' : ''} />CAMERA · HDG {String(Math.round(state?.pose.yaw ?? 0) % 360).padStart(3, '0')}°{state?.kind === 'drone' ? ` · ALT ${(state.pose.z ?? 0).toFixed(1)} M` : ''}{state?.battery != null ? ` · BAT ${state.battery}%` : ''}</span>
        {state?.instruction && <div className="live-instruction"><span>{state.instruction}{state.progress ? ` · ${state.progress}` : ''}</span>
          <button className="button" onClick={() => void act('/done')}>Done</button></div>}
        {state && (!running || state.kind === 'drone') && <div className="live-manual" title={running ? 'Any button takes over from the agent' : undefined}>
          {state.kind === 'drone' && <button onClick={() => void act('/cmd/takeoff')}>Take off</button>}
          <button onClick={() => void act('/cmd/spin')}>Spin</button>
          <button onClick={() => void act('/cmd/turn_left?arg=45')} title="Turn left 45 degrees"><RotateCcw size={11} />45°</button>
          <button onClick={() => void act('/cmd/forward?arg=50')}>Fwd 50</button>
          <button onClick={() => void act('/cmd/turn_right?arg=45')} title="Turn right 45 degrees"><RotateCw size={11} />45°</button>
          {state.kind === 'drone' && <button onClick={() => void act('/cmd/up?arg=30')} title="Climb 30 cm (max 2 m)">Up 30</button>}
          {state.kind === 'drone' && <button onClick={() => void act('/cmd/down?arg=30')} title="Descend 30 cm (min 0.4 m)">Down 30</button>}
          {state.kind === 'drone' && <button onClick={() => void act('/cmd/land')}>Land</button>}
        </div>}
      </section>

      <section className="live-map">
        <Map3D />
        <span className="live-tag">3D MAP · BUILT LIVE</span>
        <div className="live-legend"><span><i style={{ background: '#9aa5b1' }} />free</span><span><i style={{ background: '#6e2b27' }} />obstacle</span>
          <span><i style={{ background: '#2f5e86' }} />visited</span><span><i style={{ background: '#76dcc1' }} />Grok's plan</span></div>
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
  return <img ref={img} className="live-video" src={src} alt="Drone camera" />;
}
