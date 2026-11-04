export interface DeviceState {
  id: string; kind: string; connected: boolean; flying: boolean; battery_pct: number;
  height_cm: number; yaw_deg: number; simulated?: boolean; fault?: string; airborne_possible?: boolean;
  connection_state?: string; video_ready?: boolean; forward_range?: RangeReading; expansion_version?: string|null;
}
export interface RangeReading {status:'valid'|'out_of_range'|'unavailable'|'invalid'|'stale'; distance_mm:number|null;
  sampled_at?:number; raw_response?:string|null; raw_value_mm?:number|null; reason?:string; ignored_responses?:string[]}
export interface CaptureJob {
  id: string; status: 'analyzing' | 'completed' | 'failed' | 'cancelled'; device_id: string;
  description: string; source: 'real' | 'simulation'; photo_url: string; captured_at: number;
  sha256: string; width: number; height: number; model: string; position: null;
  created_at: number; finished_at?: number;
  telemetry: DeviceState; error: string | null;
  forward_range: RangeReading;
  assessment: null | {match_status: 'match' | 'no_match' | 'uncertain'; summary: string; evidence: string[]; limitations: string[]};
}
export interface BackendHealth {agent: string; agent_ready: boolean; model: string | null; mode: string; message: string}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  if (!response.ok) {
    let message = `Backend request failed (${response.status})`;
    try { const body = await response.json(); if (typeof body.detail === 'string') message = body.detail; } catch { /* response may not be JSON */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}
export function photoUrl(job: CaptureJob): string {
  if (!/^\/photos\/[a-f0-9]+\.jpg$/.test(job.photo_url)) throw new Error('Invalid capture image URL');
  return `/api${job.photo_url}`;
}
export function savedCaptureId(search: string): string | null {
  const id=new URLSearchParams(search).get('capture');
  return id && /^[a-f0-9]{32}$/.test(id) ? id : null;
}
