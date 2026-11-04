export type MissionStatus = 'idle' | 'searching' | 'investigating' | 'awaiting_verification' | 'paused' | 'completed' | 'aborted' | 'exhausted';
export type ActivityCategory = 'observation' | 'reasoning' | 'action' | 'alert';
export interface Point { x: number; y: number }
export interface Region { id: string; name: string; x: number; y: number; width: number; height: number; kind: 'gallery' | 'hall' | 'storage' | 'office' | 'lobby'; }
export interface Person { id: string; upper: string; lower: string; accessory: string; detail: string; }
export interface Scenario { id: string; name: string; subtitle: string; missionName: string; description: string; environment: string; regions: Region[]; }
export interface Observation { regionId: string; visits: number; inspected: boolean; people: Person[]; summary: string; matchScore: number; elapsed: number; }
export interface Evidence { attribute: string; expected: string; observed: string; matches: boolean; }
export interface Candidate { id: string; regionId: string; person: Person; score: number; evidence: Evidence[]; status: 'pending' | 'rejected' | 'confirmed'; elapsed: number; }
export interface Activity { id: string; category: ActivityCategory; text: string; elapsed: number; regionId?: string; }
export interface MissionState { id: string; name: string; description: string; scenarioId: string; seed: number; status: MissionStatus; previousStatus: MissionStatus | null; elapsed: number; drone: Point; heading: number; battery: number; altitude: number; signal: number; distance: number; currentRegionId: string | null; destinationId: string | null; observations: Record<string, Observation>; candidates: Candidate[]; activeCandidateId: string | null; log: Activity[]; trail: Point[]; speed: 1 | 2 | 4; phaseProgress: number; }
export interface MissionConfig { scenarioId: string; name: string; description: string; seed: number; }
export interface MissionController { state: MissionState; start: (config: MissionConfig) => void; pause: () => void; resume: () => void; abort: () => void; reset: (config?: MissionConfig) => void; setSpeed: (speed: 1 | 2 | 4) => void; confirmCandidate: () => void; rejectCandidate: () => void; }
