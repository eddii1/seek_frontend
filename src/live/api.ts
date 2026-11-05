import { useEffect, useState } from 'react';

/** The SEEK backend (fleet-viewer), reached through the /api proxy in vite.config.ts. */

export type NodeStatus = 'running' | 'waiting' | 'done' | 'refused' | 'rejected' | 'failed';
export interface GraphNode {
  id: string; kind: 'observe' | 'think' | 'check' | 'approve' | 'act' | 'verify' | 'confirm';
  label: string; status: NodeStatus; detail?: string; seen?: string; seconds?: number; model?: string;
  images?: string[]; photo?: string; flown?: number; prompt?: string; reply?: Record<string, unknown>;
  /** While Grok is still answering: the raw text so far, and the fields read from it so far. */
  stream?: string | null; partial?: { seen?: string; thought?: string; action?: string; cell?: string; evidence?: string } | null;
}
export interface GraphStep { step: number; title: string; trace: string; nodes: GraphNode[] }
export interface Graph { goal: string; steps: GraphStep[]; phoenix: string | null; mission?: string; version?: number }

export interface Plan { action: string; label: string; text: string; thought: string; heading?: number | null }
export interface LiveState {
  kind: 'webcam' | 'drone'; mode: 'manual' | 'agent'; running: boolean; goal: string; status: string;
  confirm: { cell: string; evidence: string; photo: string } | null;
  plan: Plan | null; waiting: boolean; approve_each: boolean;
  height_waiting?: boolean; busy?: boolean;
  manual_status?: string;
  instruction: string | null; progress: string | null;
  pose: { x: number; y: number; z: number; yaw: number }; battery: number | null;
  log: { t: number; cmd: string; reply: string }[];
}
export interface Scene {
  rover?: { x: number; y: number; z: number; yaw: number } | null;
  rover_trail?: [number, number][];
  points: number[][]; pose: { x: number; y: number; z: number; yaw: number };
  state: { drone_cell: string; frames_used: number; cells: { free: number; obstacle: number; unknown: number };
    camera_view?: { x: number; y: number; cell: string; lookahead_m: number } };
  grid: number[][]; n: number; half: number; cell: number; visited: string[];
  plan: { action: string; label: string; heading: number | null; path: number[][]; route?: number[][] } | null;
}

export const url = (path: string) => `/api${path}`;

export async function get<T>(path: string): Promise<T> {
  const r = await fetch(url(path), { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

export async function post<T = unknown>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(url(path), {
    method: 'POST', signal: AbortSignal.timeout(5000),
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { detail?: string }).detail || `${path}: ${r.status}`);
  return j as T;
}

/** Poll an endpoint every `ms`, never overlapping; the next poll starts after the last one answered. */
export function usePoll<T>(path: string, ms: number): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true, timer = 0;
    const tick = async () => {
      try { const d = await get<T>(path); if (alive) setData(d); } catch { /* backend down: keep the last data */ }
      if (alive) timer = window.setTimeout(tick, ms);
    };
    void tick();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [path, ms]);
  return data;
}

/** Stream live updates, with an initial snapshot and polling fallback if the stream stalls/reconnects. */
export function useStream<T>(path: string, snapshotPath?: string): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true, revision = 0, lastMessage = 0, timer = 0;
    const es = new EventSource(url(path));
    es.onmessage = e => {
      try { const next = JSON.parse(e.data) as T; revision++; lastMessage = Date.now(); if (alive) setData(next); }
      catch { /* malformed message: the snapshot will recover it */ }
    };
    const refresh = async () => {
      const before = revision;
      if (snapshotPath && Date.now() - lastMessage > 1500) {
        try { const next = await get<T>(snapshotPath); if (alive && revision === before) setData(next); }
        catch { /* backend down: keep the last graph */ }
      }
      if (alive && snapshotPath) timer = window.setTimeout(refresh, 2000);
    };
    void refresh();
    return () => { alive = false; window.clearTimeout(timer); es.close(); };
  }, [path, snapshotPath]);
  return data;
}
