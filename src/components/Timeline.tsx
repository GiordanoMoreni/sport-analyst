// src/components/Timeline.tsx

import React, { useRef, useCallback } from 'react';
import { Annotation, AIEvent, AICoachingTip } from '../types';

interface TimelineProps {
  duration: number;
  currentTime: number;
  annotations: Annotation[];
  aiEvents?: AIEvent[];
  coachingTips?: AICoachingTip[];
  onSeek: (t: number) => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  duration,
  currentTime,
  annotations,
  aiEvents = [],
  coachingTips = [],
  onSeek,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!trackRef.current || !duration) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(pct * duration, duration)));
  }, [duration, onSeek]);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Group annotations by second to avoid visual overlap
  const ticks = annotations.map(a => ({
    id: a.id,
    pct: (a.timestamp / duration) * 100,
    color: a.color,
  }));
  const aiTicks = aiEvents.map(e => ({
    id: e.id,
    pct: (e.timestamp / duration) * 100,
    type: e.type,
  }));
  const tipTicks = coachingTips.map(t => ({
    id: t.id,
    pct: (t.timestamp / duration) * 100,
  }));

  return (
    <div className="timeline-container" ref={trackRef} onClick={handleClick}>
      {/* Progress fill */}
      <div className="timeline-fill" style={{ width: `${pct}%` }} />

      {/* Annotation ticks */}
      {ticks.map(tick => (
        <div
          key={tick.id}
          className="timeline-tick"
          style={{ left: `${tick.pct}%`, background: tick.color }}
          title={`Annotazione a ${Math.floor(tick.pct)}%`}
        />
      ))}
      {aiTicks.map(tick => (
        <div
          key={tick.id}
          className={`timeline-tick ai ${tick.type}`}
          style={{ left: `${tick.pct}%` }}
          title={`AI: ${tick.type}`}
        />
      ))}
      {tipTicks.map(tick => (
        <div
          key={tick.id}
          className="timeline-tick coaching"
          style={{ left: `${tick.pct}%` }}
          title="Coaching tip"
        />
      ))}

      {/* Playhead */}
      <div className="timeline-playhead" style={{ left: `${pct}%` }} />
    </div>
  );
};
