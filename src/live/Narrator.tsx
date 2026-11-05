import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { url, type Graph } from './api';

/** Reads each new agent decision aloud with Grok Voice TTS (xAI /v1/tts via the backend's /tts). */
export default function Narrator({ graph, found, voice = 'eve', label = 'drone' }:
  { graph: Graph | null; found?: string | null; voice?: string; label?: string }) {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(`narrate-${label}`) !== 'off'; } catch { return true; } });
  const spoken = useRef<Set<string> | null>(null);
  const queue = useRef<string[]>([]);
  const playing = useRef(false);

  const play = async () => {
    if (playing.current) return;
    const text = queue.current.shift();
    if (!text) return;
    playing.current = true;
    try {
      const r = await fetch(url('/tts'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice }), signal: AbortSignal.timeout(20000) });
      if (r.ok) {
        const src = URL.createObjectURL(await r.blob()), audio = new Audio(src);
        await new Promise<void>(done => { audio.onended = audio.onerror = () => done(); audio.play().catch(() => done()); });
        URL.revokeObjectURL(src);
      }
    } catch { /* TTS offline: stay silent, never block the dashboard */ }
    playing.current = false;
    void play();
  };
  const say = (key: string, text: string) => {
    const seen = spoken.current!;
    if (seen.has(key)) return;
    seen.add(key);
    if (!on || !text.trim()) return;
    queue.current = [...queue.current.slice(-1), text.trim().slice(0, 300)]; // never fall far behind the robot
    void play();
  };

  useEffect(() => {
    if (!graph) return;
    const done = graph.steps.flatMap(s => s.nodes.filter(n => n.kind === 'think' && n.status === 'done' && n.reply)
      .map(n => ({ key: `${graph.goal}|${n.id}`, text: String(n.reply?.thought || n.detail || '') })));
    if (spoken.current === null) { spoken.current = new Set(done.map(d => d.key)); return; } // no replay of history
    done.forEach(d => say(d.key, d.text));
  }, [graph]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (found && spoken.current) say(`found|${found}`, `I think I found it. ${found}`);
  }, [found]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    const next = !on; setOn(next);
    try { localStorage.setItem(`narrate-${label}`, next ? 'on' : 'off'); } catch { /* private mode */ }
    if (!next) queue.current = [];
  };
  return <button type="button" className="live-ghost" onClick={toggle}
    title={on ? `Grok Voice reads the ${label}'s steps aloud. Click to mute.` : `Muted. Click to hear the ${label}'s steps.`}>
    {on ? <Volume2 size={12} /> : <VolumeX size={12} />}{on ? 'Voice on' : 'Voice off'}</button>;
}
