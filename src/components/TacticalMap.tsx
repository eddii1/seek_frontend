import { useId, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Layers2, LocateFixed, Minus, Plus, Navigation2 } from 'lucide-react';
import type { MissionState, Region, Scenario } from '../types';
import './map.css';

type Props = {
  state: MissionState;
  scenario: Scenario;
  selectedRegionId: string | null;
  onSelectRegion: (id: string) => void;
  showTrail: boolean;
  reducedMotion: boolean;
};

function Fixtures({ region, visible }: { region: Region; visible: boolean }) {
  const { x, y, width: w, height: h, kind } = region;
  const color = visible ? '#294440' : '#202d38';
  const common = { fill: visible ? '#13252b' : '#111c26', stroke: color, strokeWidth: 1.2 };
  return <g pointerEvents="none" opacity={visible ? 0.9 : 0.38}>
    {kind === 'gallery' && <>
      <path d={`M${x + 27} ${y + 59}h${w * 0.27}m${w * 0.25} 0h${w * 0.23}`} stroke={color} strokeWidth="5" />
      <path d={`M${x + 27} ${y + 60}v${h - 101}M${x + w - 27} ${y + 60}v${h - 101}`} stroke={color} strokeWidth="3" />
      {[0, 1, 2].map(i => <g key={i} transform={`translate(${x + 43 + (w - 86) * i / 2} ${y + h - 49})`}>
        <rect x="-10" y="-10" width="20" height="20" rx="1" {...common} />
        <rect x="-5" y="-5" width="10" height="10" fill="none" stroke={color} />
      </g>)}
    </>}
    {kind === 'hall' && <>
      <rect x={x + w / 2 - 30} y={y + h / 2 - 18} width="60" height="60" rx="2" {...common} />
      <circle cx={x + w / 2} cy={y + h / 2 + 12} r="18" fill="none" stroke={color} />
      {[0, 1].map(i => <g key={i}><rect x={x + 24} y={y + 61 + i * (h - 103)} width="26" height="10" {...common} /><rect x={x + w - 50} y={y + 61 + i * (h - 103)} width="26" height="10" {...common} /></g>)}
      <path d={`M${x + w / 2} ${y + 48}v${h - 63}M${x + 65} ${y + h / 2 + 12}h${w - 130}`} stroke={color} strokeDasharray="2 5" opacity="0.7" />
    </>}
    {kind === 'storage' && [0, 1, 2].map(i => <g key={i}>
      <rect x={x + 27 + i * (w - 79) / 2} y={y + 57} width="25" height={h - 87} {...common} />
      {[0, 1, 2].map(j => <path key={j} d={`M${x + 27 + i * (w - 79) / 2} ${y + 57 + j * (h - 87) / 3}h25`} stroke={color} />)}
    </g>)}
    {kind === 'office' && [0, 1].map(i => <g key={i}>
      <rect x={x + 26 + i * (w - 85)} y={y + 58} width="33" height={h - 92} {...common} />
      <rect x={x + 39 + i * (w - 85)} y={y + 66} width="10" height="16" fill="none" stroke={color} />
      <path d={`M${x + 68 + i * (w - 111)} ${y + 65}v22`} stroke={color} strokeWidth="5" />
    </g>)}
    {kind === 'lobby' && <>
      <path d={`M${x + 31} ${y + 65}h${w - 62}v24h-${w - 80}v-10h${w - 93}`} fill="none" stroke={color} strokeWidth="3" />
      {[0, 1].map(i => <circle key={i} cx={x + 28 + i * (w - 56)} cy={y + h - 29} r="9" {...common} />)}
    </>}
  </g>;
}

export default function TacticalMap({ state, scenario, selectedRegionId, onSelectRegion, showTrail, reducedMotion }: Props) {
  const id = useId().replace(/:/g, '');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [legend, setLegend] = useState(true);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const running = state.status === 'searching' || state.status === 'investigating';
  const observedCount = Object.keys(state.observations).length;
  const selected = scenario.regions.find(r => r.id === selectedRegionId);
  const destination = scenario.regions.find(r => r.id === state.destinationId);
  const droneColor = state.status === 'completed' ? '#8be3ac' : '#6ae2c1';
  function pointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if ((event.target as Element).closest('[data-region]') || event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!drag.current || !svg.current) return;
    const bounds = svg.current.getBoundingClientRect();
    const ratio = Math.max(920 / bounds.width, 720 / bounds.height);
    setPan({ x: Math.max(-450, Math.min(450, drag.current.px + (event.clientX - drag.current.x) * ratio)), y: Math.max(-350, Math.min(350, drag.current.py + (event.clientY - drag.current.y) * ratio)) });
  }
  function resetView() { setZoom(1); setPan({ x: 0, y: 0 }); }

  return <div className={`seek-map ${reducedMotion ? 'seek-map-reduced' : ''}`}>
    <div className="seek-map-topline">
      <div><span className="seek-map-live-dot" /><span>LOCAL EXPLORATION</span><span className="seek-map-top-divider">/</span><span>LEVEL 01</span></div>
      <span className="seek-map-scale">1 : {Math.round(250 / zoom)}</span>
    </div>
    <svg ref={svg} viewBox="0 0 920 720" className="seek-map-canvas" aria-label={`${scenario.name} tactical exploration map. ${observedCount} of ${scenario.regions.length} sectors observed.`} role="group" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <defs>
        <pattern id={`${id}-grid`} width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="#23313e" strokeWidth="0.6" opacity="0.45" /></pattern>
        <pattern id={`${id}-major`} width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill={`url(#${id}-grid)`} /><path d="M100 0H0V100" fill="none" stroke="#2d3e4d" strokeWidth="0.8" opacity="0.3" /><circle cx="0" cy="0" r="1.3" fill="#465766" opacity="0.5" /></pattern>
        <pattern id={`${id}-fog`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#607183" strokeWidth="0.7" opacity="0.075" /></pattern>
        <radialGradient id={`${id}-scan`}><stop offset="0%" stopColor="#68dfbe" stopOpacity="0.12" /><stop offset="75%" stopColor="#68dfbe" stopOpacity="0.04" /><stop offset="100%" stopColor="#68dfbe" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}-cone`} x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#6ae2c1" stopOpacity="0.24" /><stop offset="100%" stopColor="#6ae2c1" stopOpacity="0" /></linearGradient>
        <filter id={`${id}-glow`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      <rect width="920" height="720" fill={`url(#${id}-major)`} />
      <g transform={`translate(${460 + pan.x} ${360 + pan.y}) scale(${zoom}) translate(-460 -360)`}>
        <g className="seek-map-coordinates" aria-hidden="true">
          {[100, 200, 300, 400, 500, 600, 700, 800].map(x => <g key={x}><text x={x} y="56" textAnchor="middle">{((x - 100) / 10).toFixed(0).padStart(2, '0')}</text><path d={`M${x} 68v5M${x} 652v5`} /></g>)}
          {[100, 200, 300, 400, 500, 600].map(y => <g key={y}><text x="62" y={y + 3} textAnchor="middle">{((700 - y) / 10).toFixed(0).padStart(2, '0')}</text><path d={`M73 ${y}h5M842 ${y}h5`} /></g>)}
        </g>
        <path d="M85 86H835V650H624M596 650H85Z" fill="#0d171f" fillOpacity="0.62" stroke="#374550" strokeWidth="3" />
        <path d="M88 255H832V275H88ZM88 475H832V495H88Z" fill="#12212a" opacity="0.8" />
        <path d="M300 88H320V647H300ZM600 88H620V647H600Z" fill="#12212a" opacity="0.8" />
        <g stroke="#344854" strokeWidth="0.7" strokeDasharray="3 8" opacity="0.4"><path d="M95 265H825M95 485H825M310 90V645M610 90V645" /></g>
        {scenario.regions.map(region => {
          const obs = state.observations[region.id];
          const active = state.currentRegionId === region.id && state.destinationId === region.id && running;
          const isSelected = selectedRegionId === region.id;
          const candidate = [...state.candidates].reverse().find(c => c.regionId === region.id && c.status !== 'rejected');
          const possible = !!obs && !obs.inspected && obs.people.length > 0;
          const color = candidate ? candidate.status === 'confirmed' ? '#84dba4' : '#e6bb72' : possible ? '#e6bb72' : active ? '#6ae2c1' : obs ? '#3f6b63' : '#2a3946';
          const doorY = region.y < 200 ? region.y + region.height : region.y;
          const cx = region.x + region.width / 2;
          return <g key={region.id} data-region={region.id} className={`seek-map-region ${obs ? 'is-observed' : ''} ${isSelected ? 'is-selected' : ''}`} role="button" tabIndex={0} aria-label={`Sector ${region.id}, ${region.name}, ${candidate ? 'candidate detected' : possible ? 'possible match under inspection' : obs ? 'observed' : 'unexplored'}. View sector details.`} onClick={() => onSelectRegion(region.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectRegion(region.id); } }}>
            <rect className="seek-map-room-fill" x={region.x} y={region.y} width={region.width} height={region.height} fill={candidate || possible ? '#25271f' : active ? '#132c2b' : obs ? '#102323' : '#101a24'} fillOpacity={candidate || obs ? 0.82 : 0.91} stroke={color} strokeWidth={active || candidate || possible ? 2 : 1.5} />
            <rect x={region.x + 5} y={region.y + 5} width={region.width - 10} height={region.height - 10} fill="none" stroke={color} strokeWidth="0.6" opacity="0.26" />
            {!obs && <rect x={region.x + 1} y={region.y + 1} width={region.width - 2} height={region.height - 2} fill={`url(#${id}-fog)`} pointerEvents="none" />}
            <Fixtures region={region} visible={!!obs} />
            <rect x={cx - 15} y={doorY - 3} width="30" height="6" fill="#12212a" />
            <path d={`M${cx - 15} ${doorY}v${region.y < 200 ? -26 : 26}m0 0a26 26 0 0 ${region.y < 200 ? 1 : 0} 26 ${region.y < 200 ? 26 : -26}`} fill="none" stroke={color} strokeWidth="0.7" opacity="0.65" />
            <text x={region.x + 15} y={region.y + 24} className="seek-map-room-id" fill={obs ? '#adccc4' : '#617380'}>{region.id}</text>
            <text x={region.x + 34} y={region.y + 23} className="seek-map-room-name" fill={obs ? '#91aca8' : '#566c7d'}>{region.name.toUpperCase()}</text>
            <circle cx={region.x + region.width - 15} cy={region.y + 20} r="2.5" fill={obs ? color : '#344656'} />
            {possible && <g transform={`translate(${region.x + region.width - 18} ${region.y + region.height - 18})`} pointerEvents="none"><circle r="7" fill="#e6bb72" fillOpacity="0.12" stroke="#e6bb72" strokeWidth="0.8" className="seek-map-candidate-ring" /><circle r="2" fill="#e6bb72" /><text x="-12" y="3" textAnchor="end" fill="#bda06f" className="seek-map-candidate-label">INSPECTING CUE</text></g>}
            {active && <rect x={region.x + 1} y={region.y + 1} width={region.width - 2} height={region.height - 2} fill="none" stroke="#6ae2c1" strokeWidth="1" className="seek-map-active-outline" />}
            {isSelected && <path d={`M${region.x - 4} ${region.y + 15}v-19h19M${region.x + region.width - 15} ${region.y - 4}h19v19M${region.x + region.width + 4} ${region.y + region.height - 15}v19h-19M${region.x + 15} ${region.y + region.height + 4}h-19v-19`} fill="none" stroke="#b3d9e2" strokeWidth="2" />}
            {obs?.inspected && <g transform={`translate(${region.x + 15} ${region.y + region.height - 16})`} opacity="0.7"><path d="m0 -2 3 3 6-7" fill="none" stroke={color} strokeWidth="1.3" /><text x="15" y="1" className="seek-map-inspected">INSPECTED</text></g>}
          </g>;
        })}
        {showTrail && state.trail.length > 1 && <g pointerEvents="none"><polyline points={state.trail.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#65dabc" strokeWidth="7" strokeOpacity="0.04" strokeLinecap="round" strokeLinejoin="round" /><polyline points={state.trail.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#65dabc" strokeWidth="1.7" strokeOpacity="0.67" strokeLinecap="round" strokeLinejoin="round" /></g>}
        {state.candidates.filter(c => c.status !== 'rejected').map(candidate => {
          const region = scenario.regions.find(r => r.id === candidate.regionId);
          if (!region) return null;
          const x = region.x + region.width * 0.72;
          const y = region.y + region.height * 0.58;
          const confirmed = candidate.status === 'confirmed';
          return <g key={candidate.id} transform={`translate(${x} ${y})`} pointerEvents="none" className={confirmed ? 'seek-map-confirmed' : 'seek-map-candidate'} style={{ color: confirmed ? '#8be3ac' : '#e6bb72' }}><circle r="25" fill="currentColor" fillOpacity="0.04" stroke="currentColor" strokeOpacity="0.3" className="seek-map-candidate-ring" /><circle r="14" fill="#121c20" stroke="currentColor" strokeWidth="1.3" /><circle cy="-4" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M-6 6q0-7 6-7t6 7" fill="none" stroke="currentColor" strokeWidth="1.4" /><rect x="-34" y="32" width="68" height="17" rx="2" fill="#192421" stroke="currentColor" strokeOpacity="0.3" /><text y="43" textAnchor="middle" fill="currentColor" className="seek-map-candidate-label">{confirmed ? 'CONFIRMED' : `${Math.round(candidate.score * (candidate.score <= 1 ? 100 : 1))}% MATCH`}</text></g>;
        })}
        <g transform={`translate(${state.drone.x} ${state.drone.y})`} className="seek-map-drone" pointerEvents="none">
          {running && <><circle r="83" fill={`url(#${id}-scan)`} /><circle r="34" fill="none" stroke={droneColor} strokeWidth="0.8" opacity="0.25" /><circle r="53" fill="none" stroke={droneColor} strokeWidth="0.6" className="seek-map-scan-ring" /></>}
          <g transform={`rotate(${state.heading})`}>
            {running && <path d="M0 0L-47 -92Q0 -110 47 -92Z" fill={`url(#${id}-cone)`} />}
            <circle r="21" fill="#081614" fillOpacity="0.92" stroke={droneColor} strokeOpacity="0.45" strokeWidth="0.8" />
            <circle r="10" fill={droneColor} opacity="0.2" filter={`url(#${id}-glow)`} />
            <path d="m-6 -6 12 12m0-12L-6 6" stroke={droneColor} strokeWidth="1.7" />
            {[[-8, -8], [8, -8], [-8, 8], [8, 8]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="4" fill="#102c25" stroke={droneColor} strokeWidth="1.4" />)}
            <path d="m0 -6 4 9-4-2-4 2Z" fill={droneColor} />
            <path d="m-3-25 3-4 3 4" fill="none" stroke={droneColor} strokeWidth="1.3" />
          </g>
          <rect x="29" y="-10" width="76" height="21" rx="2" fill="#0a1b19" stroke="#33594f" strokeWidth="0.8" />
          <circle cx="38" cy="0" r="2" fill={droneColor} />
          <text x="46" y="4" fill="#b3dcd0" className="seek-map-drone-label">SEEK–01</text>
        </g>
        <g className="seek-map-entry" aria-hidden="true"><path d="M445 683h30M460 678v-17m-4 4 4-4 4 4" fill="none" stroke="#637b8a" strokeWidth="1" /><text x="460" y="700" textAnchor="middle">DEPLOYMENT POINT</text></g>
      </g>
      <g transform="translate(866 77)" aria-hidden="true"><text y="-21" textAnchor="middle" className="seek-map-north">N</text><path d="M0-12 5 8 0 4-5 8Z" fill="#8ca1ad" /><path d="M0 4V13" stroke="#536c7a" /></g>
    </svg>
    <div className="seek-map-bottomline">
      <div className="seek-map-view-controls">
        <button type="button" onClick={() => setZoom(z => Math.min(2.5, Math.round((z + 0.25) * 100) / 100))} disabled={zoom >= 2.5} aria-label="Zoom in" title="Zoom in"><Plus size={15} /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom(z => Math.max(0.75, Math.round((z - 0.25) * 100) / 100))} disabled={zoom <= 0.75} aria-label="Zoom out" title="Zoom out"><Minus size={15} /></button>
        <i />
        <button type="button" onClick={resetView} aria-label="Reset map view" title="Reset map view"><LocateFixed size={15} /></button>
        <i />
        <button type="button" onClick={() => setLegend(v => !v)} aria-label={legend ? 'Hide map legend' : 'Show map legend'} aria-pressed={legend} title="Toggle map legend"><Layers2 size={15} /></button>
      </div>
      <div className="seek-map-meter"><span /><span>5 m</span></div>
    </div>
    {legend && !selectedRegionId && <div className="seek-map-legend"><span><i className="unexplored" />Unexplored</span><span><i className="observed" />Observed</span><span><i className="candidate" />Candidate</span></div>}
    <div className="seek-map-state-note"><Navigation2 size={10} /><span>{selected ? `SECTOR ${selected.id} SELECTED` : running && destination ? `${state.status === 'investigating' ? 'INSPECTING' : state.currentRegionId === destination.id ? 'OBSERVING' : 'NAVIGATING TO'} SECTOR ${destination.id}` : state.status === 'idle' ? 'AWAITING MISSION ASSIGNMENT' : state.status === 'awaiting_verification' ? 'HOLDING FOR OPERATOR REVIEW' : state.status === 'completed' ? 'SEARCH OBJECTIVE CONFIRMED' : 'SELECT A SECTOR TO INSPECT'}</span></div>
  </div>;
}
