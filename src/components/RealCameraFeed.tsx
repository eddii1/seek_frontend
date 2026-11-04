import { useState } from 'react';
import './camera.css';
export interface LiveCamera {url:string;deviceId:string;source:'real'|'simulation';frozen:boolean}
export default function RealCameraFeed({camera,expanded=false}:{camera:LiveCamera;expanded?:boolean}) {
  const [failed,setFailed]=useState(false);
  return <div className={`camera-feed ${expanded?'camera-feed-expanded':''}`} aria-label={`${camera.source} drone camera`}>
    {camera.url&&<img key={camera.url} className="camera-scene real-camera-image" src={camera.url} alt={camera.frozen?'Captured frame':'Live drone camera'} onError={()=>setFailed(true)} onLoad={()=>setFailed(false)}/>}
    {(!camera.url||failed)&&<div className="camera-center-message"><span>CAMERA UNAVAILABLE</span><small>Check the grounded drone and backend connection.</small></div>}
    <div className="camera-overlay-top"><span className="camera-sector">{camera.deviceId||'NO DEVICE'}</span><span className="camera-sim-label">{camera.source==='real'?'REAL DRONE':'SIMULATOR'}</span></div>
    <div className="camera-overlay-bottom"><span>GROUNDED · NO MOVEMENT</span><span>{camera.frozen?'CAPTURED FRAME':'LIVE VIDEO'}</span></div>
    <div className="camera-data-strip"><span>{camera.frozen?'FRAME HELD FOR ASSESSMENT':'CAMERA STREAM'}</span><span>POSITION UNKNOWN</span></div>
  </div>;
}
