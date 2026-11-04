import {useEffect,useRef,useState} from 'react';
import type {ScanJob} from '../adapters/scans';

export default function ScanMap({job}:{job:ScanJob|null}){
  const [view,setView]=useState<'3d'|'grid'>('3d');
  const [orbit,setOrbit]=useState({yaw:-.5,pitch:.85,zoom:1});
  const canvas=useRef<HTMLCanvasElement>(null),drag=useRef<{x:number;y:number}|null>(null);
  useEffect(()=>{
    const element=canvas.current;if(!element||view!=='3d')return;
    function draw(){
      const el=canvas.current;if(!el)return;
      const ctx=el.getContext('2d');if(!ctx)return;
      const w=el.clientWidth,h=el.clientHeight,ratio=window.devicePixelRatio||1;
      el.width=w*ratio;el.height=h*ratio;ctx.scale(ratio,ratio);ctx.clearRect(0,0,w,h);
      const scale=Math.min(w,h)/9*orbit.zoom;
      const project=(x:number,y:number,z:number)=>{
        const a=x*Math.cos(orbit.yaw)-y*Math.sin(orbit.yaw),b=x*Math.sin(orbit.yaw)+y*Math.cos(orbit.yaw);
        return [w/2+a*scale,h*.59+(b*Math.cos(orbit.pitch)-z*Math.sin(orbit.pitch))*scale,b];
      };
      ctx.lineWidth=1;ctx.strokeStyle='#23383c';
      for(let n=-4;n<=4;n+=.5){for(const ends of [[[-4,n,0],[4,n,0]],[[n,-4,0],[n,4,0]]]){
        const a=project(...ends[0] as [number,number,number]),b=project(...ends[1] as [number,number,number]);
        ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();}}
      const points=(job?.map.points??[]).map(p=>({p,q:project(p[0],p[1],p[2])})).sort((a,b)=>a.q[2]-b.q[2]);
      for(const {p,q} of points){ctx.fillStyle=`rgb(${Math.round(p[3]*255)} ${Math.round(p[4]*255)} ${Math.round(p[5]*255)})`;ctx.globalAlpha=.85;ctx.fillRect(q[0]-1.5,q[1]-1.5,3*orbit.zoom,3*orbit.zoom);}
      ctx.globalAlpha=1;ctx.strokeStyle='#d8b77c';ctx.lineWidth=2;ctx.beginPath();
      job?.map.trail.forEach((p,i)=>{const q=project(p[0],p[1],.03);if(i)ctx.lineTo(q[0],q[1]);else ctx.moveTo(q[0],q[1]);});ctx.stroke();
      if(job){const p=job.pose,q=project(p.x,p.y,p.z),a=p.yaw*Math.PI/180;
        const tip=project(p.x+Math.sin(a)*.45,p.y+Math.cos(a)*.45,p.z);
        ctx.strokeStyle='#8ed4c1';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(q[0],q[1]);ctx.lineTo(tip[0],tip[1]);ctx.stroke();
        ctx.fillStyle='#a1e1d0';ctx.beginPath();ctx.arc(q[0],q[1],5,0,Math.PI*2);ctx.fill();}
    }
    draw();const observer=new ResizeObserver(draw);observer.observe(element);return()=>observer.disconnect();
  },[job,orbit,view]);
  const n=job?.map.size??17,pose=job?.pose;
  return <div className="scan-map-wrap"><div className="map-info-bar"><span>LIVE VOXEL MAP · SYNTHETIC DEPTH</span><div className="scan-view-tabs"><button aria-pressed={view==='3d'} onClick={()=>setView('3d')}>3D point cloud</button><button aria-pressed={view==='grid'} onClick={()=>setView('grid')}>Top-down grid</button></div></div>
    <div className="scan-map-stage">{view==='3d'?<canvas ref={canvas} aria-label="Interactive 3D point cloud of the simulated room" onPointerDown={e=>{drag.current={x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerUp={()=>drag.current=null} onPointerMove={e=>{const start=drag.current;if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;drag.current={x:e.clientX,y:e.clientY};setOrbit(o=>({...o,yaw:o.yaw+dx*.006,pitch:Math.max(.2,Math.min(1.45,o.pitch+dy*.006))}));}} onWheel={e=>setOrbit(o=>({...o,zoom:Math.max(.6,Math.min(2.2,o.zoom-e.deltaY*.001))}))}/>:<svg viewBox={`0 0 ${n*30} ${n*30}`} role="img" aria-label="Observed occupancy grid, unknown cells blocked">
      {Array.from({length:n*n},(_,i)=>{const c=i%n,r=Math.floor(i/n),value=job?.map.grid[r]?.[c]??0;return <g key={i}><rect x={c*30} y={r*30} width={30} height={30} fill={['#1c282d','#4f756d','#a86459'][value]} stroke="#293c40"/><text x={c*30+3} y={r*30+10} fill="#a0b2b1" fontSize={7}>{String.fromCharCode(65+c)}{r+1}</text></g>;})}
      {pose&&<g transform={`translate(${(pose.x+job!.map.half_m)/job!.map.cell_m*30} ${(job!.map.half_m-pose.y)/job!.map.cell_m*30}) rotate(${pose.yaw})`}><circle r={7} fill="#a1e1d0"/><path d="M0 -14L-5 -4H5Z" fill="#e5f5f0"/></g>}
    </svg>}
    {!job&&<div className="scan-empty"><h3>Let Grok explore.</h3><p>Start a simulator scan to build the map from camera views.</p></div>}
    <span className="scan-map-hint">{view==='3d'?'Drag to orbit · scroll to zoom':'50 cm cells · grey unknown · green observed free · red obstacle'}</span></div>
    <div className="scan-map-stats"><span>{job?.map.points.length??0} coloured voxels</span><span>{job?.map.counts.free??0} free cells</span><span>{job?.map.counts.obstacle??0} obstacles</span><span>{job?.map.counts.unknown??n*n} unknown</span></div>
  </div>;
}
