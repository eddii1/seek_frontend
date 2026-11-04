import { useCallback, useEffect, useRef, useState } from 'react';
import type { MissionConfig, MissionController, MissionState } from './types';
import { MissionEngine } from './simulation/engine';

export function useMission(): MissionController {
  const engineRef = useRef<MissionEngine | null>(null);
  if (!engineRef.current) engineRef.current = new MissionEngine();
  const [state, setState] = useState<MissionState>(() => engineRef.current!.state);
  const update = useCallback((action: (engine: MissionEngine) => void) => {
    action(engineRef.current!);
    setState(engineRef.current!.state);
  }, []);

  useEffect(() => {
    let lastTick = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = (now - lastTick) / 1000;
      lastTick = now;
      setState(engineRef.current!.tick(delta));
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  return {
    state,
    start: useCallback((config: MissionConfig) => update((engine) => engine.start(config)), [update]),
    pause: useCallback(() => update((engine) => engine.pause()), [update]),
    resume: useCallback(() => update((engine) => engine.resume()), [update]),
    abort: useCallback(() => update((engine) => engine.abort()), [update]),
    reset: useCallback((config?: MissionConfig) => update((engine) => engine.reset(config)), [update]),
    setSpeed: useCallback((speed: 1 | 2 | 4) => update((engine) => engine.setSpeed(speed)), [update]),
    confirmCandidate: useCallback(() => update((engine) => engine.confirmCandidate()), [update]),
    rejectCandidate: useCallback(() => update((engine) => engine.rejectCandidate()), [update]),
  };
}
