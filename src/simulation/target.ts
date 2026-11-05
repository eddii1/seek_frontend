import type { Evidence, Person } from '../types';

export interface TargetDescription { upper: string | null; lower: string | null; accessory: string | null; }
const colors = '(?:red|blue|black|yellow|green|orange|white|gr[ae]y|navy|purple|brown|beige|tan|pink|lime|teal|olive)';

/** This local demo recognizes visual clothing cues only; it never infers identity. */
export function parseTargetDescription(description: string): TargetDescription {
  const input = description.toLowerCase().replace(/[-–]/g, ' ').replace(/\s+/g, ' ').trim();
  const find = (garments: string) => {
    const expression = new RegExp(`\\b(${colors}\\s+(?:(?:safety|high visibility|hi vis|reflective|work|cargo|dark|light)\\s+)?(?:${garments}))\\b`);
    return input.match(expression)?.[1]?.replace('grey', 'gray') ?? null;
  };
  const result = {
    upper: find('hoodie|jacket|t shirt|shirt|vest|coat|sweater|sweatshirt'),
    lower: find('trousers|pants|jeans|shorts'),
    accessory: find('hard hat|backpack|bag|helmet|cap|hat'),
  };
  if (!result.upper && !result.lower && !result.accessory) {
    throw new Error('Add a color and clothing item, such as “red hoodie and black trousers” or “blue jacket and yellow bag”. This simulation matches visible clothing and accessories.');
  }
  return result;
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/grey/g, 'gray').replace(/pants/g, 'trousers').replace(/\s+/g, ' ').trim();
}

export function compareAttributes(target: TargetDescription, person: Person): Evidence[] {
  return (['upper', 'lower', 'accessory'] as const).flatMap((key) => {
    const expected = target[key];
    if (!expected) return [];
    const observed = person[key];
    return [{ attribute: key === 'upper' ? 'Upper clothing' : key === 'lower' ? 'Lower clothing' : 'Accessory', expected, observed, matches: normalized(expected) === normalized(observed) }];
  });
}

export function matchScore(target: TargetDescription, person: Person): number {
  const evidence = compareAttributes(target, person);
  return evidence.length ? Math.round(100 * evidence.filter((item) => item.matches).length / evidence.length) : 0;
}

export function hasMatchingVisibleAttribute(target: TargetDescription, person: Person): boolean {
  return compareAttributes(target, person).some((item) => item.matches);
}
