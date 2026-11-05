import type { MissionConfig, Region, Scenario } from '../types';

const floorplan: Omit<Region, 'name' | 'kind'>[] = [
  { id: 'A', x: 100, y: 100, width: 190, height: 145 },
  { id: 'B', x: 330, y: 100, width: 260, height: 145 },
  { id: 'C', x: 630, y: 100, width: 190, height: 145 },
  { id: 'D', x: 100, y: 285, width: 190, height: 180 },
  { id: 'E', x: 330, y: 285, width: 260, height: 180 },
  { id: 'F', x: 630, y: 285, width: 190, height: 180 },
  { id: 'G', x: 100, y: 505, width: 190, height: 135 },
  { id: 'H', x: 330, y: 505, width: 260, height: 135 },
  { id: 'I', x: 630, y: 505, width: 190, height: 135 },
];

function rooms(names: string[], kinds: Region['kind'][]): Region[] {
  return floorplan.map((region, index) => ({ ...region, name: names[index], kind: kinds[index] }));
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'museum', name: 'Museum Search', subtitle: 'The Meridian Museum', missionName: 'Operation Red Thread',
    description: 'Find someone wearing a red hoodie and black trousers.',
    environment: 'MERIDIAN MUSEUM · GROUND FLOOR',
    regions: rooms(['Sculpture Gallery', 'Grand Gallery', 'East Collection', 'West Gallery', 'Central Atrium', 'Modern Art', 'Archive Room', 'Entrance Hall', 'Museum Shop'], ['gallery', 'gallery', 'gallery', 'gallery', 'hall', 'gallery', 'storage', 'lobby', 'office']),
  },
  {
    id: 'visitor', name: 'Missing Visitor', subtitle: 'Northstar Convention Center', missionName: 'Operation Northstar',
    description: 'Find someone wearing a blue jacket and carrying a yellow bag.',
    environment: 'NORTHSTAR CENTER · LEVEL 01',
    regions: rooms(['Conference A', 'Exhibition Hall', 'Quiet Room', 'Meeting Rooms', 'Central Concourse', 'Visitor Lounge', 'Information Desk', 'South Entrance', 'Café'], ['office', 'hall', 'office', 'office', 'hall', 'lobby', 'office', 'lobby', 'hall']),
  },
  {
    id: 'warehouse', name: 'Warehouse Inspection', subtitle: 'Atlas Logistics Facility', missionName: 'Operation Atlas',
    description: 'Find an authorized worker wearing an orange safety vest, navy trousers and a white hard hat.',
    environment: 'ATLAS LOGISTICS · FACILITY 04',
    regions: rooms(['Storage A', 'High Bay Storage', 'Packing Area', 'Loading Bay', 'Sorting Floor', 'Equipment Room', 'Supervisor Office', 'Receiving Bay', 'Safety Station'], ['storage', 'storage', 'storage', 'hall', 'hall', 'storage', 'office', 'lobby', 'office']),
  },
];

export function getScenario(id: string): Scenario {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? SCENARIOS[0];
}

export const DEFAULT_CONFIG: MissionConfig = {
  scenarioId: SCENARIOS[0].id, name: SCENARIOS[0].missionName,
  description: SCENARIOS[0].description, seed: 7,
};
