import {useEffect,useRef,useState} from 'react';
import {stickPoint} from '../adapters/pilot';
export default function FlightStick({label,horizontal,vertical,disabled,onChange}:{label:string;horizontal:string;vertical:string;disabled:boolean;onChange:(x:number,y:number)=>void}){
  const [point,setPoint]=useState<[number,number]>([0,0]);const active=useRef<number|null>(null);
  function update(e:React.PointerEvent<SVGSVGElement>){if(disabled)return;const rect=e.currentTarget.getBoundingClientRect();const [x,y]=stickPoint((e.clientX-rect.left-rect.width/2)/(rect.width*.32),(e.clientY-rect.top-rect.height/2)/(rect.height*.32));setPoint([x,y]);onChange(x,y);}
  function reset(){if(active.current===null)return;active.current=null;setPoint([0,0]);onChange(0,0);}
  useEffect(()=>{if(disabled){active.current=null;setPoint([0,0]);}},[disabled]);
  const displayed=disabled?[0,0]:point;
  return <div className={`flight-stick ${disabled?'disabled':''}`}><div className="label-row"><strong>{label}</strong><span>{displayed[0]} / {displayed[1]}</span></div><svg viewBox="0 0 160 160" role="group" aria-label={label} onPointerDown={e=>{if(disabled)return;active.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);update(e);}} onPointerMove={e=>{if(active.current===e.pointerId)update(e);}} onPointerUp={reset} onPointerCancel={reset} onLostPointerCapture={()=>{if(active.current!==null)reset();}}>
    <circle cx={80} cy={80} r={65} fill="#102027" stroke="#30484b"/><circle cx={80} cy={80} r={38} fill="none" stroke="#263e43" strokeDasharray="2 4"/><path d="M80 15V145M15 80H145" stroke="#355053"/><circle cx={80+displayed[0]*2} cy={80-displayed[1]*2} r={23} fill={disabled?'#233238':'#4f8176'} stroke={disabled?'#405354':'#9ed2be'}/><circle cx={80+displayed[0]*2} cy={80-displayed[1]*2} r={6} fill="#bad8ce"/>
  </svg><div className="stick-axis-labels"><span>{horizontal}</span><span>{vertical}</span></div></div>;
}
