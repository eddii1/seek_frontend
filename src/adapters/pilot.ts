import type {DeviceState} from './liveCapture';
export type Axes=[number,number,number,number];
export interface PilotDevice extends DeviceState {pilot_capable:boolean;armed:boolean;control_enabled:boolean;ready_for_control:boolean;manual_ready?:boolean;link_open:boolean;airborne_possible:boolean;landing_requested:boolean;landing_unconfirmed:boolean;telemetry_age_s:number|null;video_age_s:number|null;sticks:Axes;elapsed_flight_s:number;flight_limit_s:number}
export interface WireEvent {monotonic:number;direction:string;command?:string;response?:string;matched?:boolean}
export interface FlightEvent {monotonic:number;event:string;reason?:string;command?:string;height_cm?:number;yaw_deg?:number}
export interface RuntimeReport {state?:Partial<PilotDevice>;result?:string;phase?:string;error?:string;events?:FlightEvent[];wire_events?:WireEvent[];frames?:{photo_url?:string;label?:string;sha256?:string}[];assessment?:{summary:string;evidence:string[];limitations:string[]}|null;source?:string}
export interface PilotState {type:'pilot_state';device:PilotDevice;phase:string;error:string;manual_ready:boolean;record:RuntimeReport|null;events:FlightEvent[];wire_events:WireEvent[];limits:{sticks:number;stick_expiry_ms:number;flight_seconds:number;landing_retry_seconds:number}}
export interface ReportItem {name:string;result:string;fault:string;airborne_possible:boolean;source:string;updated_at:number}
export function stickPoint(x:number,y:number):[number,number]{if(!Number.isFinite(x)||!Number.isFinite(y))return [0,0];const length=Math.max(1,Math.hypot(x,y));const a=Math.round(x/length*20),b=Math.round(-y/length*20);return [Math.abs(a)<3?0:a,Math.abs(b)<3?0:b];}
export function reportSummary(report:RuntimeReport){
  const wire=report.wire_events??[],events=report.events??[];
  const start=wire.find(e=>e.direction==='send'&&e.command==='takeoff')?.monotonic;
  const firstOk=start===undefined?undefined:wire.find(e=>e.direction==='receive'&&e.response==='ok'&&e.monotonic>start);
  const fault=events.find(e=>e.event==='fault');
  return {start,firstOkSeconds:start!==undefined&&firstOk?firstOk.monotonic-start:null,
    faultSeconds:start!==undefined&&fault?fault.monotonic-start:null,
    fault:fault?.reason??report.state?.fault??'',yawSent:wire.some(e=>e.command?.startsWith('cw ')||e.command?.startsWith('ccw ')),
    landAttempts:wire.filter(e=>e.direction==='send'&&e.command==='land').length};
}
export function reportPhoto(url:string|undefined){return url&&/^\/photos\/(?:pilot|tt-scan|tt-hover)-[a-f0-9]{32}-\d{2}\.jpg$/.test(url)?'/api'+url:'';}
