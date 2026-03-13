// src/components/AnnotationPanel.tsx

import React, { useState } from 'react';
import { Annotation } from '../types';
import { formatTimestamp } from '../utils/export';
import { Trash2, ChevronDown, ChevronUp, Bookmark } from 'lucide-react';

interface AnnotationPanelProps {
  annotations: Annotation[];
  currentTime: number;
  onJumpTo: (time: number) => void;
  onDelete: (id: string) => void;
  onUpdateLabel: (id: string, label: string) => void;
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
  onJumpTo,
  onDelete,
  onUpdateLabel,
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
            return (
              <div
                key={ann.id}
                className={`annotation-item ${isActive ? 'active' : ''}`}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
