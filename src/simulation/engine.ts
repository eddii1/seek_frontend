import type { ActivityCategory, Candidate, MissionConfig, MissionState, Point } from '../types';
import { SimulatedWorld } from '../adapters/simulatedWorld';
import { DEFAULT_CONFIG, getScenario } from './scenarios';
import { chooseNextRegion, planRoute } from './policy';
import { compareAttributes, hasMatchingVisibleAttribute, matchScore, parseTargetDescription, type TargetDescription } from './target';

const RUNNING = new Set(['searching', 'investigating']);
const SURVEY_DURATION = 3.8;
const INSPECTION_DURATION = 3.4;
const TRAVEL_SPEED = 100;
let missionSequence = 0;

export function initialState(config: MissionConfig = DEFAULT_CONFIG): MissionState {
  return {
    id: `SK-${String(++missionSequence).padStart(4, '0')}`,
    name: config.name.trim() || getScenario(config.scenarioId).missionName,
    description: config.description,
    scenarioId: config.scenarioId, seed: config.seed,
    status: 'idle', previousStatus: null, elapsed: 0,
    drone: { x: 460, y: 665 }, heading: 0, battery: 98,
    altitude: 0, signal: 98, distance: 0,
    currentRegionId: null, destinationId: null,
    observations: {}, candidates: [], activeCandidateId: null,
    log: [{ id: 'ready', category: 'action', text: 'Simulation ready. Configure a visual objective to begin autonomous exploration.', elapsed: 0 }],
    trail: [{ x: 460, y: 665 }], speed: 1, phaseProgress: 0,
  };
}

/** Framework-independent mission state machine. A tick consumes simulated seconds. */
export class MissionEngine {
  #state: MissionState;
  #world: SimulatedWorld | null = null;
  #target: TargetDescription | null = null;
  #waypoints: Point[] = [];
  #phase: 'travel' | 'survey' | 'inspect' = 'travel';
  #phaseElapsed = 0;
  #eventSequence = 0;

  constructor(config: MissionConfig = DEFAULT_CONFIG) { this.#state = initialState(config); }
  get state(): MissionState { return this.#state; }

  #update(patch: Partial<MissionState>): void { this.#state = { ...this.#state, ...patch }; }
  #log(category: ActivityCategory, text: string, regionId?: string): void {
    this.#update({ log: [...this.#state.log, { id: `${this.#state.id}-${++this.#eventSequence}`, category, text, elapsed: this.#state.elapsed, regionId }] });
  }

  start(config: MissionConfig): void {
    // Validation occurs before clearing the previous mission, so invalid input is nondestructive.
    const target = parseTargetDescription(config.description);
    const scenario = getScenario(config.scenarioId);
    const speed = this.#state.speed;
    this.reset({ ...config, scenarioId: scenario.id });
    this.#target = target;
    this.#world = new SimulatedWorld(scenario.regions, target, config.seed);
    this.#update({ status: 'searching', speed, altitude: 1.6, log: [] });
    this.#log('action', `Mission initialized at ${scenario.subtitle}. Launching simulated SEEK-01.`);
    this.#log('observation', `Visual objective: ${config.description.trim()}`);
    this.#log('reasoning', `Recognized appearance cues: ${[target.upper, target.lower, target.accessory].filter(Boolean).join('; ')}. The local simulation evaluates these cues only.`);
    this.#log('reasoning', 'Local agent simulation active. Decisions use revealed observations and coverage; participant locations are unknown to the search policy.');
    this.#selectNext();
  }

  reset(config?: MissionConfig): void {
    const previous = this.#state;
    this.#state = initialState(config ?? {
      scenarioId: previous.scenarioId, name: previous.name,
      description: previous.description, seed: previous.seed,
    });
    this.#world = null;
    this.#target = null;
    this.#waypoints = [];
    this.#phase = 'travel';
    this.#phaseElapsed = 0;
    this.#eventSequence = 0;
  }

  pause(): void {
    if (!RUNNING.has(this.#state.status) && this.#state.status !== 'awaiting_verification') return;
    this.#update({ previousStatus: this.#state.status, status: 'paused' });
    this.#log('action', 'Operator paused the mission. Position and observations are held.');
  }

  resume(): void {
    if (this.#state.status !== 'paused') return;
    const previous = this.#state.previousStatus;
    const status = previous === 'investigating' || previous === 'awaiting_verification' ? previous : 'searching';
    this.#update({ status, previousStatus: null });
    this.#log('action', status === 'awaiting_verification' ? 'Operator resumed candidate review. Flight remains held pending a decision.' : 'Operator resumed autonomous search.');
  }

  abort(): void {
    if (!['searching', 'investigating', 'paused', 'awaiting_verification'].includes(this.#state.status)) return;
    this.#update({ status: 'aborted', previousStatus: null, altitude: 0, destinationId: null, activeCandidateId: null });
    this.#waypoints = [];
    this.#log('alert', 'Mission aborted by operator. Simulated vehicle is safe; recorded observations remain available.');
  }

  setSpeed(speed: 1 | 2 | 4): void {
    if ([1, 2, 4].includes(speed)) this.#update({ speed });
  }

  confirmCandidate(): void {
    if (this.#state.status !== 'awaiting_verification' || !this.#state.activeCandidateId) return;
    const candidate = this.#state.candidates.find((item) => item.id === this.#state.activeCandidateId);
    if (!candidate) return;
    this.#update({ status: 'completed', destinationId: null, phaseProgress: 1,
      candidates: this.#state.candidates.map((item) => item.id === candidate.id ? { ...item, status: 'confirmed' } : item) });
    this.#log('alert', `Operator accepted the appearance match in Sector ${candidate.regionId}. Mission complete; personal identity has not been verified.`, candidate.regionId);
  }

  rejectCandidate(): void {
    if (this.#state.status !== 'awaiting_verification' || !this.#state.activeCandidateId) return;
    const candidate = this.#state.candidates.find((item) => item.id === this.#state.activeCandidateId);
    if (!candidate) return;
    this.#update({ status: 'searching', activeCandidateId: null,
      candidates: this.#state.candidates.map((item) => item.id === candidate.id ? { ...item, status: 'rejected' } : item) });
    this.#log('action', `Operator rejected the candidate in Sector ${candidate.regionId}. Continuing with the remaining unexplored regions.`, candidate.regionId);
    this.#selectNext();
  }

  tick(realSeconds: number): MissionState {
    if (!RUNNING.has(this.#state.status) || !Number.isFinite(realSeconds) || realSeconds <= 0) return this.#state;
    // Bound catch-up after a hidden tab; an old timer never advances an entire mission at once.
    let remaining = Math.min(realSeconds, 0.5) * this.#state.speed;
    while (remaining > 0.00001 && RUNNING.has(this.#state.status)) {
      const step = Math.min(remaining, 0.1);
      this.#step(step);
      remaining -= step;
    }
    return this.#state;
  }

  #selectNext(): void {
    const scenario = getScenario(this.#state.scenarioId);
    const decision = chooseNextRegion({ regions: scenario.regions, observations: this.#state.observations, position: this.#state.drone });
    if (!decision) {
      this.#update({ status: 'exhausted', destinationId: null, phaseProgress: 1 });
      this.#log('alert', 'All sectors have been inspected. No remaining candidate meets the objective. Adjust the description or start a new placement.');
      return;
    }
    this.#phaseElapsed = 0;
    this.#update({ destinationId: decision.regionId, phaseProgress: 0 });
    this.#log('reasoning', decision.summary, decision.regionId);
    if (decision.action === 'inspect' && decision.regionId === this.#state.currentRegionId) {
      this.#phase = 'inspect';
      this.#update({ status: 'investigating' });
      this.#log('action', `Holding position for a closer inspection of Sector ${decision.regionId}.`, decision.regionId);
    } else {
      this.#phase = 'travel';
      const destination = scenario.regions.find((region) => region.id === decision.regionId)!;
      const current = scenario.regions.find((region) => region.id === this.#state.currentRegionId);
      this.#waypoints = planRoute(this.#state.drone, current, destination);
      this.#update({ status: 'searching' });
      this.#log('action', `Navigating to Sector ${decision.regionId} · ${destination.name}.`, decision.regionId);
    }
  }

  #step(seconds: number): void {
    const elapsed = this.#state.elapsed + seconds;
    this.#update({ elapsed, battery: Math.max(12, 98 - elapsed * 0.045), altitude: 1.8 + Math.sin(elapsed * 0.5) * 0.025,
      signal: Math.round(97 + Math.sin(elapsed * 0.18) * 2) });
    if (this.#phase === 'travel') {
      this.#move(seconds);
      return;
    }
    this.#phaseElapsed += seconds;
    const duration = this.#phase === 'inspect' ? INSPECTION_DURATION : SURVEY_DURATION;
    this.#update({ phaseProgress: Math.min(1, this.#phaseElapsed / duration) });
    if (this.#phaseElapsed >= duration) this.#observe(this.#phase === 'inspect');
  }

  #move(seconds: number): void {
    const waypoint = this.#waypoints[0];
    if (!waypoint) {
      this.#phase = this.#state.observations[this.#state.destinationId!]?.inspected === false ? 'inspect' : 'survey';
      this.#phaseElapsed = 0;
      this.#update({ currentRegionId: this.#state.destinationId, status: this.#phase === 'inspect' ? 'investigating' : 'searching', phaseProgress: 0 });
      this.#log('action', `Inspecting Sector ${this.#state.currentRegionId}. Sweeping visible surfaces and clothing cues.`, this.#state.currentRegionId!);
      return;
    }
    const dx = waypoint.x - this.#state.drone.x;
    const dy = waypoint.y - this.#state.drone.y;
    const distance = Math.hypot(dx, dy);
    const travel = Math.min(distance, TRAVEL_SPEED * seconds);
    const ratio = distance > 0 ? travel / distance : 1;
    const drone = { x: this.#state.drone.x + dx * ratio, y: this.#state.drone.y + dy * ratio };
    const lastTrail = this.#state.trail[this.#state.trail.length - 1];
    const appendTrail = Math.hypot(drone.x - lastTrail.x, drone.y - lastTrail.y) >= 8 || travel === distance;
    this.#update({ drone, heading: (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360,
      distance: this.#state.distance + travel * 0.05,
      trail: appendTrail ? [...this.#state.trail, drone] : this.#state.trail });
    if (travel >= distance) this.#waypoints.shift();
  }

  #observe(closeInspection: boolean): void {
    if (!this.#world || !this.#target || !this.#state.currentRegionId) return;
    const regionId = this.#state.currentRegionId;
    const people = this.#world.observe(regionId, closeInspection);
    const score = people.reduce((best, person) => Math.max(best, matchScore(this.#target!, person)), 0);
    const possible = !closeInspection && people.some((person) => hasMatchingVisibleAttribute(this.#target!, person) || !this.#target!.upper);
    const previous = this.#state.observations[regionId];
    let summary = people.length === 0 ? 'No people visible. No matching visual attributes detected.'
      : closeInspection ? `Closer observation: ${people.map((person) => [person.upper, person.lower, person.accessory].filter((attribute) => attribute !== 'none observed').join(', ')).join('; ')}.`
        : `Person observed wearing ${people[0].upper}. Lower clothing and accessories are not yet visible.`;
    if (!possible && !closeInspection && people.length) summary += ' Visible upper clothing does not match the objective.';
    this.#update({ observations: { ...this.#state.observations, [regionId]: {
      regionId, visits: (previous?.visits ?? 0) + 1, inspected: !possible,
      people, summary, matchScore: score, elapsed: this.#state.elapsed,
    } } });
    this.#log('observation', summary, regionId);
    if (possible) {
      this.#log('alert', `Possible clothing overlap in Sector ${regionId}. Additional observation required before presenting a candidate.`, regionId);
      this.#selectNext();
      return;
    }
    if (closeInspection && people.length) {
      const person = [...people].sort((a, b) => matchScore(this.#target!, b) - matchScore(this.#target!, a))[0];
      const evidence = compareAttributes(this.#target, person);
      const accepted = evidence.every((item) => item.matches);
      const candidate: Candidate = { id: `candidate-${regionId}-${person.id}`, regionId, person, score, evidence,
        status: accepted ? 'pending' : 'rejected', elapsed: this.#state.elapsed };
      this.#update({ candidates: [...this.#state.candidates, candidate] });
      if (accepted) {
        this.#update({ status: 'awaiting_verification', activeCandidateId: candidate.id, phaseProgress: 1 });
        this.#log('alert', `Potential target located in Sector ${regionId}. ${evidence.length} of ${evidence.length} requested appearance cues observed. Awaiting operator verification; identity remains unverified.`, regionId);
        return;
      }
      const mismatched = evidence.filter((item) => !item.matches).map((item) => item.observed).join(', ');
      this.#log('reasoning', `Partial match ruled out after inspection: observed ${mismatched}. Continuing the search.`, regionId);
    }
    this.#selectNext();
  }
}
