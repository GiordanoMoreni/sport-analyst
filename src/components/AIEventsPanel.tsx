// src/components/AIEventsPanel.tsx

import React, { useState } from 'react';
import { AIEvent, AICoachingTip } from '../types';
import { formatTimestamp } from '../utils/export';
import { Trash2, ChevronDown, ChevronUp, Zap, Check, X, Sparkles } from 'lucide-react';

interface AIEventsPanelProps {
  events: AIEvent[];
  currentTime: number;
  onJumpTo: (time: number) => void;
  onClear: () => void;
  onFeedback?: (id: string, action: 'confirm' | 'reject') => void;
  onTypeChange?: (id: string, type: AIEvent['type']) => void;
  tips?: AICoachingTip[];
  onTipClear?: () => void;
  metrics?: {
    reactionTimes: { attacker: number; defender: number; ms: number; ts: number }[];
    stance: { id: number; forward: 'L' | 'R' | null; speed: number }[];
    aggressiveness: { id: number; score: number }[];
    distance?: { value: number; avg: number; inMeasure: boolean; threshold: number };
  };
}

const EVENT_LABELS: Record<AIEvent['type'], string> = {
  probable_touch: 'Tocco probabile',
  attack: 'Attacco',
  in_measure: 'In misura',
};

export const AIEventsPanel: React.FC<AIEventsPanelProps> = ({
  events,
  currentTime,
  onJumpTo,
  onClear,
  onFeedback,
  onTypeChange,
  tips,
  onTipClear,
  metrics,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div className="ai-events-panel">
      <div className="panel-header" onClick={() => setCollapsed(c => !c)}>
        <span className="panel-title">
          AI Events <span className="badge">{events.length}</span>
        </span>
        <div className="panel-header-actions">
          <button
            className="icon-btn danger"
            onClick={e => { e.stopPropagation(); onClear(); }}
            title="Svuota eventi AI"
          >
            <Trash2 size={15} />
          </button>
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </div>
      </div>

      {!collapsed && (
        <div className="annotation-list">
          {metrics && (
            <div className="ai-metrics">
              <div className="ai-metric">
                <span>Reazione (ult.):</span>
                <strong>
                  {metrics.reactionTimes.length
                    ? `${Math.round(metrics.reactionTimes[metrics.reactionTimes.length - 1].ms)} ms`
                    : '—'}
                </strong>
              </div>
              <div className="ai-metric">
                <span>Stance:</span>
                <strong>
                  {metrics.stance.map(s => `F${s.id + 1}:${s.forward || '—'}`).join(' | ') || '—'}
                </strong>
              </div>
              <div className="ai-metric">
                <span>Aggressivita:</span>
                <strong>
                  {metrics.aggressiveness.map(a => `F${a.id + 1}:${Math.round(a.score * 100)}%`).join(' | ') || '—'}
                </strong>
              </div>
              <div className="ai-metric">
                <span>Distanza:</span>
                <strong>
                  {metrics.distance
                    ? `${metrics.distance.value.toFixed(2)}${metrics.distance.inMeasure ? ' (in misura)' : ''}`
                    : '—'}
                </strong>
              </div>
            </div>
          )}
          {sorted.length === 0 && (
            <div className="empty-state">
              Nessun evento AI. Attiva l’AI Tracking e riproduci il video.
            </div>
          )}
          {sorted.map(evt => {
            const isActive = Math.abs(currentTime - evt.timestamp) < 0.4;
            const attacker = (evt.meta && typeof evt.meta === 'object' && 'attacker' in evt.meta)
              ? (evt.meta as { attacker?: number }).attacker
              : undefined;
            const color = attacker === 1 ? '#ef4444' : '#3d7fff';
            return (
              <div key={evt.id} className={`annotation-item ${isActive ? 'active' : ''}`}>
                <div className="ann-color-dot" style={{ background: color }} />
                <div className="ann-body">
                  <div className="ann-meta">
                    <span className="ann-type">
                      <Zap size={12} /> {EVENT_LABELS[evt.type]}
                    </span>
                    {evt.status && (
                      <span className={`ai-status-pill ${evt.status}`}>
                        {evt.status === 'confirmed' ? 'OK' : 'FP'}
                      </span>
                    )}
                    <button className="ann-time" onClick={() => onJumpTo(evt.timestamp)}>
                      {formatTimestamp(evt.timestamp)}
                    </button>
                    <span className="ai-confidence">
                      {(evt.confidence * 100).toFixed(0)}%
                    </span>
                    {onTypeChange && (
                      <select
                        className="ai-type-select"
                        value={evt.type}
                        onChange={e => onTypeChange(evt.id, e.target.value as AIEvent['type'])}
                      >
                        {Object.keys(EVENT_LABELS).map(key => (
                          <option key={key} value={key}>{EVENT_LABELS[key as AIEvent['type']]}</option>
                        ))}
                      </select>
                    )}
                    {onFeedback && (
                      <div className="ai-feedback">
                        <button
                          className="icon-btn ai-ok"
                          onClick={() => onFeedback(evt.id, 'confirm')}
                          title="Conferma evento"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          className="icon-btn ai-no"
                          onClick={() => onFeedback(evt.id, 'reject')}
                          title="Falso positivo"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {tips && (
            <div className="ai-coaching">
              <div className="panel-header static">
                <span className="panel-title">
                  Coaching <span className="badge">{tips.length}</span>
                </span>
                <div className="panel-header-actions">
                  {onTipClear && (
                    <button
                      className="icon-btn danger"
                      onClick={onTipClear}
                      title="Svuota coaching"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              {tips.length === 0 && (
                <div className="empty-state">Nessun suggerimento coaching disponibile.</div>
              )}
              {tips.map(tip => (
                <div key={tip.id} className="annotation-item">
                  <div className="ann-color-dot" style={{ background: '#f59e0b' }} />
                  <div className="ann-body">
                    <div className="ann-meta">
                      <span className="ann-type">
                        <Sparkles size={12} /> {tip.type}
                      </span>
                      <button className="ann-time" onClick={() => onJumpTo(tip.timestamp)}>
                        {formatTimestamp(tip.timestamp)}
                      </button>
                      <span className="ai-confidence">
                        {(tip.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="ann-label">{tip.message}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
