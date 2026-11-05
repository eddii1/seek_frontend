import { useState } from 'react';
import { Check, ExternalLink, X } from 'lucide-react';
import { post, url, type Graph, type GraphNode, type GraphStep, type LiveState } from './api';

export const KIND: Record<GraphNode['kind'], string> = {
  observe: 'Observe', think: 'Grok', check: 'Safety check', approve: 'You', act: 'Drone', verify: 'Verify', confirm: 'You confirm',
};

/* The agent as a state machine (LangGraph style). Only states, not every operation:
   recon -> grok -> (continue) goto | look | spin -> back to grok
            grok -> (found) verify -> you -> __end__
   States are laid out left to right in the order the mission first reaches them, so the graph grows to the right. */
type Id = 'setup' | 'start' | 'grok' | 'goto' | 'look' | 'spin' | 'verify' | 'you' | 'end';
const N: Record<Id, { w: number; h: number; name: string; tone: string }> = {
  setup: { w: 140, h: 46, name: 'height check', tone: 'human' },
  start: { w: 110, h: 44, name: 'recon', tone: 'neutral' },
  grok: { w: 160, h: 54, name: 'grok', tone: 'agent' },
  verify: { w: 120, h: 46, name: 'verify', tone: 'agent' },
  you: { w: 120, h: 46, name: 'you', tone: 'human' },
  end: { w: 110, h: 44, name: '__end__', tone: 'end' },
  goto: { w: 130, h: 46, name: 'goto', tone: 'action' },
  look: { w: 130, h: 46, name: 'look', tone: 'action' },
  spin: { w: 130, h: 46, name: 'spin', tone: 'action' },
};
const ROW = 115, GAP = 80, PAD = 30, HEIGHT = 240;
const ACTIONS = ['goto', 'look', 'spin'] as const;
const isAction = (id: string) => (ACTIONS as readonly string[]).includes(id);

const think = (s: GraphStep) => s.nodes.find(n => n.kind === 'think');
/** A node with the images Grok got in that step (they are recorded on the step's observe node). */
const withImages = (s: GraphStep, n: GraphNode): GraphNode =>
  ({ ...n, images: n.images ?? s.nodes.find(o => o.kind === 'observe')?.images });
const reply = (s?: GraphStep) => (s && think(s)?.reply) as { action?: string; cell?: string; heading?: number; thought?: string } | undefined;
const HEAD: Record<number, string> = { 0: 'north', 90: 'east', 180: 'south', 270: 'west' };

/** The latest payload Grok sent to an action, e.g. goto -> "H6". */
function payload(id: Id, steps: GraphStep[]): string {
  const r = reply([...steps].reverse().find(s => reply(s)?.action === id));
  if (!r) return '';
  if (id === 'goto') return `${r.cell}`;
  if (id === 'look') return HEAD[r.heading ?? 0] ?? '';
  return '360°';
}

/** Where the mission is right now: the active state, and the edge being decided or taken. */
function now(g: Graph | null, st: LiveState | null): { active: Id | null; edge: string | null } {
  const steps = g?.steps ?? [];
  const last = steps[steps.length - 1];
  if (!last) return { active: null, edge: null };
  if (st?.status.startsWith('ended')) return { active: st.status.includes('found') ? 'end' : null, edge: null };
  if (last.step < 0) return { active: 'setup', edge: null };
  if (last.step === 0) return { active: 'start', edge: null };
  const r = reply(last), act = (r?.action === 'found' ? 'look' : r?.action) as Id | undefined;
  const busy = (k: GraphNode['kind']) => last.nodes.some(n => n.kind === k && (n.status === 'running' || n.status === 'waiting'));
  if (busy('think')) return { active: 'grok', edge: null };
  if (busy('confirm')) return { active: 'you', edge: 'verify-you' };
  if (busy('verify')) return { active: 'verify', edge: 'grok-verify' };
  if (busy('approve')) return { active: null, edge: act ? `grok-${act}` : null };
  if (busy('act')) return { active: act ?? null, edge: act ? `grok-${act}` : null };
  return { active: 'grok', edge: null };
}

function Edge({ d, kind, label, lx, ly, hot, anchor = 'middle' }: { d: string; kind: 'cond' | 'flow'; label?: string; lx?: number; ly?: number; hot?: boolean; anchor?: 'start' | 'middle' | 'end' }) {
  return <g className={`edge ${kind}${hot ? ' hot' : ''}`}>
    <path d={d} markerEnd={`url(#${hot ? 'arrow-hot' : kind === 'cond' ? 'arrow-cond' : 'arrow-flow'})`} />
    {label && <text x={lx} y={ly} textAnchor={anchor}>{label}</text>}
  </g>;
}

export default function DecisionGraph({ graph, state, onOpen }: {
  graph: Graph | null; state: LiveState | null; onOpen: (n: GraphNode) => void;
}) {
  const steps = (graph?.steps ?? []).filter(s => s.step >= 0 || s.nodes.some(n => n.kind === 'act' && n.status === 'done'));
  const { active, edge } = now(graph, state);
  const count = (id: Id) => steps.filter(s => reply(s)?.action === id).length;
  const open = (id: Id) => {
    const kind: GraphNode['kind'] = id === 'grok' ? 'think' : id === 'verify' ? 'verify' : id === 'you' ? 'confirm' : 'act';
    const match = [...steps].reverse().flatMap(s => s.nodes.filter(n => n.kind === kind
      && (kind !== 'act' || (isAction(id) && reply(s)?.action === id) || (id === 'start' && s.step === 0)
        || (id === 'setup' && s.step < 0))).map(n => withImages(s, n)));
    if (match[0]) onOpen(match[0]);
  };
  /* Nodes appear only once the mission has asked for them (the canvas starts empty), in the order they were reached. */
  const order: Id[] = [];
  const reach = (id: Id) => { if (!order.includes(id)) order.push(id); };
  for (const s of steps) {
    reach(s.step < 0 ? 'setup' : s.step === 0 ? 'start' : 'grok');
    const act = reply(s)?.action ?? think(s)?.partial?.action;
    if (act && isAction(act)) reach(act as Id);
    if (s.nodes.some(n => n.kind === 'verify')) reach('verify');
    if (s.nodes.some(n => n.kind === 'confirm')) reach('you');
  }
  if (active === 'end') reach('end');
  const seen = new Set(order);
  const both = (a: Id, b: Id) => seen.has(a) && seen.has(b);
  const X: Partial<Record<Id, number>> = {};
  let cursor = PAD;
  for (const id of order) { X[id] = cursor + N[id].w / 2; cursor += N[id].w + GAP; }
  const width = Math.max(cursor - GAP + PAD, 620);
  const B = (id: Id) => ({ ...N[id], x: X[id] ?? 0, y: ROW });
  /** An edge from a to b: straight when b comes right after a, else an arc (forward above, backward below). */
  const link = (a: Id, b: Id, lane = 0) => {
    const ia = order.indexOf(a), ib = order.indexOf(b), A = B(a), Z = B(b);
    if (ib === ia + 1) return { d: `M${A.x + A.w / 2},${ROW} L${Z.x - Z.w / 2},${ROW}`, lx: (A.x + A.w / 2 + Z.x - Z.w / 2) / 2, ly: ROW - 8 };
    const up = ib > ia, sy = up ? -1 : 1, lift = Math.min(100, 40 + 22 * Math.abs(ib - ia)) + lane * 14;
    const x1 = A.x + (up ? 18 : -18), x2 = Z.x + (up ? -18 : 18), y1 = ROW + sy * A.h / 2, y2 = ROW + sy * Z.h / 2, yc = ROW + sy * lift;
    return { d: `M${x1},${y1} C${x1},${yc} ${x2},${yc} ${x2},${y2}`, lx: (x1 + x2) / 2, ly: ROW + sy * (lift * 0.75 + 4) };
  };
  const lastStep = steps[steps.length - 1], typing = lastStep && think(lastStep)?.partial;
  const lastTitle = typing ? (typing.action ? `${typing.action} ${typing.cell ?? ''}…` : 'thinking…') : steps.length > 1 ? lastStep.title : '';

  return <div className="sm-wrap">
    <div className="sm-main">
    <svg className="sm" role="img" aria-label="Agent graph: height check, reconnaissance, reasoning and actions"
      viewBox={`0 0 ${width} ${HEIGHT}`} preserveAspectRatio="xMinYMid meet">
      <defs>
        {[['arrow-flow', '#6f8fb3'], ['arrow-cond', '#a77bdb'], ['arrow-hot', '#d9b775']].map(([id, c]) =>
          <marker key={id} id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={c} /></marker>)}
      </defs>
      {both('setup', 'start') && <Edge kind="flow" {...link('setup', 'start')} label="begin" />}
      {both('start', 'grok') && <Edge kind="flow" {...link('start', 'grok')} />}
      {ACTIONS.filter(a => both('grok', a)).map((a, i) => <g key={a}>
        <Edge kind="cond" hot={edge === `grok-${a}`} {...link('grok', a, i)} label={i === 0 ? 'continue' : undefined} />
        <Edge kind="flow" {...link(a, 'grok', i)} />
      </g>)}
      {both('grok', 'verify') && <Edge kind="cond" hot={edge === 'grok-verify'} {...link('grok', 'verify', 3)} label="found" />}
      {both('verify', 'you') && <Edge kind="flow" hot={edge === 'verify-you'} {...link('verify', 'you')} label="matches" />}
      {both('you', 'end') && <Edge kind="cond" {...link('you', 'end')} label="confirmed" />}
      {seen.has('verify') && <Edge kind="cond" {...link('verify', 'grok', 3)} label="not it" />}
      {seen.has('you') && <Edge kind="cond" {...link('you', 'grok', 4)} label="search on" />}
      {order.map(id => {
        const b = B(id), c = id === 'grok' ? steps.filter(s => s.step > 0).length : isAction(id) ? count(id) : 0;
        const sub = id === 'grok' ? lastTitle : isAction(id) ? payload(id, steps) : '';
        const asked = !active && edge === `grok-${id}`;
        return <g key={id} className={`sm-node ${b.tone}${active === id ? ' active' : ''}${asked ? ' asked' : ''}`}
          transform={`translate(${b.x - b.w / 2},${b.y - b.h / 2})`} onClick={() => open(id)}>
          <rect width={b.w} height={b.h} rx={b.h / 2} />
          <text className="name" x={b.w / 2} y={sub ? b.h / 2 - 3 : b.h / 2 + 4}>{b.name}</text>
          {sub && <text className="sub" x={b.w / 2} y={b.h / 2 + 13}>{sub}</text>}
          {c > 0 && <g className="badge" transform={`translate(${b.w - 2},2)`}><circle r={9} /><text y={3.5}>{c}</text></g>}
        </g>;
      })}
    </svg>
    <FlightPath steps={steps} onOpen={onOpen} />
    </div>
    <Inspector graph={graph} state={state} onOpen={onOpen} />
  </div>;
}

/** Under the graph: where the drone actually went, one chip per move, newest on the right. */
function FlightPath({ steps, onOpen }: { steps: GraphStep[]; onOpen: (n: GraphNode) => void }) {
  const moves = steps.flatMap(s => {
    const r = reply(s), t = think(s), act = s.nodes.find(n => n.kind === 'act');
    const refused = s.nodes.some(n => n.status === 'refused' || n.status === 'rejected');
    if (s.step === 0) return act ? [{ s, n: act, icon: '⟳', text: 'recon', cls: act.status }] : [];
    if (s.step < 0) {
      const n = s.nodes[s.nodes.length - 1];
      return n ? [{ s, n, icon: '↕', text: 'height check', cls: n.status }] : [];
    }
    if (!r?.action || !t) return [];
    const n = act ?? t, cls = refused ? 'refused' : n.status;
    if (r.action === 'goto') return [{ s, n, icon: '', text: `${r.cell}${act?.flown ? ` · ${act.flown} m` : ''}`, cls }];
    if (r.action === 'spin') return [{ s, n, icon: '⟳', text: '', cls }];
    if (r.action === 'look') return [{ s, n, icon: '◉', text: HEAD[r.heading ?? 0] ?? '', cls }];
    if (r.action === 'found') return [{ s, n, icon: '★', text: 'found', cls: s.nodes.some(x => x.kind === 'confirm' && x.status === 'done') ? 'found' : cls }];
    return [];
  });
  const total = steps.reduce((m, s) => m + (s.nodes.find(n => n.kind === 'act')?.flown ?? 0), 0);
  if (!moves.length) return null;
  return <div className="fp">
    <span className="fp-label">PATH{total > 0 && <b> {total.toFixed(1)} m</b>}</span>
    <div className="fp-row" ref={el => { if (el) el.scrollLeft = el.scrollWidth; }}>
      {moves.map((m, i) => <span key={m.s.step} className="fp-item">
        {i > 0 && <i className="fp-arrow">▸</i>}
        <button className={`fp-chip ${m.cls}`} title={`#${m.s.step} ${reply(m.s)?.thought ?? m.s.title}`} onClick={() => onOpen(withImages(m.s, m.n))}>
          {m.icon && <span className="fp-icon">{m.icon}</span>}{m.text}
        </button>
      </span>)}
    </div>
  </div>;
}

/** Next to the graph: the decision you need to make, or what Grok is doing and the history of steps. */
function Inspector({ graph, state, onOpen }: { graph: Graph | null; state: LiveState | null; onOpen: (n: GraphNode) => void }) {
  const [note, setNote] = useState('');
  const steps = (graph?.steps ?? []).filter(s => s.step > 0);
  const decide = async (ok: boolean) => { await post('/approve', { ok, note }); setNote(''); };

  if (state?.waiting && state.plan) return <div className="sm-side ask">
    <span className="eyebrow">DECISION NEEDED</span>
    <strong>{state.plan.text}</strong>
    <p>{state.plan.thought}</p>
    <input value={note} onChange={e => setNote(e.target.value)} placeholder="Why not? (optional, Grok reads it)"
      onKeyDown={e => { if (e.key === 'Enter') void decide(false); }} />
    <div className="sm-buttons">
      <button className="no" onClick={() => void decide(false)}><X size={13} />Reject</button>
      <button className="yes" onClick={() => void decide(true)}><Check size={13} />Approve</button>
    </div>
  </div>;

  if (state?.confirm) return <div className="sm-side ask">
    <span className="eyebrow">IS THIS IT? · VERIFIED ON THE LIVE CAMERA</span>
    <div className="sm-find"><a href={url(`/found/${state.confirm.photo}`)} target="_blank" rel="noreferrer"><img src={url(`/found/${state.confirm.photo}`)} alt="Possible match" /></a>
      <p>{state.confirm.evidence}</p></div>
    <div className="sm-buttons">
      <button className="no" onClick={() => void post('/confirm/no')}><X size={13} />No, keep searching</button>
      <button className="yes" onClick={() => void post('/confirm/yes')}><Check size={13} />Yes, that's it</button>
    </div>
  </div>;

  const last = graph?.steps[graph.steps.length - 1];
  return <div className="sm-side">
    <span className="eyebrow">{state?.running ? 'NOW' : graph?.goal ? 'LAST MISSION' : 'GROK'}</span>
    <strong className="sm-now">{state?.status || 'Describe what to find and press Start search.'}</strong>
    {last && <LiveChain step={last} onOpen={onOpen} />}
    {steps.length > 0 && <div className="sm-history">
      {[...steps].reverse().map(s => {
        const bad = s.nodes.some(n => ['refused', 'rejected', 'failed'].includes(n.status));
        return <button key={s.step} onClick={() => { const t = think(s); if (t) onOpen(withImages(s, t)); }}>
          <span className="mono">#{s.step}</span><span className="t">{s.title}</span><i className={bad ? 'bad' : ''}>{bad ? '✕' : '✓'}</i>
          {graph?.phoenix && s.trace && <a href={graph.phoenix + s.trace} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title="Trace in Phoenix"><ExternalLink size={10} /></a>}
        </button>;
      })}
    </div>}
  </div>;
}

/** The current step building up live: each node appears as the harness creates it, Grok's words as they stream. */
function LiveChain({ step, onOpen }: { step: GraphStep; onOpen: (n: GraphNode) => void }) {
  return <div className="chain">
    {step.nodes.map(n => {
      const p = n.partial, typing = n.status === 'running' && !!n.stream;
      const text = typing ? (p?.thought ?? p?.evidence ?? p?.seen ?? '') : n.kind === 'think' ? n.detail : n.detail && n.kind !== 'observe' ? n.detail : '';
      return <button key={n.id} className={`chain-node ${n.kind} ${n.status}`} onClick={() => onOpen(withImages(step, n))}>
        <span className="chain-dot" />
        <span className="chain-body">
          <span className="chain-head"><b>{KIND[n.kind]}</b> {typing && p?.action ? `${p.action} ${p.cell ?? ''}` : n.label}
            {n.seconds != null && <span className="subtle"> · {n.seconds}s</span>}</span>
          {typing && p?.seen && p.thought !== undefined && <span className="chain-seen">saw: {p.seen}</span>}
          {text && <span className="chain-text">{text}{typing && <i className="caret" />}</span>}
          {typing && !text && <span className="chain-text"><i className="caret" /></span>}
        </span>
      </button>;
    })}
  </div>;
}

/** Everything behind one step: what Grok saw, the images it got, the prompt, its raw answer. */
export function NodeDetail({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  const images = [...(node.images ?? []), ...(node.photo ? [node.photo] : [])];
  return <div className="node-detail">
    <header><span className="eyebrow">{KIND[node.kind].toUpperCase()} · {node.status.toUpperCase()}</span><strong>{node.label}</strong>
      <button className="icon-button" onClick={onClose} aria-label="Close details"><X size={14} /></button></header>
    <div className="node-detail-body">
      <div className="node-detail-text">
        {node.detail && <p>{node.detail}</p>}
        {node.seen && <p><span className="subtle">Grok saw:</span> {node.seen}</p>}
        {node.model && <p><span className="subtle">Model:</span> <span className="mono">{node.model}</span></p>}
        {node.prompt && <p><a className="text-link" href={url(`/files/${node.prompt}`)} target="_blank" rel="noreferrer">Full prompt sent to Grok<ExternalLink size={10} /></a></p>}
        {node.stream && <pre>{node.stream}<i className="caret" /></pre>}
        {node.reply && <pre>{JSON.stringify(node.reply, null, 1)}</pre>}
      </div>
      {images.length > 0 && <div className="node-detail-images">
        {images.map(f => <a key={f} href={url(`/files/${f}`)} target="_blank" rel="noreferrer" title={f}><img src={url(`/files/${f}`)} alt={f} /></a>)}
      </div>}
    </div>
  </div>;
}
