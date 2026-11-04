import { useId } from 'react';
import type { Candidate, MissionState, Person, Scenario } from '../types';
import './camera.css';
import RealCameraFeed, {type LiveCamera} from './RealCameraFeed';

export interface CameraFeedProps {
  state: MissionState;
  scenario: Scenario;
  regionId?: string | null;
  candidate?: Candidate | null;
  expanded?: boolean;
  live?: LiveCamera;
}

const clothingColors: Record<string, string> = {
  red: '#9f3c39', blue: '#386c97', black: '#171b20', white: '#a5a7a0',
  yellow: '#bca046', green: '#526950', orange: '#ba763d', grey: '#74787a',
  gray: '#74787a', brown: '#6e5343', navy: '#2f435d', purple: '#775572',
  pink: '#a87583', beige: '#a59b84', silver: '#a3aaa9', khaki: '#8e8764',
};

function clothingColor(description: string, fallback = '#53616a') {
  const color = description.toLowerCase().match(/\b(red|blue|black|white|yellow|green|orange|grey|gray|brown|navy|purple|pink|beige|silver|khaki)\b/)?.[1];
  return color ? clothingColors[color] : fallback;
}

function ScenePerson({ person, x, y, scale = 1, selected, prefix }: {
  person: Person; x: number; y: number; scale?: number; selected: boolean; prefix: string;
}) {
  const upper = clothingColor(person.upper);
  const lower = clothingColor(person.lower, '#343a3d');
  const hasBag = /bag|backpack|rucksack/i.test(person.accessory);
  const hasHelmet = /helmet|hard hat/i.test(person.accessory + person.upper);
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <ellipse cx="0" cy="101" rx="29" ry="6" fill="#000" opacity=".46" filter={`url(#${prefix}-soft)`}/>
    <path d="M-13 45 L-12 98 L-1 98 L3 65 L7 98 L19 98 L14 45Z" fill={lower}/>
    <path d="M-9 99 L-17 102 L-17 106 L-1 106 L0 99 M9 99 L8 106 L24 106 L23 103 L18 99" fill="#111619"/>
    <path d="M-10 3 Q-19 7 -24 17 L-31 47 Q-33 53 -27 55 L-22 53 L-14 29 L-14 51 Q0 58 16 51 L16 27 L25 49 Q29 55 33 51 L34 47 L25 15 Q19 6 10 3Z" fill={upper}/>
    <path d="M-9 5 L-11 47 M9 7 L12 49 M-5 30 L7 30" stroke="#000" opacity=".19" strokeWidth="2"/>
    {/hoodie/i.test(person.upper) && <path d="M-11 8 Q-19 -12 0 -17 Q21 -11 12 8 L7 11 L-7 11Z" fill={upper}/>}
    <ellipse cy="-6" rx="10" ry="14" fill="#9a8b7b"/>
    <path d="M-10 -7 Q-12 -23 2 -21 Q13 -20 11 -6 L7 -12 L-7 -13Z" fill="#333331"/>
    <path d="M-9 -5 Q-7 7 1 8 Q9 5 10 -5" fill="#000" opacity=".1"/>
    {hasHelmet && <path d="M-14 -10 Q-12 -25 1 -25 Q14 -24 15 -10 L19 -8 L-17 -8Z" fill={clothingColor(person.accessory, '#bca046')}/>}
    {hasBag && <g><path d="M12 13 Q33 5 32 31" fill="none" stroke="#272b2a" strokeWidth="3"/><rect x="19" y="25" width="20" height="29" rx="4" fill={clothingColor(person.accessory, '#8b7954')}/><path d="M22 32 L36 32 M22 48 L36 48" stroke="#000" opacity=".2"/></g>}
    {/vest/i.test(person.upper) && <g stroke="#d0cfb1" strokeWidth="3" opacity=".75"><path d="M-10 10 L-8 45 M10 10 L10 45 M-14 32 L17 32"/></g>}
    <path d="M-24 46 L-29 53 M28 47 L30 53" stroke="#958575" strokeWidth="6" strokeLinecap="round"/>
    {selected && <path d="M-43 -32 H-29 M-43 -32 V-17 M43 -32 H29 M43 -32 V-17 M-43 117 H-29 M-43 117 V102 M43 117 H29 M43 117 V102" stroke="#e7bf76" strokeWidth="1.7" fill="none"/>}
  </g>;
}

export default function CameraFeed({ state, scenario, regionId, candidate, expanded = false, live }: CameraFeedProps) {
  const id = useId().replace(/:/g, '');
  if(live) return <RealCameraFeed camera={live} expanded={expanded}/>;
  const selectedId = candidate?.regionId ?? regionId ?? state.currentRegionId;
  const region = scenario.regions.find(item => item.id === selectedId);
  const observation = selectedId ? state.observations[selectedId] : undefined;
  const people = candidate ? [candidate.person] : observation?.people ?? [];
  const sectorIndex = Math.max(0, scenario.regions.findIndex(item => item.id === selectedId));
  const warehouse = /warehouse/i.test(scenario.id + scenario.name);
  const facility = /visitor|facility/i.test(scenario.id + scenario.name);
  const active = state.status === 'searching' || state.status === 'investigating';
  const time = Math.floor(candidate?.elapsed ?? (regionId ? observation?.elapsed ?? state.elapsed : state.elapsed));
  const stamp = `${String(Math.floor(time / 3600)).padStart(2, '0')}:${String(Math.floor(time / 60) % 60).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`;
  const isUnobserved = Boolean(selectedId && !observation && !candidate);
  const sceneKey = `${scenario.id}-${selectedId ?? 'entrance'}`;
  const floorTone = warehouse ? '#353a3a' : facility ? '#4e5452' : '#55514a';
  const focalX = 320 + ((sectorIndex % 3) - 1) * 22;

  return <div className={`camera-feed ${expanded ? 'camera-feed-expanded' : ''} ${active ? 'camera-feed-active' : ''}`} aria-label={`Simulated camera, ${region ? `Sector ${region.id}: ${region.name}` : 'entrance'}${candidate ? ', clothing candidate evidence' : ''}`}>
    <svg className="camera-scene" key={sceneKey} viewBox="0 0 640 400" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`${warehouse ? 'Warehouse' : facility ? 'Indoor facility' : 'Museum'} simulated perspective scene${people.length ? ` with ${people.length} observed person${people.length === 1 ? '' : 's'}` : ''}`}>
      <defs>
        <linearGradient id={`${id}-left`} x1="0" y1="0" x2="1" y2="0"><stop stopColor="#373b39"/><stop offset="1" stopColor="#77776c"/></linearGradient>
        <linearGradient id={`${id}-right`} x1="0" y1="0" x2="1" y2="0"><stop stopColor="#696b62"/><stop offset="1" stopColor="#2d3434"/></linearGradient>
        <linearGradient id={`${id}-back`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#858376"/><stop offset=".65" stopColor="#727369"/><stop offset="1" stopColor="#5c615b"/></linearGradient>
        <linearGradient id={`${id}-floor`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={floorTone}/><stop offset="1" stopColor="#292e2e"/></linearGradient>
        <linearGradient id={`${id}-ceiling`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#252c2d"/><stop offset="1" stopColor="#5e635a"/></linearGradient>
        <linearGradient id={`${id}-light`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ded7ba" stopOpacity=".14"/><stop offset="1" stopColor="#ded7ba" stopOpacity="0"/></linearGradient>
        <radialGradient id={`${id}-vignette`}><stop offset=".25" stopColor="#040b10" stopOpacity="0"/><stop offset="1" stopColor="#040b10" stopOpacity=".73"/></radialGradient>
        <linearGradient id={`${id}-plinth`}><stop stopColor="#81847a"/><stop offset=".5" stopColor="#a3a397"/><stop offset="1" stopColor="#666e67"/></linearGradient>
        <filter id={`${id}-soft`}><feGaussianBlur stdDeviation="4"/></filter>
        <filter id={`${id}-grain`}><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
      </defs>
      <rect width="640" height="400" fill="#252e2e"/>
      <path d="M0 0 L195 116 L445 116 L640 0Z" fill={`url(#${id}-ceiling)`}/>
      <path d="M0 0 L195 116 L195 274 L0 400Z" fill={`url(#${id}-left)`}/>
      <path d="M640 0 L445 116 L445 274 L640 400Z" fill={`url(#${id}-right)`}/>
      <path d="M195 116 L445 116 L445 274 L195 274Z" fill={`url(#${id}-back)`}/>
      <path d="M0 400 L195 274 L445 274 L640 400Z" fill={`url(#${id}-floor)`}/>
      <g stroke="#c3c1ab" opacity=".12" strokeWidth="1">
        {[20, 100, 180, 260, 340, 420, 500, 580].map(x => <path key={x} d={`M${x} 400 L${focalX + (x - 320) * .12} 225`}/>)}
        {[282, 298, 323, 359].map(y => <path key={y} d={`M0 ${y} H640`}/>)}
      </g>
      <g stroke="#121c1c" fill="none" opacity=".5"><path d="M195 116 V274 L0 400 M445 116 V274 L640 400 M195 274 H445"/><path d="M0 391 L195 269 H445 L640 391" strokeWidth="3"/></g>
      <g stroke="#8a8b7a" opacity=".2"><path d="M100 0 L235 116 M540 0 L403 116 M320 0 V116 M0 57 L195 141 M640 57 L445 141"/></g>
      <path d="M183 22 L243 89 L255 89 L213 22Z M427 22 L385 89 L398 89 L458 22Z" fill="#e4e1c9" opacity=".75"/>
      <path d="M183 22 L98 320 L340 314 L255 89Z M458 22 L532 320 L311 314 L385 89Z" fill={`url(#${id}-light)`}/>
      <path d="M286 114 H355" stroke="#e7dfc3" strokeWidth="3" opacity=".7"/>

      {warehouse ? <g>
        <path d="M28 99 L177 151 V289 L28 378Z" fill="#222d2d"/>
        <path d="M465 153 L612 96 V376 L465 288Z" fill="#263133"/>
        {[0, 1, 2].map(row => <g key={row}>
          <path d={`M29 ${152 + row * 67} L177 ${176 + row * 39}`} stroke="#9b7146" strokeWidth="6"/>
          <path d={`M465 ${177 + row * 39} L612 ${151 + row * 67}`} stroke="#9b7146" strokeWidth="6"/>
          {[0, 1, 2].map(col => <g key={col}>
            <path d={`M${38 + col * 44} ${106 + row * 65 + col * 13} l31 10 v34 l-31 -5Z`} fill={['#706c57', '#8b7757', '#706e61'][(sectorIndex + col) % 3]}/>
            <path d={`M${477 + col * 44} ${148 + row * 42 - col * 15} l31 -10 v${29 + col * 7} l-31 11Z`} fill={['#7b705a', '#686e65', '#8d7c60'][(sectorIndex + col) % 3]}/>
          </g>)}
        </g>)}
        {[35, 104, 176].map((x, i) => <path key={x} d={`M${x} ${100 + i * 25} V${375 - i * 44}`} stroke="#56645d" strokeWidth="7"/>)}
        {[466, 538, 610].map((x, i) => <path key={x} d={`M${x} ${151 - i * 25} V${289 + i * 44}`} stroke="#5d6963" strokeWidth="7"/>)}
        <rect x="268" y="148" width="105" height="126" fill="#3e4948" stroke="#8c8f7b" strokeWidth="3"/>
        {[158, 170, 182, 194, 206, 218, 230, 242, 254].map(y => <path key={y} d={`M271 ${y} H370`} stroke="#252f30" strokeWidth="2"/>)}
        <path d="M224 275 L154 400 M417 275 L492 400" stroke="#b89d50" strokeWidth="3" opacity=".55"/>
        <rect x="293" y="132" width="55" height="11" fill="#626f61"/><text x="320" y="140" textAnchor="middle" fontSize="6" fill="#e2dfc8" fontFamily="monospace">BAY {String(sectorIndex + 1).padStart(2, '0')}</text>
      </g> : facility ? <g>
        <path d="M25 100 L177 154 V281 L25 370Z" fill="#38484a" stroke="#737c71" strokeWidth="3"/>
        {[66, 112, 155].map((x, i) => <path key={x} d={`M${x} ${116 + i * 14} V${345 - i * 25}`} stroke="#89938a" strokeWidth="3"/>)}
        <path d="M26 235 L177 224" stroke="#7d8d84" strokeWidth="3"/>
        <rect x="221" y="158" width="65" height="116" fill="#354344" stroke="#82877a" strokeWidth="3"/>
        <rect x="293" y="158" width="65" height="116" fill="#354344" stroke="#82877a" strokeWidth="3"/>
        <path d="M278 203 V226 M302 203 V226" stroke="#c5c8b5" strokeWidth="2"/>
        <rect x="246" y="141" width="87" height="10" fill="#5a6c58"/><text x="289" y="148" textAnchor="middle" fontSize="6" fill="#dedec6" fontFamily="monospace">{sectorIndex % 2 ? 'CONCOURSE' : 'VISITOR SERVICES'}</text>
        <path d="M456 252 L582 301 L582 332 L456 272Z" fill="#384c4c"/><path d="M456 233 L588 278 L582 301 L456 252Z" fill="#526466"/><path d="M456 233 V252 L582 301 V278Z" fill="#667675"/>
        <path d="M467 277 V292 M575 329 V343" stroke="#202c2d" strokeWidth="4"/>
        <path d="M384 254 L416 254 L412 282 H388Z" fill="#77776a"/><path d="M400 254 V205" stroke="#3b4d3c" strokeWidth="3"/>
        <path d="M400 235 Q372 218 380 203 Q401 202 400 235 M400 225 Q420 190 430 209 Q425 228 400 235 M400 215 Q384 179 402 183 Q417 195 400 215" fill="#4c624b"/>
      </g> : <g>
        <path d="M39 119 L161 160 V236 L39 279Z" fill="#282c2b" stroke="#8b8a78" strokeWidth="3"/>
        <path d="M46 128 L154 165 V231 L46 268Z" fill={['#58615b', '#635e51', '#576267'][sectorIndex % 3]}/>
        <path d="M50 244 L91 173 L127 216 L151 194 L151 229 L50 264Z" fill="#2a3c3a" opacity=".9"/>
        <path d="M50 158 L149 189 L149 205 L50 182Z" fill="#a69b79" opacity=".55"/>
        <path d="M473 160 L595 118 V277 L473 236Z" fill="#202a29" stroke="#7b8071" strokeWidth="3"/>
        <path d="M479 165 L588 129 V265 L479 230Z" fill={['#666754', '#5f5351', '#4d6264'][(sectorIndex + 1) % 3]}/>
        <path d="M487 181 L534 156 L578 175 L534 222 L487 219Z" fill="#8f876c" opacity=".8"/>
        <path d="M519 181 L555 165 L555 220 L519 210Z" fill="#363d3b"/>
        <rect x="280" y="151" width="80" height="73" fill="#343e3b" stroke="#999783" strokeWidth="3"/>
        <rect x="286" y="157" width="68" height="61" fill={['#777960', '#736454', '#667874'][sectorIndex % 3]}/>
        <path d="M286 208 L302 174 L323 200 L341 167 L354 208Z" fill="#444b3e"/>
        <path d="M288 190 L350 173 L350 183 L288 205Z" fill="#b8ae86" opacity=".5"/>
        <rect x="312" y="233" width="16" height="5" fill="#a2a190" opacity=".65"/>
        {sectorIndex % 2 === 0 ? <g>
          <ellipse cx="249" cy="309" rx="45" ry="11" fill="#172323" opacity=".4"/>
          <path d="M225 253 L251 245 L277 253 L277 303 L250 314 L225 303Z" fill={`url(#${id}-plinth)`}/>
          <path d="M225 253 L250 262 L277 253 M250 262 V314" fill="none" stroke="#5c665e" strokeWidth="1"/>
          <path d="M244 249 Q232 233 242 220 Q226 205 242 187 Q253 181 262 190 Q269 198 259 207 Q268 226 258 249Z" fill="#969c8e"/>
          <path d="M245 191 Q249 202 244 213 Q257 219 248 241" fill="none" stroke="#c1c0aa" strokeWidth="4" opacity=".6"/>
        </g> : <g>
          <path d="M216 254 L275 254 L286 262 L216 264Z" fill="#7a7e70"/>
          <path d="M216 264 H286 V284 H216Z" fill="#4d5951"/>
          <path d="M222 284 V293 M279 284 V293" stroke="#2b3933" strokeWidth="4"/>
        </g>}
        <path d="M48 294 L66 289 M479 247 L489 251" stroke="#b7b7a1" strokeWidth="3" opacity=".6"/>
        <rect x="383" y="176" width="35" height="98" fill="#353f3b"/><path d="M386 180 H415 V274" fill="none" stroke="#989e8c" strokeWidth="2"/><rect x="389" y="163" width="24" height="8" fill="#5a7664"/>
      </g>}

      {people.slice(0, 3).map((person, index) => <ScenePerson key={person.id} person={person} x={index === 0 ? 365 + (sectorIndex % 2) * 17 : index === 1 ? 202 : 480} y={index === 0 ? 208 : 220} scale={index === 0 ? 1.07 : .78} selected={Boolean(candidate && candidate.person.id === person.id)} prefix={id}/>)}
      <rect width="640" height="400" fill={`url(#${id}-vignette)`}/>
      <rect width="640" height="400" filter={`url(#${id}-grain)`} opacity=".075" style={{ mixBlendMode: 'soft-light' }}/>
      <path d="M304 198 H315 M325 198 H336 M320 182 V193 M320 203 V214" fill="none" stroke="#c8ded8" opacity=".5" strokeWidth="1"/>
      <circle cx="320" cy="198" r="2" fill="#c8ded8" opacity=".65"/>
      {isUnobserved && <rect width="640" height="400" fill="#0c151b" opacity=".75"/>}
    </svg>
    <div className="camera-overlay-top"><span className="camera-sector"><i/>{region ? `SECTOR ${region.id}` : 'ENTRY POINT'}</span><span className="camera-sim-label">SIMULATED FEED</span></div>
    <div className="camera-corner camera-corner-tl"/><div className="camera-corner camera-corner-tr"/><div className="camera-corner camera-corner-bl"/><div className="camera-corner camera-corner-br"/>
    {active && !isUnobserved && <div className="camera-scanline"/>}
    {isUnobserved ? <div className="camera-center-message"><span>NO OBSERVATION</span><small>This sector has not been inspected.</small></div> : state.status === 'idle' ? <div className="camera-idle-label">CAMERA READY <span>·</span> AWAITING MISSION</div> : null}
    {candidate && <div className={`camera-detection-label ${candidate.status === 'confirmed' ? 'camera-detection-confirmed' : ''}`}><span>{candidate.status === 'confirmed' ? 'OPERATOR CONFIRMED' : 'CLOTHING CANDIDATE'}</span><strong>{Math.round(candidate.score)}%<small>attribute match</small></strong></div>}
    <div className="camera-overlay-bottom"><span>{region ? region.name.toUpperCase() : scenario.environment.toUpperCase()}</span><span>HDG {String(Math.round(state.heading) % 360).padStart(3, '0')}°</span></div>
    <div className="camera-data-strip"><span><i className={active ? 'camera-live-dot' : ''}/>{active ? 'OBSERVING' : state.status === 'idle' ? 'STANDBY' : 'FRAME HELD'}</span><span>T+ {stamp}</span><span>640 × 400 <b>SIM</b></span></div>
  </div>;
}
