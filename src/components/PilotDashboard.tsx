import {useEffect,useRef,useState} from 'react';
import {Activity,ArrowDownToLine,Battery,Camera,Compass,Crosshair,FileText,Gamepad2,LandPlot,Play,Power,Radio,RefreshCw,ShieldCheck,Square,TriangleAlert} from 'lucide-react';
import {api} from '../adapters/liveCapture';
import {reportPhoto,reportSummary,type Axes,type PilotDevice,type PilotState,type ReportItem,type RuntimeReport} from '../adapters/pilot';
import FlightStick from './FlightStick';
import RealCameraFeed from './RealCameraFeed';
import ScanMap,{type MapView} from './ScanMap';
import './pilot.css';
import './scans.css';
import './pilot-mapping.css';

export default function PilotDashboard({onExit}:{onExit:()=>void}){
  const [devices,setDevices]=useState<PilotDevice[]>([]),[deviceId,setDeviceId]=useState('');
  const [state,setState]=useState<PilotState|null>(null),[linked,setLinked]=useState(false),[error,setError]=useState('');
  const [tab,setTab]=useState<'flight'|'logs'|'map'>('flight'),[reports,setReports]=useState<ReportItem[]>([]),[report,setReport]=useState<RuntimeReport|null>(null),[reportName,setReportName]=useState('');
  const [mapView,setMapView]=useState<MapView|null>(null),[goal,setGoal]=useState('Scan the environment and capture two viewpoints for a 3D reconstruction.');
  const [connecting,setConnecting]=useState(false),[assess,setAssess]=useState(false),[cutHeld,setCutHeld]=useState(false),[connectionVersion,setConnectionVersion]=useState(0);
  const heldKeys=useRef(new Set<string>());
  const socket=useRef<WebSocket|null>(null),axes=useRef<Axes>([0,0,0,0]),sequence=useRef(0),latest=useRef<PilotState|null>(null),cutTimer=useRef<number|null>(null),tabRef=useRef(tab);
  tabRef.current=tab;
  const send=(value:object)=>{if('action' in value&&['arm','takeoff','scan','prepare_map','map','manual'].includes(String(value.action)))setError('');if(socket.current?.readyState===WebSocket.OPEN)socket.current.send(JSON.stringify(value));};
  const neutral=()=>{axes.current=[0,0,0,0];if(latest.current?.manual_ready)send({action:'hover'});};
  useEffect(()=>{
    let disposed=false;
    async function refresh(){try{const [next,history]=await Promise.all([api<PilotDevice[]>('/pilot/devices'),api<ReportItem[]>('/pilot/reports')]);
      if(disposed)return;setDevices(next);setReports(history);setDeviceId(id=>next.some(d=>d.id===id)?id:next[0]?.id??'');
    }catch{if(!disposed)setError('Pilot backend unavailable. Restart the backend with the updated code.');}}
    void refresh();const timer=window.setInterval(()=>void refresh(),2500);
    return()=>{disposed=true;window.clearInterval(timer);};
  },[]);
  useEffect(()=>{
    if(!deviceId)return;
    setState(null);latest.current=null;setLinked(false);axes.current=[0,0,0,0];sequence.current=0;
    const url=new URL(`/api/pilot/ws/${encodeURIComponent(deviceId)}`,window.location.href);url.protocol=window.location.protocol==='https:'?'wss:':'ws:';
    const ws=new WebSocket(url);socket.current=ws;
    ws.onopen=()=>{setLinked(true);setError('');};
    ws.onmessage=event=>{try{const message=JSON.parse(event.data);if(message.type==='pilot_state'){if(!message.manual_ready){axes.current=[0,0,0,0];heldKeys.current.clear();}latest.current=message;setState(message);}else if(message.type==='error')setError(message.message);}catch{setError('Invalid control response');}};
    ws.onerror=()=>setError('Control connection failed. Reconnect controls; landing/recovery remains available over HTTP.');
    ws.onclose=()=>{if(socket.current===ws){setLinked(false);axes.current=[0,0,0,0];}};
    const heartbeat=window.setInterval(()=>{if(document.visibilityState==='visible'&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({action:'heartbeat'}));},500);
    const controls=window.setInterval(()=>{if(ws.readyState===WebSocket.OPEN&&latest.current?.manual_ready&&tabRef.current==='flight')ws.send(JSON.stringify({action:'sticks',sequence:++sequence.current,axes:axes.current}));},100);
    return()=>{window.clearInterval(heartbeat);window.clearInterval(controls);if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({action:'hover'}));ws.close();};
  },[deviceId,connectionVersion]);
  useEffect(()=>{
    const held=heldKeys.current;
    function stopKeys(){held.clear();neutral();cutCancel();}
    function key(event:KeyboardEvent,down:boolean){
      if(down&&((event.target as HTMLElement)?.matches('input,textarea,select')||event.ctrlKey||event.metaKey))return;
      if(down&&event.key==='Escape'){if(!event.repeat)void land();event.preventDefault();return;}
      if(down&&event.code==='Space'){if(!event.repeat){stopKeys();send({action:'hover'});}event.preventDefault();return;}
      const k=event.key.toLowerCase();if(!'wasdqerf'.includes(k)||k.length!==1||!latest.current?.manual_ready||tabRef.current!=='flight')return;
      event.preventDefault();if(down)held.add(k);else held.delete(k);
      axes.current=[(held.has('d')?20:0)-(held.has('a')?20:0),(held.has('w')?20:0)-(held.has('s')?20:0),
                    (held.has('r')?20:0)-(held.has('f')?20:0),(held.has('e')?20:0)-(held.has('q')?20:0)];
    }
    const onDown=(e:KeyboardEvent)=>key(e,true),onUp=(e:KeyboardEvent)=>key(e,false);
    const visibility=()=>{stopKeys();if(document.visibilityState==='hidden'&&latest.current?.device.airborne_possible)void land();};
    window.addEventListener('keydown',onDown);window.addEventListener('keyup',onUp);window.addEventListener('blur',stopKeys);document.addEventListener('visibilitychange',visibility);
    return()=>{window.removeEventListener('keydown',onDown);window.removeEventListener('keyup',onUp);window.removeEventListener('blur',stopKeys);document.removeEventListener('visibilitychange',visibility);};
  },[deviceId]);
  useEffect(()=>()=>{if(cutTimer.current!==null)window.clearTimeout(cutTimer.current);},[]);
  useEffect(()=>{
    setMapView(null);if(!state?.mapping?.id||!deviceId)return;let disposed=false;
    const refresh=async()=>{try{const map=await api<MapView>(`/pilot/map/${encodeURIComponent(deviceId)}`);if(!disposed)setMapView(map);}catch{/* preparation may not have produced geometry yet */}};
    void refresh();const timer=window.setInterval(()=>void refresh(),1200);
    return()=>{disposed=true;window.clearInterval(timer);};
  },[deviceId,state?.mapping?.id]);
  async function land(){
    axes.current=[0,0,0,0];setError('');if(latest.current)latest.current={...latest.current,manual_ready:false};send({action:'land'});
    if(!deviceId)return;
    try{await api(`/pilot/land/${encodeURIComponent(deviceId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:'LAND'})});}
    catch(failure){setError(failure instanceof Error?failure.message:'Landing request not confirmed');}
  }
  async function connectReal(){setConnecting(true);setError('');try{const d=await api<PilotDevice>('/pilot/connect-real',{method:'POST'});setDevices(old=>[...old.filter(x=>x.id!==d.id),d]);setDeviceId(d.id);}catch(failure){setError(failure instanceof Error?failure.message:'TT connection failed');}finally{setConnecting(false);}}
  function cutStart(){if(!linked||cutTimer.current!==null)return;setCutHeld(true);cutTimer.current=window.setTimeout(()=>{send({action:'motor_cut',confirm:'CUT MOTORS'});cutCancel();},1500);}
  function cutCancel(){if(cutTimer.current!==null)window.clearTimeout(cutTimer.current);cutTimer.current=null;setCutHeld(false);}
  async function openReport(name:string){setReportName(name);try{setReport(await api<RuntimeReport>(`/pilot/reports/${encodeURIComponent(name)}`));}catch{setError('Report is being saved; select it again shortly.');}}
  function download(){const payload=tab==='logs'?report:state;if(!payload)return;const blob=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=blob;a.download=tab==='logs'?reportName||'flight-report.json':'pilot-state.json';a.click();URL.revokeObjectURL(blob);}
  const device=state?.device??devices.find(d=>d.id===deviceId),manual=linked&&!!state?.manual_ready&&tab==='flight';
  const mapping=state?.mapping,mappingActive=mapping?.status==='running';
  const manualReason=manual?'Joysticks live · release to hover':mappingActive?'Mapping active · use Take manual control to steer':!device?.armed?'Enable controls, then take off to unlock the joysticks':!device.airborne_possible?'Take off to unlock the joysticks':state?.phase??'Waiting for airborne control';
  const summary=report?reportSummary(report):null;
  return <div className="app-shell pilot-console">
    <header className="topbar"><a className="brand" href="#" onClick={e=>e.preventDefault()} aria-label="SEEK command center"><div className="brand-symbol"><span/><span/><span/><span/><i/></div><span className="brand-word">SEEK</span></a><span className="brand-description">AUTONOMOUS SEARCH INTELLIGENCE</span><div className="top-mission"><Gamepad2 size={16}/>Flight control</div><div className="topbar-right"><button className="simulation-pill capture-mode-switch" onClick={onExit}>Capture dashboard</button><span className="system-ready"><i className={linked?'status-dot':'status-dot dim'}/>{linked?'CONTROL LINK OPEN':'CONTROL LINK OFFLINE'}</span><span className="operator-avatar">OP</span></div></header>
    <nav className="nav-rail" aria-label="Workspace navigation"><button className={`rail-button ${tab==='flight'?'selected':''}`} aria-label="Manual flight controls" onClick={()=>{neutral();setTab('flight');}}><Gamepad2 size={20}/></button><button className={`rail-button ${tab==='logs'?'selected':''}`} aria-label="Runtime flight logs" onClick={()=>{neutral();setTab('logs');}}><FileText size={20}/></button><div className="rail-spacer"/><span className="rail-version">S / 03</span></nav>
    <main className="main-workspace"><div className="workspace-heading"><div><div className="eyebrow">OPERATIONS / FLIGHT CONTROL</div><div className="workspace-title"><h1>{tab==='logs'?'Runtime flight reports':'Pilot workspace'}</h1><span className={`mission-badge ${device?.simulated===false?'pilot-real':''}`}><i/>{device?.simulated===false?'REAL TT':'SIMULATOR'}</span></div></div><div className="pilot-flight-clock">{device?.elapsed_flight_s??0}s / {device?.flight_limit_s??60}s</div></div>
    <div className="dashboard-grid"><aside className="mission-sidebar panel"><div className="section-title"><span className="section-heading"><Crosshair size={15}/>Flight control</span><span className="section-index">01</span></div><div className="mission-form">
      <label htmlFor="pilot-device">Device</label><div className="select-wrap"><Radio size={14}/><select id="pilot-device" value={deviceId} disabled={!!device?.airborne_possible} onChange={e=>setDeviceId(e.target.value)}>{!deviceId&&<option value="">No pilot device</option>}{devices.map(d=><option key={d.id} value={d.id}>{d.id} · {d.simulated===false?'REAL TT':'SIMULATOR'}</option>)}</select></div>
      <div className="pilot-connect"><button className="button button-secondary" disabled={connecting||!!device?.airborne_possible} onClick={()=>void connectReal()}>{connecting?'Connecting…':'Connect real TT'}</button><button className="icon-button" aria-label="Reconnect dashboard controls" disabled={connecting} onClick={()=>setConnectionVersion(v=>v+1)}><RefreshCw size={15}/></button></div>
      <div className="scenario-caption">Connection opens SDK/video only. Enable controls to arm. No SPACE repeat or typed phrase.</div>
      <button className="button button-primary start-button" disabled={!linked||!device?.ready_for_control||!!device?.airborne_possible} onClick={()=>send({action:device?.armed?'disarm':'arm'})}><Power size={14}/>{device?.armed?'Release controls':'Enable controls'}</button>
      <div className="pilot-flight-actions"><button className="button button-secondary" disabled={!linked||!device?.armed||!!device?.airborne_possible||!!device?.fault} onClick={()=>send({action:'takeoff'})}><Play size={13}/>Take off</button><button className="button button-secondary" disabled={!linked} onClick={()=>{axes.current=[0,0,0,0];send({action:'hover'});}}><Square size={12}/>Hover</button></div>
      <button className="button button-danger pilot-land" disabled={!deviceId} onClick={()=>void land()}><LandPlot size={17}/>LAND / RECOVER</button>
      <div className="pilot-section-label">Automatic test</div><button className="button button-secondary" disabled={!linked||!device?.armed||!!device?.fault} onClick={()=>send({action:'scan',assess})}><Camera size={14}/>30° yaw scan & land</button>
      <label className="pilot-assess"><input type="checkbox" checked={assess} onChange={e=>setAssess(e.target.checked)}/>Ask Grok after landing (sends images)</label>
      <div className="scenario-caption">A local yaw routine runs automatically. Grok assesses the saved views after touchdown.</div>
      <div className="pilot-section-label">Experimental Grok mapping</div>
      <label htmlFor="mapping-goal">Mapping goal</label><textarea id="mapping-goal" rows={3} maxLength={500} value={goal} disabled={mappingActive} onChange={e=>setGoal(e.target.value)}/>
      <button className="button button-secondary" disabled={!linked||!device?.ready_for_control||!!device.airborne_possible||mapping?.status==='preparing'} onClick={()=>send({action:'prepare_map',goal})}>{mapping?.status==='preparing'?'Preparing depth + Grok…':'Prepare depth + Grok (grounded)'}</button>
      <button className="button button-primary start-button pilot-map-launch" disabled={!linked||!device?.armed||!!device.airborne_possible||!mapping?.prepared||!!device.fault} onClick={()=>{neutral();send({action:'map',goal});setTab('map');}}><Compass size={14}/>Launch {device?.simulated===false?'real':'simulator'} mapping</button>
      <button className="button button-secondary" disabled={!linked||!mappingActive||!device?.control_enabled} onClick={()=>{axes.current=[0,0,0,0];send({action:'manual'});setTab('flight');}}><Gamepad2 size={14}/>Take manual control</button>
      <div className="scenario-caption">2 × 360° capture stations · ≤0.4 m estimated travel · slow forward pulses. 20% takeoff / 15% land. Camera estimates cannot guarantee wall clearance. Stay at the controls.</div>
      {(error||state?.error)&&<p className="form-error" role="alert">{error||state?.error}</p>}
    </div><div className="pilot-status-box"><span className="eyebrow">CONTROLLER STATE</span><strong>{state?.phase??'Waiting for control link'}</strong>{device?.fault&&<p>{device.fault}</p>}<small>Telemetry age: {device?.telemetry_age_s??'—'}s · Video age: {device?.video_age_s??'—'}s</small><small>Sticks centre after 300 ms without input. Lost dashboard link requests landing.</small></div>
    <div className="pilot-cut-wrap"><button className={`pilot-cut ${cutHeld?'holding':''}`} disabled={!linked} onPointerDown={cutStart} onPointerUp={cutCancel} onPointerCancel={cutCancel} onPointerLeave={cutCancel} onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();e.stopPropagation();cutStart();}}} onKeyUp={cutCancel}><TriangleAlert size={15}/><span>{cutHeld?'Hold…':'HOLD 1.5s · CUT MOTORS'}</span></button><small>Aircraft falls. Imminent danger only.</small></div></aside>
    <section className="map-panel panel"><div className="map-toolbar"><div className="map-tabs"><button className={tab==='flight'?'active':''} onClick={()=>{neutral();setTab('flight');}}><Gamepad2 size={15}/>Manual mode</button><button className={tab==='map'?'active':''} onClick={()=>{neutral();setTab('map');}}><Compass size={14}/>3D mapping</button><button className={tab==='logs'?'active':''} onClick={()=>{neutral();setTab('logs');}}><FileText size={14}/>Runtime logs <span>{reports.length}</span></button></div><button className="icon-button" aria-label="Export flight diagnostics" onClick={download}><ArrowDownToLine size={16}/></button></div>
    {tab==='map'?<><ScanMap job={mapView}/><div className="pilot-mapping-status"><strong>{mapping?.phase??'Prepare mapping while grounded'}</strong><p>{mapping?.model??'grok-4.20-0309-non-reasoning'} · {mapping?.pose_source??'Estimated pose'}</p><div className="pilot-mapping-metrics"><span>{mapping?.stations??0} / 2 stations</span><span>Risk {mapping?.risk?.toFixed(2)??'—'} / 0.45</span><span>Front estimate {mapping?.local_view?.clearance_m?.toFixed(2)??'—'} m</span><span>Depth age {mapping?.depth_age_s??'—'}s</span></div><p>Translation pauses below 1.2 m estimated clearance or with stale/uncertain depth. This is an experimental estimated map.</p>{mapping?.decisions.slice(-4).reverse().map((d,i)=><div className="pilot-map-decision" key={i}><b>{d.action} · risk {d.risk.toFixed(2)}</b><p>{d.reason}</p></div>)}{mapping&&!mappingActive&&mapping.samples.length>0&&<div><a href={`/api/pilot/map/${encodeURIComponent(deviceId)}/export`} download>Download point cloud (.ply)</a><a href={`/api/pilot/map/${encodeURIComponent(deviceId)}/export?format=zip`} download>Download images + map + poses (.zip)</a></div>}</div></>:
    tab==='flight'?<><div className="pilot-camera"><RealCameraFeed camera={{deviceId,source:device?.simulated===false?'real':'simulation',url:device?.link_open?`/api/video/${encodeURIComponent(deviceId)}`:'',frozen:false,mode:'pilot',flying:!!device?.airborne_possible}} expanded/></div><div className="pilot-manual-readiness" role="status">{manualReason}</div><div className="pilot-sticks"><FlightStick label="Yaw / height" horizontal="← Yaw →" vertical="↑ Rise / descend ↓" disabled={!manual} onChange={(x,y)=>{axes.current=[axes.current[0],axes.current[1],y,x];if(!x&&!y)send({action:'sticks',sequence:++sequence.current,axes:axes.current});}}/><FlightStick label="Move" horizontal="← Left / right →" vertical="↑ Forward / back ↓" disabled={!manual} onChange={(x,y)=>{axes.current=[x,y,axes.current[2],axes.current[3]];if(!x&&!y)send({action:'sticks',sequence:++sequence.current,axes:axes.current});}}/></div><div className="pilot-height-controls"><span>Height {(device?.height_cm??0)} cm</span>{[1,-1].map(sign=><button className="button button-secondary" key={sign} disabled={!manual} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);axes.current=[0,0,sign*10,0];}} onPointerUp={neutral} onPointerCancel={neutral} onLostPointerCapture={neutral}>{sign>0?'Hold to rise':'Hold to descend'}</button>)}</div><div className="pilot-key-hint">WASD move · Q/E yaw · R/F height · Space hover · Esc land<br/>Release a stick to centre it. SDK stick units limited to ±20.</div></>:
    <div className="pilot-reports"><label htmlFor="runtime-report">Saved report</label><select id="runtime-report" value={reportName} onChange={e=>void openReport(e.target.value)}><option value="">Select a run to inspect</option>{reports.map(r=><option key={r.name} value={r.name}>{r.name} · {r.source} · {r.fault||r.result}</option>)}</select>
      {report&&summary?<><div className="pilot-report-banner"><span className="eyebrow">HISTORICAL REPORT · {report.source??'REAL TT'}</span><h3>{summary.fault||report.result||report.phase}</h3><p>{summary.yawSent?'A yaw command was sent.':'No yaw command was sent.'} {summary.landAttempts} land attempts.</p><p>First “ok” after takeoff: {summary.firstOkSeconds?.toFixed(2)??'none'}s · First fault: {summary.faultSeconds?.toFixed(2)??'—'}s</p><small>SDK replies have no command IDs; “ok” cannot by itself confirm which command succeeded or prove touchdown. Old reports save offline state after closing the link.</small></div>
      <div className="pilot-report-state">Recorded height {report.state?.height_cm??'—'} cm · Airborne possible: {String(report.state?.airborne_possible??'unknown')}</div>
      <table className="pilot-wire-table"><thead><tr><th>Time</th><th>Direction</th><th>Command / reply</th></tr></thead><tbody>{report.wire_events?.map((e,i)=><tr key={i}><td>{summary.start!==undefined?(e.monotonic-summary.start).toFixed(2)+'s':e.monotonic.toFixed(2)}</td><td>{e.direction}</td><td>{e.command??e.response}</td></tr>)}</tbody></table>
      {report.assessment&&<div className="pilot-assessment"><h3>Grok assessment</h3><p>{report.assessment.summary}</p>{report.assessment.limitations.map((text,i)=><p key={i}>{text}</p>)}</div>}
      <div className="pilot-report-photos">{report.frames?.map((f,i)=>{const url=reportPhoto(f.photo_url);return url?<img key={i} src={url} alt={`Recorded scan view ${f.label??i}`}/>:null;})}</div></>:<div className="grounded-empty"><FileText size={25}/><h3>Read what actually happened.</h3><p>Inspect flight faults, SDK send attempts and received replies.</p></div>}
    </div>}
    <div className="decision-strip"><ShieldCheck size={16}/><div><div className="decision-label">MANUAL CONTROL · PRIORITY LANDING</div><p>{device?.landing_unconfirmed?'Landing unconfirmed. Controller stays open; Land/recover and motor cut remain available.':device?.simulated===false?'Real camera and telemetry. Position and obstacle clearance are unknown.':'Pilot simulator exercises the same controller and stop path without hardware.'}</p></div></div></section>
    <aside className="intelligence-sidebar"><section className="telemetry-panel panel"><div className="section-title"><span className="section-heading"><Activity size={14}/>Telemetry</span><span className="mock-label">{device?.simulated===false?'REAL TT':'SIMULATOR'}</span></div><div className="telemetry-grid"><div><span><Battery size={12}/>Battery</span><strong>{device?.connected?device.battery_pct:'—'}<small>%</small></strong></div><div><span>Height</span><strong>{device?.connected?(device.height_cm/100).toFixed(2):'—'}<small>m</small></strong></div><div><span><Compass size={12}/>Heading</span><strong>{device?.connected?device.yaw_deg:'—'}<small>°</small></strong></div><div><span>Armed</span><strong className="pilot-state-text">{device?.armed?'YES':'NO'}</strong></div></div></section>
    <section className="agent-panel panel"><div className="section-title"><span className="section-heading"><Radio size={15}/>Command / reply log</span></div><div className="activity-scroll">{state?.wire_events.slice(-18).reverse().map((e,i)=><div className="log-entry" key={i}><div className="log-content"><div className="log-meta"><span>{e.direction==='send'?'SEND ATTEMPT':'RECEIVED REPLY'}</span></div><p>{e.command??e.response}</p></div></div>)}</div><div className="agent-footer"><span>Sent ≠ executed. Grounded requires telemetry.</span></div></section>
    {state?.record?.assessment&&<section className="panel pilot-assessment"><div className="section-title">Grok post-landing assessment</div><p>{state.record.assessment.summary}</p></section>}
    <section className="panel pilot-plain-note"><h3>Control ownership</h3><p>One dashboard owns this device. A dropped browser link requests landing. Land/recover does not wait for a takeoff or yaw ACK.</p><p>Manual mode has no obstacle avoidance. Leaving the workspace requests landing.</p></section></aside>
    </div></main><div className="pilot-stop-bar" aria-label="Persistent flight stop controls"><span>{device?.simulated===false?'REAL TT':'SIM'}</span><button disabled={!linked} onClick={()=>{axes.current=[0,0,0,0];send({action:'hover'});}} aria-label="Hover now"><Square size={12}/>Hover</button><button className="stop-land" disabled={!deviceId} onClick={()=>void land()} aria-label="Land now"><LandPlot size={15}/>LAND NOW</button><button className={`stop-cut ${cutHeld?'holding':''}`} disabled={!linked} onPointerDown={cutStart} onPointerUp={cutCancel} onPointerCancel={cutCancel} onPointerLeave={cutCancel} onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();e.stopPropagation();cutStart();}}} onKeyUp={cutCancel} aria-label="Hold 1.5 seconds to cut motors"><TriangleAlert size={13}/>{cutHeld?'Hold…':'HOLD · CUT'}</button>{!linked&&<button onClick={()=>setConnectionVersion(v=>v+1)}>Reconnect</button>}</div><footer className="global-footer"><div><span className="status-dot"/>SEEK FLIGHT CONTROL<span className="footer-divider"/>{device?.simulated===false?'REAL TT':'SIMULATED AIRCRAFT'}</div><span>Forward ToF retired · bounded flight</span></footer>
  </div>;
}
