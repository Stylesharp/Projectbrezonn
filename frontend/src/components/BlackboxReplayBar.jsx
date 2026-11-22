import React, { useEffect } from 'react';
import { Play, Pause, Radio, History } from 'lucide-react';
import { useTelemetryStore } from '../store/useTelemetryStore';

export function BlackboxReplayBar() {
  const {
    sessionFrames, replayIndex, replayPlaying,
    setReplayIndex, setReplayPlaying, activePanel
  } = useTelemetryStore();

  useEffect(() => {
    if (!replayPlaying || replayIndex === null) return;
    const id = setInterval(() => {
      const st = useTelemetryStore.getState();
      if (st.replayIndex === null) return;
      if (st.replayIndex >= st.sessionFrames.length - 1) {
        st.setReplayPlaying(false);
      } else {
        st.setReplayIndex(st.replayIndex + 1);
      }
    }, 120);
    return () => clearInterval(id);
  }, [replayPlaying, replayIndex]);

  if (sessionFrames.length < 5) return null;
  const isReplaying = replayIndex !== null;
  const currentIdx = isReplaying ? replayIndex : sessionFrames.length - 1;
  const frame = sessionFrames[currentIdx];

  // Show compact replay bar on non-3D tabs or whenever actively scrubbing
  if (activePanel === 1 && !isReplaying) return null;

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[60] glass-pill px-4 py-1.5 flex items-center gap-3 text-[11px] font-mono pointer-events-auto max-w-[92vw]">
      <span className="flex items-center gap-1.5 text-cyan-300 font-bold shrink-0">
        <History size={13} />
        <span className="hidden sm:inline">BLACKBOX</span>
      </span>

      <button
        onClick={() => {
          if (!isReplaying) {
            setReplayIndex(Math.max(0, sessionFrames.length - 40));
            setReplayPlaying(true);
          } else {
            setReplayPlaying(!replayPlaying);
          }
        }}
        className="p-1 rounded-full bg-cyan-400/15 hover:bg-cyan-400/30 text-cyan-200 cursor-pointer"
        title={replayPlaying ? 'Pause Replay' : 'Play Blackbox Replay'}
      >
        {replayPlaying ? <Pause size={12} /> : <Play size={12} />}
      </button>

      <input
        type="range"
        min={0}
        max={Math.max(0, sessionFrames.length - 1)}
        value={currentIdx}
        onChange={(e) => {
          setReplayPlaying(false);
          setReplayIndex(Number(e.target.value));
        }}
        className="w-36 sm:w-56"
      />

      <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
        {currentIdx + 1}/{sessionFrames.length}
        {frame?.timestamp ? ` • ${new Date(frame.timestamp * 1000).toLocaleTimeString()}` : ''}
      </span>

      <button
        onClick={() => setReplayIndex(null)}
        className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0 ${
          isReplaying
            ? 'bg-rose-500/25 border border-rose-400/60 text-rose-200 animate-pulse'
            : 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300'
        }`}
      >
        <Radio size={10} />
        {isReplaying ? 'RETURN LIVE' : 'LIVE'}
      </button>
    </div>
  );
}
