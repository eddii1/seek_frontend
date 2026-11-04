import {useEffect,useRef,useState} from 'react';
import {Activity,ArrowDownToLine,ArrowRight,Battery,Compass,Crosshair,Eye,FileText,Layers3,Play,Radio,RotateCcw,ShieldCheck,Square,Timer,Waypoints} from 'lucide-react';
import {api,type BackendHealth,type DeviceState} from '../adapters/liveCapture';
import type {ScanJob} from '../adapters/scans';
import RealCameraFeed from './RealCameraFeed';
import ScanMap from './ScanMap';
import './scans.css';

type ScanDevice=DeviceState&{scan_capable?:boolean};
export default function ScanDashboard({onExit}:{onExit:()=>void}){
  const [devices,setDevices]=useState<ScanDevice[]>([]),[deviceId,setDeviceId]=useState('');
  const [health,setHealth]=useState<BackendHealth|null>(null),[job,setJob]=useState<ScanJob|null>(null);
  const [goal,setGoal]=useState('Scan the environment. Look around, map obstacles, and explore a safe new viewpoint.');
  const [error,setError]=useState(''),[submitting,setSubmitting]=useState(false),[tab,setTab]=useState<'map'|'log'>('map');
  const current=useRef<ScanJob|null>(null),mounted=useRef(true),generation=useRef(0);
  const active=submitting||job?.status==='running';
  useEffect(()=>{mounted.current=true;let disposed=false;
    async function refresh(){try{const [d,h]=await Promise.all([api<ScanDevice[]>('/devices'),api<BackendHealth>('/health')]);
      if(disposed)return;setDevices(d);setHealth(h);setDeviceId(previous=>d.some(x=>x.id===previous)?previous:d.find(x=>x.scan_capable)?.id??'');
    }catch{if(!disposed)setError('Backend unavailable. Start the scan simulator configuration.');}}
    void refresh();const timer=window.setInterval(()=>void refresh(),1200);
    return()=>{disposed=true;mounted.current=false;generation.current++;window.clearInterval(timer);const running=current.current;
      if(running?.status==='running')void api(`/scans/${running.id}/stop`,{method:'POST'}).catch(()=>{});};},[]);
  useEffect(()=>{if(!job||job.status!=='running')return;const id=job.id;
    const timer=window.setInterval(()=>void api(`/scans/${id}/heartbeat`,{method:'POST'}).catch(()=>{}),750);
    return()=>window.clearInterval(timer);},[job?.id,job?.status]);
  async function start(){
    if(active||!deviceId)return;setSubmitting(true);setError('');const token=++generation.current;
    try{let next=await api<ScanJob>('/scans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device_id:deviceId,goal,max_decisions:12})});
      if(!mounted.current||token!==generation.current){void api(`/scans/${next.id}/stop`,{method:'POST'}).catch(()=>{});return;}
      current.current=next;setJob(next);setSubmitting(false);
      while(next.status==='running'){
        await new Promise(resolve=>window.setTimeout(resolve,700));if(!mounted.current||token!==generation.current)return;
        next=await api<ScanJob>(`/scans/${next.id}`);if(!mounted.current||token!==generation.current)return;
        current.current=next;setJob(next);
      }
    }catch(failure){if(mounted.current&&token===generation.current){
      setError(failure instanceof Error?failure.message:'Scan failed');
      const running=current.current;
      if(running?.status==='running'){
        // Stop renewing the lease on polling failure, even if the STOP request cannot reach the server.
        setJob({...running,status:'failed',error:'Dashboard connection lost; STOP requested'});
        void api<ScanJob>(`/scans/${running.id}/stop`,{method:'POST'}).then(stopped=>{
          if(mounted.current&&token===generation.current){current.current=stopped;setJob(stopped);}
        }).catch(()=>{});
      }
    }}
    finally{if(mounted.current&&token===generation.current)setSubmitting(false);}
  }
  async function stop(){const running=current.current;if(!running)return;
    try{const stopped=await api<ScanJob>(`/scans/${running.id}/stop`,{method:'POST'});generation.current++;current.current=stopped;setJob(stopped);}
    catch{setError('STOP was not confirmed. The simulator lands if the dashboard heartbeat expires.');}}
  function exportReport(){if(!job)return;const blob=URL.createObjectURL(new Blob([JSON.stringify(job,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=blob;a.download=`seek-scan-${job.id}.json`;a.click();URL.revokeObjectURL(blob);}
  const device=devices.find(d=>d.id===deviceId),last=job?.decisions.at(-1);
  const elapsed=job?Math.max(0,(job.finished_at??Date.now()/1000)-job.created_at):0;
  return <div className="app-shell scan-console">
    <header className="topbar"><a href="#" className="brand" onClick={e=>e.preventDefault()} aria-label="SEEK command center"><div className="brand-symbol"><span/><span/><span/><span/><i/></div><span className="brand-word">SEEK</span></a><span className="brand-description">AUTONOMOUS SEARCH INTELLIGENCE</span><div className="topbar-divider"/><div className="top-mission"><span className="subtle">Workspace</span><ArrowRight size={13}/>Mapping operations</div><div className="topbar-right"><button className="simulation-pill capture-mode-switch" disabled={active} onClick={onExit}>Capture dashboard</button><span className="system-ready"><i className="status-dot"/>GROK · SIMULATOR</span><span className="operator-avatar">OP</span></div></header>
    <nav className="nav-rail" aria-label="Workspace navigation"><button className={`rail-button ${tab==='map'?'selected':''}`} aria-label="Mapping workspace" onClick={()=>setTab('map')}><Crosshair size={20}/></button><button className={`rail-button ${tab==='log'?'selected':''}`} aria-label="Scan mission log" onClick={()=>setTab('log')}><FileText size={20}/></button><div className="rail-spacer"/><span className="rail-version">S / 02</span></nav>
    <main className="main-workspace"><div className="workspace-heading"><div><div className="eyebrow">OPERATIONS / GROK MAPPING</div><div className="workspace-title"><h1>Scan the environment</h1><span className={`mission-badge status-${job?.status==='completed'?'completed':active?'searching':'idle'}`}><i/>{job?.status.replaceAll('_',' ')??'Ready to scan'}</span></div></div><div className="mission-clock"><Timer size={14}/><span>{Math.floor(elapsed/60).toString().padStart(2,'0')}:{Math.floor(elapsed%60).toString().padStart(2,'0')}</span><small>MISSION TIME</small></div></div>
      <div className="dashboard-grid"><aside className="mission-sidebar panel"><div className="section-title"><span className="section-heading"><Crosshair size={15}/>Mission control</span><span className="section-index">01</span></div>
        <div className="mission-form"><label htmlFor="scan-device">Scan device</label><div className="select-wrap"><Layers3 size={14}/><select id="scan-device" value={deviceId} disabled={active} onChange={e=>setDeviceId(e.target.value)}>{!deviceId&&<option value="">No scan simulator available</option>}{devices.filter(d=>d.scan_capable||d.simulated===false).map(d=><option key={d.id} value={d.id} disabled={!d.scan_capable}>{d.id} · {d.scan_capable?'ROOM SIMULATOR':'REAL TT · FLIGHT GATED'}</option>)}</select></div>
          <div className="scenario-caption">Autonomous Grok decisions · synthetic room<br/>Two scan stations · automatic simulated landing<br/>Real drone motors remain disabled</div>
          <div className="label-row target-label"><label htmlFor="scan-goal">Mission instruction</label><span className="tiny-spark">NATURAL LANGUAGE</span></div><div className="target-input"><textarea id="scan-goal" value={goal} maxLength={1000} disabled={active} onChange={e=>setGoal(e.target.value)}/></div>
          <div className="example-row"><span>TRY</span><button disabled={active} onClick={()=>setGoal('Scan the environment. Look in all directions and explore an unvisited safe viewpoint.')}>Scan the environment<ArrowRight size={11}/></button></div>
          {error&&<p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary start-button" disabled={active||!device?.connected||!goal.trim()||health?.agent!=='grok'||!health.agent_ready} onClick={()=>void start()}>{active?<Radio size={14}/>:<Play size={14}/>} {active?'Grok is exploring':'Start autonomous scan'}<ArrowRight size={16}/></button>
        </div><div className="mission-overview"><div className="label-row"><span className="eyebrow">OBSERVED MAP</span><strong className="coverage-value">{job?Math.round((job.map.counts.free+job.map.counts.obstacle)/(job.map.size**2)*100):0}<small>%</small></strong></div><div className="progress-track"><div style={{width:`${job?(1-job.map.counts.unknown/job.map.size**2)*100:0}%`}}/></div><div className="coverage-caption"><span>Observed within fixed map extent</span><span className="mono">50 CM GRID</span></div><div className="mission-counts"><div><Eye size={14}/><strong>{job?.headings_seen.length??0}/4</strong><span>Headings seen</span></div><div><Waypoints size={14}/><strong>{job?.moves??0}</strong><span>Safe steps</span></div></div>
          <div className="mission-controls"><button className="button button-danger" disabled={!active||!job} onClick={()=>void stop()}><Square size={12}/>STOP & land</button><button className="button button-secondary" disabled={active} onClick={()=>{setJob(null);current.current=null;setError('');}}><RotateCcw size={13}/>Reset</button></div></div>
          <div className="scan-safety-note"><ShieldCheck size={16}/><div><strong>Local safety checks</strong><p>Unknown cells blocked · obstacle clearance · 50 cm steps · bounded mission · heartbeat landing</p><p>Forward ToF retired. Physical watchdog unchanged.</p></div></div>
        </aside>
        <section className="map-panel panel"><div className="map-toolbar"><div className="map-tabs"><button className={tab==='map'?'active':''} onClick={()=>setTab('map')}><Layers3 size={15}/>Environment map</button><button className={tab==='log'?'active':''} onClick={()=>setTab('log')}><FileText size={14}/>Mission log <span>{job?.decisions.length??0}</span></button></div><button className="icon-button" aria-label="Export scan report" disabled={!job} onClick={exportReport}><ArrowDownToLine size={16}/></button></div>
          {tab==='map'?<ScanMap job={job}/>:<div className="full-mission-log scan-full-log"><div className="full-log-heading"><h3>Grok decisions and checked outcomes</h3></div>{job?.decisions.map(record=><div className="log-entry" key={record.turn}><div className="log-icon"><Waypoints size={12}/></div><div className="log-content"><div className="log-meta"><span>Decision {record.turn} · {record.decision.action}</span></div><p>{record.decision.reason}</p><p>{record.decision.observation}</p><p>{record.result}</p></div></div>)}</div>}
          <div className="decision-strip"><div className="decision-icon"><Waypoints size={16}/></div><div><div className="decision-label">GROK PLANS · LOCAL CODE CHECKS<span>{job?.landed?'GROUNDED':active?'ACTIVE':'STANDBY'}</span></div><p>{job?.error??job?.stop_reason??(active?job?.phase:last?.decision.reason)??'Camera views become a map. Grok chooses each next viewpoint.'}</p></div></div>
          <div className="map-bottom-bar"><span>SIMULATED GEOMETRY · REAL GROK API</span><span>NO REAL FLIGHT</span></div>
        </section>
        <aside className="intelligence-sidebar"><section className="camera-panel panel"><div className="section-title"><span className="section-heading"><Eye size={15}/>Drone camera</span><span className="mock-label">SIMULATOR</span></div><RealCameraFeed camera={{deviceId,source:'simulation',url:device?.connected?`/api/video/${encodeURIComponent(deviceId)}`:'',frozen:false,mode:'scan',flying:!!active}}/><div className="camera-footer"><span>SIMULATED ROOM / CAM 01</span><span>{Math.round(job?.pose.yaw??0)}° HDG</span></div></section>
          <section className="agent-panel panel"><div className="section-title"><span className="section-heading"><span className="grok-symbol">𝕏</span>Grok activity</span><span className="mock-label">{health?.model??'API UNAVAILABLE'}</span></div><div className="activity-scroll" aria-live="polite">{job?.decisions.length?job.decisions.slice().reverse().map(record=><div className="log-entry log-reasoning" key={record.turn}><div className="log-icon"><Waypoints size={12}/></div><div className="log-content"><div className="log-meta"><span>{record.turn.toString().padStart(2,'0')} · {record.decision.action} {record.decision.action==='goto'?record.decision.cell:record.decision.action==='look'?record.decision.heading+'°':''}</span></div><p>{record.decision.reason}</p><small>{record.result}</small></div></div>):<div className="log-empty"><Activity size={23}/><strong>Grok standing by</strong><span>Each decision uses the current map, camera and visit history.</span></div>}</div><div className="agent-footer"><span className="agent-orb"/><span>{active?job?.phase:'Bounded autonomous scan'}</span></div></section>
          <section className="telemetry-panel panel"><div className="section-title"><span className="section-heading"><Activity size={14}/>Drone telemetry</span><span className="mock-label">SIMULATED</span></div><div className="telemetry-grid"><div><span><Battery size={12}/>Battery</span><strong>{device?.battery_pct??'—'}<small>%</small></strong></div><div><span>Height</span><strong>{(job?.pose.z??0).toFixed(2)}<small>m</small></strong></div><div><span><Compass size={12}/>Heading</span><strong>{Math.round(job?.pose.yaw??0)}<small>°</small></strong></div><div><span>State</span><strong className="scan-state-text">{job?.landed?'Grounded':active?'Flying':'Ready'}</strong></div></div><div className="position-readout"><Crosshair size={12}/><span>X <b>{(job?.pose.x??0).toFixed(2)}</b></span><span>Y <b>{(job?.pose.y??0).toFixed(2)}</b></span><small>Simulated metres</small></div></section>
        </aside>
      </div>
    </main><footer className="global-footer"><div><span className="status-dot"/>SEEK SYSTEM ONLINE<span className="footer-divider"/>GROK MAPPING SIMULATOR<span className="footer-divider"/><span className="footer-disclaimer">Synthetic depth and pose · physical navigation gated</span></div><span>OBSERVE. REASON. MAP.</span></footer>
  </div>;
}
