import type { Observation, Point, Region } from '../types';

export interface SearchContext {
  regions: readonly Region[];
  observations: Readonly<Record<string, Observation>>;
  position: Readonly<Point>;
}
export interface SearchDecision { regionId: string; action: 'explore' | 'inspect'; summary: string; }

export function regionCenter(region: Region): Point {
  return { x: region.x + region.width / 2, y: region.y + region.height / 2 };
}

/** The policy deliberately has no world, target placement, person identity, or hidden seed input. */
export function chooseNextRegion(context: SearchContext): SearchDecision | null {
  const ranked = context.regions.flatMap((region) => {
    const observation = context.observations[region.id];
    if (observation?.inspected) return [];
    const center = regionCenter(region);
    const distance = Math.hypot(center.x - context.position.x, center.y - context.position.y);
    // A recorded partial clothing match warrants a closer look before further exploration.
    const priority = observation ? 175 + observation.matchScore * 0.4 : 100;
    const score = priority - distance * 0.08;
    return [{ region, observation, score }];
  }).sort((a, b) => b.score - a.score || a.region.id.localeCompare(b.region.id));
  const next = ranked[0];
  if (!next) return null;
  return {
    regionId: next.region.id,
    action: next.observation ? 'inspect' : 'explore',
    summary: next.observation
      ? `A visible clothing cue in Sector ${next.region.id} overlaps the objective. A closer observation can resolve the remaining attributes.`
      : `Sector ${next.region.id} is unobserved and nearby. Prioritizing new coverage while minimizing transit distance.`,
  };
}

/** All planned movement follows the fictional corridor network and room doorways. */
export function planRoute(position: Point, currentRegion: Region | undefined, destination: Region): Point[] {
  const points: Point[] = [];
  const center = regionCenter(destination);
  const corridorY = destination.y >= 505 ? 485 : 265;
  let start = { ...position };
  if (currentRegion) {
    const origin = regionCenter(currentRegion);
    const exitY = currentRegion.y >= 505 ? 485 : 265;
    points.push({ x: origin.x, y: exitY });
    start = { x: origin.x, y: exitY };
  } else if (position.y > 640) {
    // The launch pad is outside the south boundary; approach via the side corridor.
    points.push({ x: 610, y: 665 }, { x: 610, y: 485 });
    start = { x: 610, y: 485 };
  }
  if (start.y !== corridorY) {
    const leftCost = Math.abs(start.x - 310) + Math.abs(center.x - 310);
    const rightCost = Math.abs(start.x - 610) + Math.abs(center.x - 610);
    const junction = leftCost <= rightCost ? 310 : 610;
    points.push({ x: junction, y: start.y }, { x: junction, y: corridorY });
  }
  points.push({ x: center.x, y: corridorY }, center);
  return points.filter((point, index, all) => {
    const previous = index ? all[index - 1] : position;
    return Math.hypot(point.x - previous.x, point.y - previous.y) > 0.1;
  });
}
