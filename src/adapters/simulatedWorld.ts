import type { Person, Region } from '../types';
import type { TargetDescription } from '../simulation/target';

function randomGenerator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ground truth is isolated inside this adapter. Only observe() reveals local evidence. */
export class SimulatedWorld {
  readonly mode = 'simulation' as const;
  #occupants = new Map<string, Person[]>();

  constructor(regions: Region[], target: TargetDescription, seed: number) {
    const random = randomGenerator(seed);
    const shuffled = regions.map((region) => region.id);
    for (let index = shuffled.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    const base: Person = { id: 'person-01', upper: target.upper ?? 'gray jacket', lower: target.lower ?? 'black trousers', accessory: target.accessory ?? 'none observed', detail: 'Consenting role-play participant; appearance only, identity unverified.' };
    const different = (value: string, alternate: string) => value === alternate ? 'green jacket' : alternate;
    const requested = (['upper', 'lower', 'accessory'] as const).filter((key) => target[key]);
    const partial = { ...base, id: 'person-02', detail: 'Simulated individual with partially overlapping clothing.' };
    const mismatch = requested.length > 1 ? requested[requested.length - 1] : requested[0];
    partial[mismatch] = mismatch === 'lower' ? (base.lower.includes('blue') ? 'gray trousers' : 'blue jeans') : mismatch === 'accessory' ? (base.accessory.includes('yellow') ? 'black bag' : 'yellow cap') : different(base.upper, 'blue jacket');
    const secondPartial = { ...base, id: 'person-03', upper: different(base.upper, 'gray jacket'), detail: 'Simulated individual; partial cues require inspection.' };
    if (!target.upper) secondPartial[requested[0]] = requested[0] === 'lower' ? 'beige shorts' : 'purple backpack';
    const unrelated: Person = { id: 'person-04', upper: 'green sweater', lower: 'beige trousers', accessory: 'black backpack', detail: 'Simulated visitor with nonmatching attributes.' };
    [base, partial, secondPartial, unrelated].forEach((person, index) => {
      // Public IDs and descriptions must not identify a participant's hidden scenario role.
      const visiblePerson = { ...person, id: `person-${Math.floor(random() * 900000) + 100000}`, detail: 'Simulated participant. Appearance observed; personal identity unverified.' };
      this.#occupants.set(shuffled[index], [visiblePerson]);
    });
  }

  observe(regionId: string, closeInspection: boolean): Person[] {
    return (this.#occupants.get(regionId) ?? []).map((person) => closeInspection ? { ...person } : {
      ...person,
      lower: 'not yet visible',
      accessory: 'not yet visible',
      detail: 'Initial distant observation. Lower clothing and accessories require a closer view.',
    });
  }
}
