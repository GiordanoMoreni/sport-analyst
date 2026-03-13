// src/components/ExportPanel.tsx

import React, { useState } from 'react';
import { Download, Image, FileJson, Loader } from 'lucide-react';
import { AnnotationSession } from '../types';
import { exportSessionWithScreenshots, exportToJSON, downloadJSON } from '../utils/export';

interface ExportPanelProps {
  session: AnnotationSession | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  fabricCanvasEl: HTMLCanvasElement | null;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  session,
  videoRef,
  fabricCanvasEl,
}) => {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  const handleExportFull = async () => {
    if (!session || !videoRef.current || !fabricCanvasEl) return;
    if (session.annotations.length === 0) {
      setMessage('Nessuna annotazione da esportare.');
      return;
    }

    setExporting(true);
    setProgress(0);
    setMessage('Cattura screenshot in corso...');

    try {
      await exportSessionWithScreenshots(
        session,
        videoRef.current,
        fabricCanvasEl,
        (pct) => {
          setProgress(pct);
          setMessage(`Screenshot ${pct}% completato...`);
        }
      );
      setMessage('Esportazione completata!');
    } catch (err) {
      setMessage('Errore durante l\'esportazione.');
      console.error(err);
    } finally {
      setExporting(false);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleExportJSONOnly = () => {
    if (!session) return;
    const data = exportToJSON(session, []);
    const filename = `${session.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_annotations.json`;
    downloadJSON(data, filename);
    setMessage('JSON esportato!');
    setTimeout(() => setMessage(''), 3000);
  };

  const disabled = !session || session.annotations.length === 0;

  return (
    <div className="export-panel">
      <div className="panel-header static">
        <span className="panel-title">
          <Download size={15} /> Esporta
        </span>
      </div>

      <div className="export-actions">
        <button
          className="export-btn primary"
          onClick={handleExportFull}
          disabled={disabled || exporting}
          title="JSON + screenshot dei frame annotati"
        >
          {exporting
            ? <><Loader size={15} className="spin" /> {progress}%</>
            : <><Image size={15} /> JSON + Screenshot</>
          }
        </button>
        <button
          className="export-btn"
          onClick={handleExportJSONOnly}
          disabled={disabled || exporting}
          title="Solo dati annotazioni in JSON"
        >
          <FileJson size={15} /> Solo JSON
        </button>
      </div>

      {message && (
        <div className={`export-msg ${message.includes('Errore') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      {session && (
        <div className="session-info">
          <span className="session-name">{session.name}</span>
          <span className="session-count">{session.annotations.length} annotazioni</span>
        </div>
      )}
    </div>
  );
};
