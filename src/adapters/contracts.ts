import type { Activity, MissionState, Observation, Person, Point, Region } from '../types';
import type { SearchContext, SearchDecision } from '../simulation/policy';
import type { TargetDescription } from '../simulation/target';

/** Implement through a Python/DJITelloPy service; never connect hardware from this demo. */
export interface DroneAdapter {
  readonly mode: 'simulation' | 'hardware';
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  moveTo(position: Point, signal?: AbortSignal): Promise<void>;
  hold(): Promise<void>;
  land(): Promise<void>;
  onTelemetry(callback: (telemetry: DroneTelemetry) => void): () => void;
}
export interface DroneTelemetry {
  source: 'simulation' | 'hardware'; timestamp: number; position: Point;
  heading: number; altitude: number; battery: number; signal: number;
}
export interface FrameObservation {
  source: 'simulation' | 'camera'; regionId: string;
  people: Person[]; capturedAt: number; summary: string;
}
/** A Grok implementation can replace this boundary without changing the operator UI. */
export interface AnalysisAdapter {
  readonly mode: 'simulation' | 'grok';
  analyzeFrame(input: { frame: Blob; region: Region; target: TargetDescription }, signal?: AbortSignal): Promise<FrameObservation>;
  decideNext(context: SearchContext, signal?: AbortSignal): Promise<SearchDecision | null>;
}
export type MissionEvent =
  | { type: 'telemetry'; payload: DroneTelemetry }
  | { type: 'observation'; payload: Observation }
  | { type: 'activity'; payload: Activity }
  | { type: 'state'; payload: MissionState };
/** A future WebSocket or SSE transport should return an unsubscribe cleanup. */
export interface MissionEventConnection {
  readonly mode: 'simulation' | 'live';
  subscribe(listener: (event: MissionEvent) => void): () => void;
  close(): void;
}
