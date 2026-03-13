// src/components/Toolbar.tsx

import React from 'react';
import {
  MousePointer2, ArrowUpRight, Circle, Square,
  Pen, Type, Zap, Trash2, RotateCcw
} from 'lucide-react';
import { ToolType } from '../types';

const TOOLS: { id: ToolType; icon: React.ReactNode; label: string }[] = [
  { id: 'select', icon: <MousePointer2 size={18} />, label: 'Seleziona' },
  { id: 'arrow', icon: <ArrowUpRight size={18} />, label: 'Freccia' },
  { id: 'circle', icon: <Circle size={18} />, label: 'Cerchio' },
  { id: 'rectangle', icon: <Square size={18} />, label: 'Rettangolo' },
  { id: 'freehand', icon: <Pen size={18} />, label: 'Disegno libero' },
  { id: 'text', icon: <Type size={18} />, label: 'Testo' },
  { id: 'spotlight', icon: <Zap size={18} />, label: 'Spotlight' },
];

const COLORS = [
  '#FF3B3B', // red
  '#FF9500', // orange
  '#FFD600', // yellow
  '#34C759', // green
  '#007AFF', // blue
  '#AF52DE', // purple
  '#FFFFFF', // white
  '#000000', // black
];

const STROKE_WIDTHS = [2, 4, 6, 10];

interface ToolbarProps {
  currentTool: ToolType;
  currentColor: string;
  strokeWidth: number;
  onToolChange: (tool: ToolType) => void;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (w: number) => void;
  onDeleteSelected: () => void;
  onClearAll: () => void;
  objectCount: number;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  currentTool,
  currentColor,
  strokeWidth,
  onToolChange,
  onColorChange,
  onStrokeWidthChange,
  onDeleteSelected,
  onClearAll,
  objectCount,
}) => {
  return (
    <div className="toolbar">
      {/* Tool group */}
      <div className="toolbar-group">
        {TOOLS.map(tool => (
          <button
            key={tool.id}
            className={`tool-btn ${currentTool === tool.id ? 'active' : ''}`}
            onClick={() => onToolChange(tool.id)}
            title={tool.label}
          >
            {tool.icon}
          </button>
        ))}
      </div>

      <div className="toolbar-divider" />

      {/* Color group */}
      <div className="toolbar-group">
        {COLORS.map(color => (
          <button
            key={color}
            className={`color-btn ${currentColor === color ? 'active' : ''}`}
            style={{ background: color }}
            onClick={() => onColorChange(color)}
            title={color}
          />
        ))}
        <input
          type="color"
          value={currentColor}
          onChange={e => onColorChange(e.target.value)}
          className="color-picker"
          title="Colore personalizzato"
        />
      </div>

      <div className="toolbar-divider" />

      {/* Stroke width */}
      <div className="toolbar-group">
        {STROKE_WIDTHS.map(w => (
          <button
            key={w}
            className={`stroke-btn ${strokeWidth === w ? 'active' : ''}`}
            onClick={() => onStrokeWidthChange(w)}
            title={`Spessore ${w}px`}
          >
            <div className="stroke-preview" style={{ height: w, maxHeight: 10 }} />
          </button>
        ))}
      </div>

      <div className="toolbar-divider" />

      {/* Actions */}
      <div className="toolbar-group">
        <button
          className="tool-btn danger"
          onClick={onDeleteSelected}
          title="Elimina selezionato"
          disabled={currentTool !== 'select'}
        >
          <Trash2 size={18} />
        </button>
        <button
          className="tool-btn danger"
          onClick={onClearAll}
          title={`Pulisci tutto (${objectCount} oggetti)`}
          disabled={objectCount === 0}
        >
          <RotateCcw size={18} />
        </button>
      </div>
    </div>
  );
};
