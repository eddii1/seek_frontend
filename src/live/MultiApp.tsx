import { useState } from 'react';
import { Play, Settings2, Square } from 'lucide-react';
import Map3D from './Map3D';
import VoiceButton from './VoiceButton';
import DecisionGraph, { NodeDetail } from './DecisionGraph';
import Narrator from './Narrator';
import Logo from './Logo';
import { post, url, usePoll, type Graph, type GraphNode, type LiveState } from './api';
import './live.css';
import './multi.css';

interface Team {
  running: boolean; calibration: object | null; goal: string; status: string; rover: string;
  rover_search?: string; candidate: { device: string; evidence: string } | null;
  events: { t: number; lane: string; text: string }[];
}

const battery = (b: number | null | undefined) => (b === null || b === undefined ? 'BAT --' : `BAT ${Math.round(b)}%`);

export default function MultiApp() {
  const team = usePoll<Team>('/multi/state', 700);
  const drone = usePoll<LiveState>('/multi/drone/state', 700);
  const graph = usePoll<Graph>('/multi/drone/graph', 1200);
  const roverGraph = usePoll<Graph>('/multi/rover/graph', 1200);
  const rover = usePoll<Omit<LiveState, 'kind'>>('/multi/rover/state', 700);
  const [droneGoal, setDroneGoal] = useState('');
  const [roverGoal, setRoverGoal] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState<GraphNode | null>(null);
  const [roverOpen, setRoverOpen] = useState<GraphNode | null>(null);
  const [setup, setSetup] = useState(false);
  const [measure, setMeasure] = useState({ x: 0, y: 0, yaw: 0, camera_height: .3, body_width: .6, body_height: .5,
    fov_diag: 82.6, y_sign: 1, yaw_sign: -1 });
  const act = async (path: string, body: unknown = {}) => {
    try { setError(''); await post(`/multi${path}`, body); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const candidate = team?.candidate && <div className="multi-candidate" role="status">
    <span className="eyebrow">CHECK FIND · {team.candidate.device.toUpperCase()} HELD FOR REVIEW</span>
    <p>{team.candidate.evidence}</p>
    <div>
      {team.candidate.device === 'rover' && <a className="subtle" href={url('/multi/candidate.jpg')} target="_blank" rel="noreferrer">View evidence frame</a>}
      <button className="button" onClick={() => void act('/candidate/no')}>Reject, keep searching</button>
      <button className="button button-primary" onClick={() => void act('/candidate/yes')}>Confirm find</button>
    </div>
  </div>;
  return <div className="live-shell">
    <header className="live-top multi-top">
      <Logo href="/" />
      <a className="multi-back" href="/" title="Back to the single-drone view">Single device</a>
      <div className="multi-goals">
        <div className="live-goal"><span className="eyebrow">DRONE</span><input aria-label="Drone goal" value={droneGoal} onChange={e => setDroneGoal(e.target.value)}
          placeholder="What should the drone find?" /><VoiceButton onText={setDroneGoal} /></div>
        <div className="live-goal"><span className="eyebrow">ROVER</span><input aria-label="Rover goal" value={roverGoal} onChange={e => setRoverGoal(e.target.value)}
          placeholder="What should the rover find? (empty = same)" /><VoiceButton onText={setRoverGoal} /></div>
      </div>
      <button className="button button-primary multi-start" disabled={!droneGoal.trim() && !roverGoal.trim()}
        onClick={() => void act('/start', { drone_goal: droneGoal || roverGoal, rover_goal: roverGoal || droneGoal })}>
        <Play size={12} fill="currentColor" />Start both</button>
      <div className="multi-stop" role="group" aria-label="Stop">
        <span className="eyebrow">STOP</span>
        <button onClick={() => void act('/stop/drone')} title="Drone hovers; the rover keeps going">Drone</button>
        <button onClick={() => void act('/stop/rover')} title="Rover halts; the drone keeps going">Rover</button>
        <button className="all" onClick={() => void act('/stop')} title="Drone hovers and rover halts"><Square size={11} fill="currentColor" />All</button>
      </div>
      <button className="button multi-land" onClick={() => void act('/manual/drone/land')}>Land drone</button>
      <Narrator graph={graph} found={drone?.confirm?.evidence} />
      <button className="live-ghost" onClick={() => setSetup(true)}><Settings2 size={12} />Rover setup</button>
    </header>
    <main className="multi-main">
      <section className="multi-device">
        <div className="multi-camera"><img src={url('/multi/video/drone')} alt="Drone camera" />
          <span className="multi-label">DRONE</span>
          {drone && <span className="multi-readout">{drone.pose.z.toFixed(1)} M · {battery(drone.battery)}</span>}
          {drone && <label className="multi-auto" title="On: the drone acts without asking. Off: you approve each move.">
            <button className={`switch ${!drone.approve_each ? 'on' : ''}`} role="switch" aria-checked={!drone.approve_each}
              onClick={() => void act(`/drone/auto/${drone.approve_each ? 'on' : 'off'}`)}><span /></button>Autonomous</label>}
          <div className="multi-device-controls">
            <button className="button" disabled={drone?.running || !droneGoal.trim()} onClick={() => void act('/start/drone', { goal: droneGoal })}>Start drone</button>
            <button className="button live-hover" onClick={() => void act('/stop/drone')}>Stop drone</button>
          </div>
          {drone?.height_waiting && <div className="multi-height">
            <b>Adjust drone height before search</b>
            <button className="button" disabled={drone.busy} onClick={() => void act('/drone/height/down')}>Down 20 cm</button>
            <button className="button" disabled={drone.busy} onClick={() => void act('/drone/height/up')}>Up 20 cm</button>
            <button className="button button-primary" disabled={drone.busy} onClick={() => void act('/drone/ready')}>Begin search</button>
          </div>}
          {team?.candidate && team.candidate.device !== 'rover' && candidate}
        </div>
        <section className="live-graph multi-lane"><span className="live-tag">DRONE AGENT</span>
          <DecisionGraph graph={graph} state={drone} onOpen={setOpen} />
          {open && <NodeDetail node={open} onClose={() => setOpen(null)} />}
        </section>
      </section>
      <section className="multi-device">
        <div className="multi-camera"><img src={url('/multi/video/rover')} alt="Rover camera" />
          <span className="multi-label">ROVER</span>
          {rover && <span className="multi-readout">{battery(rover.battery)}</span>}
          <div className="multi-device-controls">
            <button className="button" disabled={team?.running || !(roverGoal || droneGoal).trim()} onClick={() => void act('/start/rover', { goal: roverGoal || droneGoal })}>Start rover</button>
            <button className="button live-hover" onClick={() => void act('/stop/rover')}>Stop rover</button>
          </div>
          {team?.candidate?.device === 'rover' ? candidate : team?.rover && <p className="multi-camera-status">{team.rover}</p>}
        </div>
        <section className="live-graph multi-lane multi-rover-lane"><span className="live-tag">ROVER AGENT · OWN GROUND MAP</span>
          <DecisionGraph graph={roverGraph} state={rover ? { ...rover, kind: 'webcam' } : null} onOpen={setRoverOpen} />
          {roverOpen && <div className="node-detail">
            <header><span className="eyebrow">ROVER · {roverOpen.kind} · {roverOpen.status}</span>
              <strong>{roverOpen.label}</strong><button className="icon-button" onClick={() => setRoverOpen(null)}>Close</button></header>
            <div className="node-detail-body"><div className="node-detail-text">
              <p>{roverOpen.detail}</p>{roverOpen.model && <p>Model: {roverOpen.model}</p>}
              {roverOpen.reply && <pre>{JSON.stringify(roverOpen.reply, null, 1)}</pre>}
            </div></div>
          </div>}
        </section>
      </section>
      <section className="live-map"><Map3D endpoint="/multi/points" />
        <span className="live-tag">DRONE 3D MAP · MINT ROVER POSITION + TRACK · SEPARATE NAVIGATION MAPS</span>
      </section>
      {error && <p className="multi-error" role="alert">{error}</p>}
    </main>
    {setup && <div className="multi-setup-backdrop" onClick={() => setSetup(false)}>
      <section className="multi-calibration" role="dialog" aria-modal="true" aria-label="Rover setup" onClick={e => e.stopPropagation()}>
        <strong>Rover setup <button className="button" onClick={() => setSetup(false)}>Close</button></strong>
        <span className="subtle">Optional. Defaults are used if you skip this. The rover's origin is where it sits when it starts. Heading 0=north, 90=east.</span>
        <div>{Object.entries(measure).map(([key, value]) => <label key={key}>{key.replaceAll('_', ' ')}
          <input type="number" step={key.includes('sign') ? 2 : .1} value={value} disabled={team?.running}
            onChange={e => setMeasure({ ...measure, [key]: Number(e.target.value) })} />
        </label>)}</div>
        <button className="button button-primary" disabled={team?.running}
          onClick={() => void act('/calibrate', measure)}>Save rover setup</button>
        <span>{team?.status || 'Start fleet-multiplayer on port 8002'}</span>
        {error && <p role="alert">{error}</p>}
      </section>
    </div>}
  </div>;
}
