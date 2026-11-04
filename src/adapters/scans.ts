export interface ScanDecision {action:'look'|'goto'|'finish';heading:number;cell:string;reason:string;observation:string}
export interface ScanJob {
  id:string;device_id:string;goal:string;status:'running'|'completed'|'cancelled'|'failed'|'budget_exhausted';phase:string;
  model:string;source:'simulation';depth_source:string;pose_source:string;created_at:number;finished_at:number|null;
  pose:{x:number;y:number;z:number;yaw:number};moves:number;headings_seen:number[];visited:string[];landed:boolean;
  error:string|null;stop_reason:string|null;map_updated_at:number|null;
  decisions:{turn:number;decision:ScanDecision;at:number;result:string;pose?:ScanJob['pose']}[];
  map:{cell_m:number;half_m:number;size:number;grid:number[][];counts:{unknown:number;free:number;obstacle:number};frames_used:number;points:number[][];trail:number[][]};
}
