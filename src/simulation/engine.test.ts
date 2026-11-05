import assert from 'node:assert/strict';
import test from 'node:test';
import { MissionEngine } from './engine';
import { DEFAULT_CONFIG, SCENARIOS } from './scenarios';
import { chooseNextRegion, planRoute, regionCenter } from './policy';
import { matchScore, parseTargetDescription } from './target';
import { SimulatedWorld } from '../adapters/simulatedWorld';
import type { MissionConfig, Observation } from '../types';

function advance(engine: MissionEngine, until: () => boolean, maximumTicks = 6000): void {
  for (let tick = 0; tick < maximumTicks && !until(); tick++) engine.tick(0.1);
  assert.ok(until(), `Condition not reached; state=${engine.state.status}, time=${engine.state.elapsed}`);
}
function config(index = 0, seed = 13): MissionConfig {
  const scenario = SCENARIOS[index];
  return { scenarioId: scenario.id, name: scenario.missionName, description: scenario.description, seed };
}

test('every scenario reaches operator verification and requires confirmation to complete', () => {
  for (let scenario = 0; scenario < SCENARIOS.length; scenario++) {
    for (const seed of [1, 7, 13, 42, 101]) {
      const engine = new MissionEngine();
      engine.start(config(scenario, seed));
      advance(engine, () => engine.state.status === 'awaiting_verification');
      const candidate = engine.state.candidates.find((item) => item.id === engine.state.activeCandidateId)!;
      assert.equal(candidate.score, 100);
      assert.ok(candidate.evidence.every((item) => item.matches));
      const held = engine.state;
      engine.tick(1);
      assert.equal(engine.state, held, 'Awaiting verification freezes simulated flight');
      engine.confirmCandidate();
      assert.equal(engine.state.status, 'completed');
      assert.equal(engine.state.candidates.find((item) => item.id === candidate.id)?.status, 'confirmed');
      assert.match(engine.state.log.at(-1)!.text, /identity has not been verified/);
    }
  }
});

test('default demonstration investigates and rejects a partial match before the stronger candidate', () => {
  const engine = new MissionEngine();
  engine.start(DEFAULT_CONFIG);
  advance(engine, () => engine.state.status === 'awaiting_verification');
  assert.ok(engine.state.candidates.some((candidate) => candidate.status === 'rejected'));
  assert.equal(engine.state.currentRegionId, 'F');
  assert.ok(engine.state.elapsed > 40 && engine.state.elapsed < 150);
});

test('search policy uses coverage, distance, and revealed observations only', () => {
  const scenario = SCENARIOS[0];
  const position = { x: 460, y: 665 };
  const noObservations = { regions: scenario.regions, observations: {}, position };
  const initialDecision = chooseNextRegion(noObservations);
  assert.equal(initialDecision?.regionId, 'H');
  assert.equal(initialDecision?.action, 'explore');
  // Different hidden target placements cannot alter the identical public decision input.
  const placements = new Set<string>();
  for (const seed of [1, 13, 42]) {
    const target = parseTargetDescription(scenario.description);
    const world = new SimulatedWorld(scenario.regions, target, seed);
    const targetRegion = scenario.regions.find((region) => world.observe(region.id, true).some((person) => matchScore(target, person) === 100));
    placements.add(targetRegion!.id);
    assert.deepEqual(chooseNextRegion(noObservations), initialDecision);
  }
  assert.ok(placements.size > 1);
  const partial: Observation = { regionId: 'H', visits: 1, inspected: false, people: [], summary: 'A red hoodie is visible.', matchScore: 50, elapsed: 5 };
  const context = { regions: scenario.regions, observations: { H: partial }, position: regionCenter(scenario.regions[7]) };
  assert.equal(chooseNextRegion(context)?.action, 'inspect');
  assert.equal(chooseNextRegion(context)?.regionId, 'H');
  partial.inspected = true;
  assert.notEqual(chooseNextRegion(context)?.regionId, 'H');
});

test('initial observations do not reveal hidden lower clothing or accessories', () => {
  const scenario = SCENARIOS[1];
  const world = new SimulatedWorld(scenario.regions, parseTargetDescription(scenario.description), 13);
  const populated = scenario.regions.find((region) => world.observe(region.id, false).length)!;
  const glimpse = world.observe(populated.id, false)[0];
  assert.equal(glimpse.lower, 'not yet visible');
  assert.equal(glimpse.accessory, 'not yet visible');
  const inspected = world.observe(populated.id, true)[0];
  assert.notEqual(inspected.lower, 'not yet visible');
  assert.notEqual(inspected.accessory, 'not yet visible');
  inspected.upper = 'modified outside adapter';
  assert.notEqual(world.observe(populated.id, true)[0].upper, inspected.upper, 'Observations are defensive copies');
});

test('placement seeds reproduce observations and public participant metadata does not reveal scenario roles', () => {
  const scenario = SCENARIOS[0];
  const target = parseTargetDescription(scenario.description);
  const first = new SimulatedWorld(scenario.regions, target, 7);
  const second = new SimulatedWorld(scenario.regions, target, 7);
  const people = scenario.regions.flatMap((region) => {
    assert.deepEqual(first.observe(region.id, true), second.observe(region.id, true));
    return first.observe(region.id, true);
  });
  assert.equal(new Set(people.map((person) => person.detail)).size, 1);
  assert.equal(new Set(people.map((person) => person.id)).size, people.length);
  assert.ok(people.every((person) => !['person-01', 'person-02', 'person-03', 'person-04'].includes(person.id)));
});

test('pause freezes flight and time; resume preserves phase; reset prevents stale progress', () => {
  const engine = new MissionEngine();
  engine.start(DEFAULT_CONFIG);
  for (let tick = 0; tick < 20; tick++) engine.tick(0.1);
  engine.pause();
  const held = engine.state;
  for (let tick = 0; tick < 20; tick++) engine.tick(0.1);
  assert.equal(engine.state, held);
  engine.resume();
  engine.tick(0.1);
  assert.ok(engine.state.elapsed > held.elapsed);
  engine.reset();
  const reset = engine.state;
  engine.tick(0.5);
  assert.equal(engine.state, reset);
  assert.equal(engine.state.status, 'idle');
  assert.equal(Object.keys(engine.state.observations).length, 0);
  assert.equal(engine.state.elapsed, 0);
});

test('operator rejection continues search, never reoffers the rejected candidate, and eventually exhausts coverage', () => {
  const engine = new MissionEngine();
  engine.start(DEFAULT_CONFIG);
  advance(engine, () => engine.state.status === 'awaiting_verification');
  const rejectedId = engine.state.activeCandidateId;
  engine.rejectCandidate();
  assert.equal(engine.state.activeCandidateId, null);
  advance(engine, () => engine.state.status === 'exhausted');
  assert.equal(Object.keys(engine.state.observations).length, 9);
  assert.equal(engine.state.candidates.filter((candidate) => candidate.id === rejectedId).length, 1);
  assert.ok(engine.state.candidates.every((candidate) => candidate.status === 'rejected'));
});

test('closing candidate review pauses it and resume returns to the same evidence without moving', () => {
  const engine = new MissionEngine();
  engine.start(DEFAULT_CONFIG);
  advance(engine, () => engine.state.status === 'awaiting_verification');
  const candidateId = engine.state.activeCandidateId;
  const position = engine.state.drone;
  const elapsed = engine.state.elapsed;
  engine.pause();
  assert.equal(engine.state.status, 'paused');
  assert.equal(engine.state.previousStatus, 'awaiting_verification');
  engine.tick(0.5);
  engine.resume();
  assert.equal(engine.state.status, 'awaiting_verification');
  assert.equal(engine.state.activeCandidateId, candidateId);
  assert.equal(engine.state.drone, position);
  assert.equal(engine.state.elapsed, elapsed);
  engine.confirmCandidate();
  assert.equal(engine.state.status, 'completed');
});

test('abort preserves mission evidence and prevents further flight or accidental confirmation', () => {
  const engine = new MissionEngine();
  engine.start(DEFAULT_CONFIG);
  advance(engine, () => Object.keys(engine.state.observations).length > 0);
  const observations = engine.state.observations;
  engine.abort();
  const aborted = engine.state;
  engine.tick(0.5);
  engine.resume();
  engine.confirmCandidate();
  assert.equal(engine.state, aborted);
  assert.equal(engine.state.observations, observations);
  assert.equal(engine.state.status, 'aborted');
  assert.equal(engine.state.altitude, 0);
});

test('simulation speed scales time and movement while remaining bounded', () => {
  const normal = new MissionEngine();
  const fast = new MissionEngine();
  normal.start(DEFAULT_CONFIG);
  fast.start(DEFAULT_CONFIG);
  fast.setSpeed(4);
  normal.tick(0.1);
  fast.tick(0.1);
  assert.ok(Math.abs(fast.state.elapsed - normal.state.elapsed * 4) < 0.0001);
  assert.ok(Math.abs(fast.state.distance - normal.state.distance * 4) < 0.0001);
  const previous = fast.state.elapsed;
  fast.tick(10000);
  assert.ok(fast.state.elapsed - previous <= 2.00001);
});

test('custom clothing descriptions are honored; unsupported descriptions fail without erasing the mission', () => {
  const engine = new MissionEngine();
  engine.start({ ...DEFAULT_CONFIG, description: 'Find a person in a purple coat and beige trousers with a green backpack.' });
  advance(engine, () => engine.state.status === 'awaiting_verification');
  const candidate = engine.state.candidates.find((item) => item.id === engine.state.activeCandidateId)!;
  assert.equal(candidate.person.upper, 'purple coat');
  assert.equal(candidate.person.lower, 'beige trousers');
  assert.equal(candidate.person.accessory, 'green backpack');
  const current = engine.state;
  assert.throws(() => engine.start({ ...DEFAULT_CONFIG, description: 'Find Alex' }), /color and clothing/);
  assert.equal(engine.state, current);
});

test('accessory-only searches inspect visible people rather than discarding unknown attributes', () => {
  const engine = new MissionEngine();
  engine.start({ ...DEFAULT_CONFIG, description: 'Find a person carrying a yellow bag.' });
  advance(engine, () => engine.state.status === 'awaiting_verification');
  assert.equal(engine.state.candidates.find((item) => item.id === engine.state.activeCandidateId)?.person.accessory, 'yellow bag');
});

test('room-to-room routes use axis-aligned corridor segments and end at the room center', () => {
  const regions = SCENARIOS[0].regions;
  for (const origin of regions) for (const destination of regions) {
    if (origin.id === destination.id) continue;
    const start = regionCenter(origin);
    const route = planRoute(start, origin, destination);
    assert.deepEqual(route.at(-1), regionCenter(destination));
    const complete = [start, ...route];
    for (let index = 1; index < complete.length; index++) {
      assert.ok(complete[index].x === complete[index - 1].x || complete[index].y === complete[index - 1].y);
    }
  }
});
