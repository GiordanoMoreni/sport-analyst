// src/components/AIEventsPanel.tsx

import React, { useState } from 'react';
import { AIEvent } from '../types';
import { formatTimestamp } from '../utils/export';
import { Trash2, ChevronDown, ChevronUp, Zap } from 'lucide-react';

interface AIEventsPanelProps {
  events: AIEvent[];
  currentTime: number;
  onJumpTo: (time: number) => void;
  onClear: () => void;
}

const EVENT_LABELS: Record<AIEvent['type'], string> = {
  probable_touch: 'Tocco probabile',
  attack: 'Attacco',
};

export const AIEventsPanel: React.FC<AIEventsPanelProps> = ({
  events,
  currentTime,
  onJumpTo,
  onClear,
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
                    <button className="ann-time" onClick={() => onJumpTo(evt.timestamp)}>
                      {formatTimestamp(evt.timestamp)}
                    </button>
                    <span className="ai-confidence">
                      {(evt.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
