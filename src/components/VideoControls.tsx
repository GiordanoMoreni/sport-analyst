// src/components/VideoControls.tsx

import React from 'react';
import {
  Play, Pause, SkipBack, SkipForward,
  ChevronLeft, ChevronRight, Volume2, VolumeX
} from 'lucide-react';
import { formatTimestamp } from '../utils/export';

interface VideoControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  onTogglePlay: () => void;
  onSeek: (t: number) => void;
  onSeekRelative: (delta: number) => void;
  onStepFrame: (forward: boolean) => void;
  onVolumeChange: (v: number) => void;
  onPlaybackRateChange: (r: number) => void;
}

const RATES = [0.25, 0.5, 1, 1.5, 2];

export const VideoControls: React.FC<VideoControlsProps> = ({
  isPlaying,
  currentTime,
  duration,
  volume,
  playbackRate,
  onTogglePlay,
  onSeek,
  onSeekRelative,
  onStepFrame,
  onVolumeChange,
  onPlaybackRateChange,
}) => {
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="video-controls">
      {/* Seekbar */}
      <div className="seekbar-row">
        <input
          type="range"
          className="seekbar"
          min={0}
          max={duration || 0}
          step={0.033}
          value={currentTime}
          onChange={e => onSeek(parseFloat(e.target.value))}
          style={{ '--pct': `${pct}%` } as React.CSSProperties}
        />
        <span className="time-display">
          {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
        </span>
      </div>

      {/* Buttons row */}
      <div className="controls-row">
        {/* Playback */}
        <div className="controls-group">
          <button className="ctrl-btn" onClick={() => onSeekRelative(-10)} title="-10s">
            <SkipBack size={16} />
          </button>
          <button className="ctrl-btn" onClick={() => onStepFrame(false)} title="Frame indietro">
            <ChevronLeft size={16} />
          </button>
          <button className="ctrl-btn primary" onClick={onTogglePlay} title={isPlaying ? 'Pausa' : 'Play'}>
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button className="ctrl-btn" onClick={() => onStepFrame(true)} title="Frame avanti">
            <ChevronRight size={16} />
          </button>
          <button className="ctrl-btn" onClick={() => onSeekRelative(10)} title="+10s">
            <SkipForward size={16} />
          </button>
        </div>

        {/* Playback rate */}
        <div className="controls-group">
          {RATES.map(r => (
            <button
              key={r}
              className={`rate-btn ${playbackRate === r ? 'active' : ''}`}
              onClick={() => onPlaybackRateChange(r)}
            >
              {r}x
            </button>
          ))}
        </div>

        {/* Volume */}
        <div className="controls-group volume-group">
          <button
            className="ctrl-btn"
            onClick={() => onVolumeChange(volume > 0 ? 0 : 1)}
            title={volume > 0 ? 'Muto' : 'Audio'}
          >
            {volume > 0 ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <input
            type="range"
            className="volume-slider"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={e => onVolumeChange(parseFloat(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
};
