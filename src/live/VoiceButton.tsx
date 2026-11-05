import { useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { url } from './api';
import './voice.css';

/** Mic toggle: records, sends the clip to Grok Voice speech-to-text (backend /stt -> xAI /v1/stt), hands back the text. */
export default function VoiceButton({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const [phase, setPhase] = useState<'idle' | 'rec' | 'busy'>('idle');
  const [error, setError] = useState('');
  const rec = useRef<MediaRecorder | null>(null);

  const start = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const r = new MediaRecorder(stream);
      r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      r.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setPhase('busy');
        try {
          const res = await fetch(url('/stt'), { method: 'POST', headers: { 'Content-Type': r.mimeType || 'audio/webm' }, body: new Blob(chunks, { type: r.mimeType }) });
          const body = await res.json().catch(() => ({}));
          if (res.status >= 502) throw new Error(body.detail || 'Grok voice unavailable: is the drone server (fleet-viewer) running?');
          if (!res.ok) throw new Error(body.detail || body.error || res.statusText);
          if (body.text) onText(body.text); else setError('Heard nothing');
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
        setPhase('idle');
      };
      r.start();
      rec.current = r;
      setPhase('rec');
    } catch {
      setError('Microphone blocked');
    }
  };

  const click = () => { if (phase === 'rec') rec.current?.stop(); else if (phase === 'idle') void start(); };
  const title = error || (phase === 'rec' ? 'Listening… click to stop' : phase === 'busy' ? 'Transcribing…' : 'Speak the goal (Grok Voice)');

  return <button type="button" className={`voice-btn ${phase} ${error ? 'err' : ''}`} onClick={click}
    disabled={disabled || phase === 'busy'} title={title} aria-label={title}>
    {phase === 'busy' ? <Loader2 size={14} className="voice-spin" /> : phase === 'rec' ? <Square size={11} fill="currentColor" /> : <Mic size={14} />}
  </button>;
}
