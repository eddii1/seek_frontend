import {useEffect,useRef,useState} from 'react';
import {api,type DeviceState,type RangeReading} from '../adapters/liveCapture';
import './tof.css';

interface Summary {sample_count:number;valid_count:number;status_counts:Record<string,number>;median_mm:number|null;min_mm:number|null;max_mm:number|null;stddev_mm:number|null;mean_absolute_error_mm:number|null}
interface RangeJob {id:string;status:'sampling'|'completed'|'failed'|'cancelled';device_id:string;object_label:string;reference_distance_mm:number|null;sample_count:number;created_at:number;samples:RangeReading[];summary:Summary;firmware:string|null;error:string|null}
type HistoryItem=Pick<RangeJob,'id'|'status'|'object_label'|'reference_distance_mm'|'created_at'|'summary'>;

export default function ToFPanel({device}:{device:DeviceState|null}) {
  const [label,setLabel]=useState('White card / book');
  const [reference,setReference]=useState('');
  const [count,setCount]=useState(10);
  const [job,setJob]=useState<RangeJob|null>(null);
  const [history,setHistory]=useState<HistoryItem[]>([]);
  const [error,setError]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const mounted=useRef(true),current=useRef<RangeJob|null>(null),generation=useRef(0);
  const active=submitting||job?.status==='sampling';
  async function loadHistory(){try{const result=await api<HistoryItem[]>('/range-tests');if(mounted.current)setHistory(result);}catch{/* main request supplies actionable errors */}}
  useEffect(()=>{mounted.current=true;void loadHistory();return()=>{mounted.current=false;generation.current++;const running=current.current;
    if(running?.status==='sampling')void api(`/range-tests/${running.id}/cancel`,{method:'POST'}).catch(()=>{});};},[]);
  async function start(event:React.FormEvent){
    event.preventDefault();setError('');setSubmitting(true);
    const token=++generation.current;
    try{
      let next=await api<RangeJob>('/range-tests',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({device_id:device?.id,object_label:label,reference_distance_mm:reference?Number(reference):null,sample_count:count})});
      if(!mounted.current||token!==generation.current){void api(`/range-tests/${next.id}/cancel`,{method:'POST'}).catch(()=>{});return;}
      current.current=next;setJob(next);setSubmitting(false);
      while(next.status==='sampling'){
        await new Promise(resolve=>window.setTimeout(resolve,450));
        if(!mounted.current||token!==generation.current)return;
        next=await api<RangeJob>(`/range-tests/${next.id}`);
        if(!mounted.current||token!==generation.current)return;
        current.current=next;setJob(next);
      }
      await loadHistory();
    }catch(failure){if(mounted.current&&token===generation.current)setError(failure instanceof Error?failure.message:'ToF test failed');}
    finally{if(mounted.current&&token===generation.current)setSubmitting(false);}
  }
  async function cancel(){generation.current++;setSubmitting(false);const running=current.current;
    if(running){try{const stopped=await api<RangeJob>(`/range-tests/${running.id}/cancel`,{method:'POST'});current.current=stopped;setJob(stopped);void loadHistory();}
    catch{setError('Cancellation was not confirmed; check backend state.');}}}
  async function open(id:string){try{const result=await api<RangeJob>(`/range-tests/${id}`);current.current=result;setJob(result);}catch{setError('Saved test unavailable in this backend session.');}}
  function download(){if(!job)return;const url=URL.createObjectURL(new Blob([JSON.stringify(job,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`tt-tof-${job.id}.json`;link.click();URL.revokeObjectURL(url);}
  const latest=job?.samples.at(-1),summary=job?.summary;
  return <div className="tof-panel">
    <div className="help-note">Move the test object, keep the TT stationary. Point the sensor window on the 8×8 matrix board at a flat light card/book about 20–30 cm away first. Use a ruler from the sensor window if entering a reference distance. Motor commands stay disabled.</div>
    <form onSubmit={start} className="tof-form"><label>Object / surface<input aria-label="ToF object label" required maxLength={160} value={label} disabled={active} onChange={e=>setLabel(e.target.value)}/></label>
      <label>Measured reference (optional, mm)<input aria-label="Reference distance in millimetres" type="number" min={1} max={3000} value={reference} disabled={active} onChange={e=>setReference(e.target.value)} placeholder="e.g. 300"/></label>
      <label>Samples<input aria-label="ToF sample count" type="number" min={3} max={30} value={count} disabled={active} onChange={e=>setCount(Number(e.target.value))}/></label>
      <div className="tof-actions"><button className="button button-primary" disabled={active||!device?.connected||device.simulated!==false}>{active?'Sampling…':'Measure object'}</button><button type="button" className="button button-secondary" disabled={!active} onClick={()=>void cancel()}>Cancel</button></div></form>
    {!device?.connected&&<p className="form-error">Reconnect the grounded TT before sampling.</p>}{error&&<p className="form-error" role="alert">{error}</p>}
    {job&&<><div className="tof-reading" aria-live="polite"><strong>{latest?.status==='valid'?`${latest.distance_mm} mm`:latest?.status?.replaceAll('_',' ').toUpperCase()??'WAITING'}</strong><span>{job.object_label} · {job.samples.length}/{job.sample_count} · {job.status}</span><small>Raw: {latest?.raw_response??'none'} · {latest?.reason??'waiting for sensor'}<br/>Controller: {job.firmware??'unavailable'}</small></div>
      {latest?.status==='invalid'&&<div className="help-note">Zero is not a usable distance. Check that the matrix/distance board is attached and its sensor window is unobstructed. Power off before reseating connections. Do not double-press the controller button; that can spin motors.</div>}
      <div className="tof-summary"><div>Usable<strong>{summary?.valid_count??0}/{summary?.sample_count??0}</strong></div><div>Median<strong>{summary?.median_mm??'—'} mm</strong></div><div>Spread (σ)<strong>{summary?.stddev_mm??'—'} mm</strong></div><div>Mean absolute error<strong>{summary?.mean_absolute_error_mm??'—'} mm</strong></div></div>
      <div className="tof-table-wrap"><table className="tof-table"><thead><tr><th>#</th><th>Raw response</th><th>Status</th><th>Usable mm</th><th>Ignored replies</th></tr></thead><tbody>{job.samples.map((sample,i)=><tr key={i}><td>{i+1}</td><td>{sample.raw_response??'timeout'}</td><td>{sample.status}</td><td>{sample.distance_mm??'—'}</td><td>{sample.ignored_responses?.length??0}</td></tr>)}</tbody></table></div>
      {job.error&&<p className="form-error">{job.error}</p>}<div className="tof-actions"><button className="button button-secondary" disabled={active} onClick={download}>Export test JSON</button></div></>}
    <div className="tof-history"><h3>Object tests in this session</h3>{history.map(item=><button key={item.id} disabled={active} onClick={()=>void open(item.id)}><span>{item.object_label}</span><span>{item.summary.valid_count}/{item.summary.sample_count} usable · {item.summary.median_mm??'—'} mm</span></button>)}</div>
    <div className="help-note">Try a light flat card, a cardboard box/book, then a dark or curved object. `8192` is out-of-range, `0` is invalid, and an expired cached sample is stale. Samples are bench diagnostics—not authorization to approach an object. Approach/recording remains disabled.</div>
  </div>;
}
