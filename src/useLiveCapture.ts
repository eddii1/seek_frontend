import { useEffect, useRef, useState } from 'react';
import type { Activity, MissionConfig, MissionController, MissionState } from './types';
import { api, photoUrl, savedCaptureId, type BackendHealth, type CaptureJob, type DeviceState } from './adapters/liveCapture';

function initial(): MissionState {
  // Geometry fields satisfy the shared simulation interface; live mode never plots them.
  return {id:'live',name:'Grounded image assessment',description:'',scenarioId:'',seed:0,status:'idle',previousStatus:null,
    elapsed:0,drone:{x:0,y:0},heading:0,battery:0,altitude:0,signal:0,distance:0,currentRegionId:null,destinationId:null,
    observations:{},candidates:[],activeCandidateId:null,log:[],trail:[],speed:1,phaseProgress:0};
}

export function useLiveCapture(enabled: boolean) {
  const [state, setState] = useState(initial);
  const [devices, setDevices] = useState<DeviceState[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [capture, setCapture] = useState<CaptureJob | null>(null);
  const generation = useRef(0);
  const captureRef = useRef<CaptureJob | null>(null);
  const busy = useRef(false);
  const startedAt = useRef(0);
  const polling = useRef<AbortController | null>(null);
  function remember(id: string | null) {
    const url=new URL(window.location.href);
    if(id) url.searchParams.set('capture',id); else url.searchParams.delete('capture');
    window.history.replaceState(null,'',url);
  }
  function log(text: string, category: Activity['category'] = 'action') {
    setState(previous => ({...previous, log:[...previous.log,{id:crypto.randomUUID(),category,text,
      elapsed:startedAt.current ? (Date.now()-startedAt.current)/1000 : 0}].slice(-150)}));
  }
  function cancel() {
    generation.current++; busy.current = false; polling.current?.abort();
    const job = captureRef.current;
    if (job?.status === 'analyzing') void api(`/captures/${job.id}/cancel`, {method:'POST'}).catch(() => setError('Cancellation could not be confirmed. Check the backend.'));
    setState(previous => ({...previous,status:'aborted'}));
  }
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const controller = new AbortController();
    async function refresh() {
      try {
        const [nextDevices,nextHealth] = await Promise.all([
          api<DeviceState[]>('/devices',{signal:controller.signal}),api<BackendHealth>('/health',{signal:controller.signal})]);
        if (disposed) return;
        setDevices(nextDevices); setHealth(nextHealth); setConnected(true);
        setSelectedId(current => nextDevices.some(d=>d.id===current) ? current : (nextDevices.find(d=>d.simulated===false)?.id ?? nextDevices[0]?.id ?? ''));
        const device = nextDevices.find(d=>d.id===selectedId);
        setState(previous => ({...previous, heading:device?.yaw_deg ?? 0,battery:device?.battery_pct ?? 0,
          altitude:(device?.height_cm ?? 0)/100,elapsed:busy.current ? (Date.now()-startedAt.current)/1000 : previous.elapsed}));
      } catch {
        if (!disposed) {setConnected(false);setDevices([]);}
      }
    }
    void refresh();
    const timer = window.setInterval(()=>void refresh(),1000);
    return () => {disposed=true;controller.abort();window.clearInterval(timer);};
  },[enabled,selectedId]);
  useEffect(() => () => { generation.current++; polling.current?.abort(); const job=captureRef.current;
    if(job?.status==='analyzing') void api(`/captures/${job.id}/cancel`,{method:'POST'}).catch(()=>{}); },[enabled]);

  useEffect(()=>{
    if(!enabled) return;
    const id=savedCaptureId(window.location.search);
    if(!id) return;
    let disposed=false;
    const token=generation.current;
    void(async()=>{
      try {
        let job=await api<CaptureJob>(`/captures/${id}`);
        while(!disposed && token===generation.current) {
          captureRef.current=job;setCapture(job);setSelectedId(job.device_id);
          busy.current=job.status==='analyzing';startedAt.current=job.created_at*1000;
          setState({...initial(),id:job.id,name:'Grounded image assessment',description:job.description,
            elapsed:Math.max(0,((job.finished_at??Date.now()/1000)-job.created_at)),
            status:job.status==='analyzing'?'investigating':job.status==='completed'?'completed':'aborted',
            log:[{id:job.id,category:job.status==='failed'?'alert':'observation',text:job.error??'Saved captured image and assessment restored.',elapsed:0}]});
          if(job.error) setError(job.error);
          if(job.status!=='analyzing') break;
          await new Promise(resolve=>window.setTimeout(resolve,700));
          if(disposed || token!==generation.current) break;
          job=await api<CaptureJob>(`/captures/${id}`);
        }
      } catch(failure) {if(!disposed && token===generation.current) setError(failure instanceof Error?failure.message:'Unable to restore capture');}
    })();
    return()=>{disposed=true;};
  },[enabled]);

  const device = devices.find(d=>d.id===selectedId) ?? null;
  function start(config: MissionConfig) {
    if (busy.current) return;
    if (!connected || !device?.connected) {setError('Connect the backend and a grounded camera device first.');return;}
    if (!health?.agent_ready || health.agent !== 'grok') {setError('Configure Grok on the backend before capturing.');return;}
    const token = ++generation.current;
    busy.current=true; startedAt.current=Date.now();setError('');setCapture(null);captureRef.current=null;
    remember(null);
    setState({...initial(),id:crypto.randomUUID(),name:config.name,description:config.description,status:'searching'});
    const controller = new AbortController();polling.current=controller;
    log(`Capturing one grounded ${device.simulated===false?'real drone':'simulator'} frame. No movement requested.`);
    void (async()=>{
      try {
        // Let POST resolve so cancellation during submission can still cancel its returned job ID.
        let job = await api<CaptureJob>('/captures',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({device_id:selectedId,description:config.description})});
        if(token!==generation.current) {void api(`/captures/${job.id}/cancel`,{method:'POST'}).catch(()=>{});return;}
        setCapture(job);captureRef.current=job;
        remember(job.id);
        setState(previous=>({...previous,status:'investigating'}));
        log('Captured image saved. Grok is assessing this exact JPEG.','observation');
        while(job.status==='analyzing') {
          await new Promise(resolve=>window.setTimeout(resolve,700));
          if(token!==generation.current) return;
          job=await api<CaptureJob>(`/captures/${job.id}`,{signal:controller.signal});
          if(token!==generation.current) return;
          setCapture(job);captureRef.current=job;
        }
        if(job.status==='failed') throw new Error(job.error ?? 'Grok assessment failed.');
        setState(previous=>({...previous,status:job.status==='cancelled'?'aborted':'completed',elapsed:(Date.now()-startedAt.current)/1000}));
        if(job.assessment) log(`${job.assessment.match_status.replace('_',' ')}: ${job.assessment.summary}`,'reasoning');
      } catch(failure) {
        if(token!==generation.current) return;
        const message=failure instanceof Error?failure.message:'Capture failed';setError(message);log(message,'alert');
        setState(previous=>({...previous,status:'aborted'}));
      } finally {if(token===generation.current) busy.current=false;}
    })();
  }
  const controller: MissionController={state,start,abort:cancel,pause:cancel,resume:()=>{},reset:(config)=>{
    cancel();captureRef.current=null;setCapture(null);setError('');startedAt.current=0;
    remember(null);
    setState({...initial(),name:config?.name ?? 'Grounded image assessment',description:config?.description ?? ''});
  },setSpeed:()=>{},confirmCandidate:()=>{},rejectCandidate:()=>{}};
  return {controller,devices,device,selectedId,setSelectedId,health,connected,error,capture,
    camera:{deviceId:capture?.device_id ?? device?.id ?? '',source:capture?.source ?? (device?.simulated===false?'real' as const:'simulation' as const),
      url:capture ? photoUrl(capture) : device?.connected ? `/api/video/${encodeURIComponent(device.id)}` : '',frozen:!!capture},
    ready:connected && !!device?.connected && health?.agent==='grok' && health.agent_ready};
}
