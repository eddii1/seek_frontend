import type { CaptureJob } from '../adapters/liveCapture';
import { photoUrl } from '../adapters/liveCapture';
import './grounded.css';

export default function GroundedCapture({capture,error,connected}:{capture:CaptureJob|null;error:string;connected:boolean}) {
  return <div className="grounded-workspace">
    <div className="map-info-bar"><div><i className={connected?'status-dot':'status-dot dim'}/><span>GROUNDED IMAGE ASSESSMENT</span></div><span className="map-scale-info">MOTOR COMMANDS DISABLED</span></div>
    <div className="grounded-content" tabIndex={0} aria-label="Captured image and assessment">
      {!capture ? <div className="grounded-empty"><div className="ready-icon">◎</div><h3>One frame. Visible evidence.</h3><p>Enter an object or scene description, then capture the drone’s current view.</p><p>No room position or map is inferred. The aircraft stays grounded.</p></div> : <>
        <img className="grounded-result-image" src={photoUrl(capture)} alt="Exact captured frame assessed by Grok"/>
        <div className="grounded-caption"><span>{capture.source==='real'?'REAL DRONE IMAGE':'SIMULATOR IMAGE'} · {capture.width} × {capture.height}</span><span>{new Date(capture.captured_at*1000).toLocaleTimeString()}</span></div>
        <div className="grounded-assessment" aria-live="polite"><div className="label-row"><span className="eyebrow">GROK ASSESSMENT</span><span className="mission-badge">{capture.assessment?.match_status.replace('_',' ').toUpperCase() ?? capture.status.toUpperCase()}</span></div>
          <p className="evidence-target">“{capture.description}”</p>
          {capture.assessment ? <><h3>{capture.assessment.summary}</h3><h4>Visible evidence</h4><ul>{capture.assessment.evidence.map((text,index)=><li key={index}>{text}</li>)}</ul><h4>Limitations</h4><ul>{capture.assessment.limitations.map((text,index)=><li key={index}>{text}</li>)}</ul><small>{capture.model} · Model assessment, subject to visual uncertainty</small></>
            : <p>{capture.status==='analyzing'?'Assessing the captured frame…':capture.error ?? 'Assessment cancelled. The image is retained.'}</p>}
          <div className="grounded-range">TT expansion ToF: {capture.forward_range.status==='valid'?`${capture.forward_range.distance_mm} mm` : capture.forward_range.status.replaceAll('_',' ')}<small>Single-direction sample; target association and obstacle clearance are unverified.</small></div>
        </div>
      </>}
      {error&&<p className="form-error" role="alert">{error}</p>}
    </div>
    <div className="decision-strip"><div className="decision-label">CAPTURE → ASSESS → REVIEW</div><p>Image and timestamped metadata are available in the mission export. Room position remains unknown.</p></div>
  </div>;
}
