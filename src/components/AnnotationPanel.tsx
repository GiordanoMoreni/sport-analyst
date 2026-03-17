// src/components/AnnotationPanel.tsx

import React, { useState } from 'react';
import { Annotation } from '../types';
import { formatTimestamp } from '../utils/export';
import { Trash2, ChevronDown, ChevronUp, Bookmark } from 'lucide-react';

interface AnnotationPanelProps {
  annotations: Annotation[];
  currentTime: number;
  defaultDuration: number;
  onJumpTo: (time: number) => void;
  onDelete: (id: string) => void;
  onUpdateLabel: (id: string, label: string) => void;
  onUpdateDuration: (id: string, duration: number) => void;
  onDefaultDurationChange: (duration: number) => void;
  onAddCurrentAsKeyFrame: () => void;
}

const TOOL_LABELS: Record<string, string> = {
  arrow: '→ Freccia',
  circle: '○ Cerchio',
  rectangle: '□ Rettangolo',
  freehand: '✏ Disegno',
  text: 'T Testo',
  spotlight: '✦ Spotlight',
  select: '◻ Oggetto',
};

export const AnnotationPanel: React.FC<AnnotationPanelProps> = ({
  annotations,
  currentTime,
  defaultDuration,
  onJumpTo,
  onDelete,
  onUpdateLabel,
  onUpdateDuration,
  onDefaultDurationChange,
  onAddCurrentAsKeyFrame,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const sorted = [...annotations].sort((a, b) => a.timestamp - b.timestamp);

  const startEdit = (ann: Annotation) => {
    setEditingId(ann.id);
    setEditValue(ann.label || '');
  };

  const commitEdit = (id: string) => {
    onUpdateLabel(id, editValue);
    setEditingId(null);
  };

  return (
    <div className="annotation-panel">
      <div className="panel-header" onClick={() => setCollapsed(c => !c)}>
        <span className="panel-title">
          Annotazioni <span className="badge">{annotations.length}</span>
        </span>
        <div className="panel-header-actions">
          <div className="duration-default">
            <span>Durata</span>
            <select
              className="duration-select"
              value={defaultDuration}
              onClick={e => e.stopPropagation()}
              onChange={e => onDefaultDurationChange(parseFloat(e.target.value))}
              title="Durata annotazioni (default)"
            >
              {[1, 2, 3, 4, 5, 8, 10].map(s => (
                <option key={s} value={s}>{s}s</option>
              ))}
            </select>
          </div>
          <button
            className="icon-btn"
            onClick={e => { e.stopPropagation(); onAddCurrentAsKeyFrame(); }}
            title="Segna frame corrente come keyframe"
          >
            <Bookmark size={15} />
          </button>
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </div>
      </div>

      {!collapsed && (
        <div className="annotation-list">
          {sorted.length === 0 && (
            <div className="empty-state">
              Nessuna annotazione. Pausa il video e disegna sul canvas.
            </div>
          )}
          {sorted.map(ann => {
            const isActive = currentTime >= ann.timestamp && currentTime <= ann.timestamp + (ann.duration || 3);
            const endTime = ann.timestamp + (ann.duration || 0);
            const remaining = Math.max(0, endTime - currentTime);
            const remainingPct = ann.duration > 0 ? Math.max(0, Math.min(1, remaining / ann.duration)) : 0;
            const isFading = isActive && remaining <= 0.75;
            return (
              <div
                key={ann.id}
                className={`annotation-item ${isActive ? 'active' : ''} ${isFading ? 'fading' : ''}`}
              >
                <div
                  className="ann-color-dot"
                  style={{ background: ann.color }}
                />
                <div className="ann-body">
                  <div className="ann-meta">
                    <span className="ann-type">{TOOL_LABELS[ann.toolType] || ann.toolType}</span>
                    <button
                      className="ann-time"
                      onClick={() => onJumpTo(ann.timestamp)}
                    >
                      {formatTimestamp(ann.timestamp)}
                    </button>
                    <div className="ann-duration">
                      <input
                        className="ann-duration-input"
                        type="number"
                        min={0.1}
                        step={0.1}
                        value={ann.duration}
                        onChange={e => {
                          const v = Math.max(0.1, parseFloat(e.target.value || '0'));
                          onUpdateDuration(ann.id, v);
                        }}
                        title="Durata (secondi)"
                      />
                      <span className="ann-duration-suffix">s</span>
                    </div>
                  </div>
                  {editingId === ann.id ? (
                    <input
                      autoFocus
                      className="ann-label-input"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(ann.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitEdit(ann.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                  ) : (
                    <div
                      className="ann-label"
                      onClick={() => startEdit(ann)}
                      title="Clicca per modificare"
                    >
                      {ann.label || <span className="placeholder">Aggiungi nota...</span>}
                    </div>
                  )}
                </div>
                <button
                  className="icon-btn danger"
                  onClick={() => onDelete(ann.id)}
                  title="Elimina"
                >
                  <Trash2 size={14} />
                </button>
                {isActive && (
                  <div className="ann-fadebar">
                    <div
                      className="ann-fadebar-fill"
                      style={{ width: `${remainingPct * 100}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
