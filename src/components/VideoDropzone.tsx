// src/components/VideoDropzone.tsx

import React, { useCallback, useState } from 'react';
import { Film, Upload } from 'lucide-react';

interface VideoDropzoneProps {
  onFileLoaded: (file: File) => void;
}

export const VideoDropzone: React.FC<VideoDropzoneProps> = ({ onFileLoaded }) => {
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('video/')) return;
    onFileLoaded(file);
  }, [onFileLoaded]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div
      className={`dropzone ${dragging ? 'dragging' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="dropzone-inner">
        <div className="dropzone-icon">
          {dragging ? <Upload size={48} /> : <Film size={48} />}
        </div>
        <h2 className="dropzone-title">Sport Analyst</h2>
        <p className="dropzone-sub">
          Trascina un video qui oppure clicca per selezionarlo
        </p>
        <p className="dropzone-formats">MP4, MOV, AVI, WebM, MKV</p>
        <label className="dropzone-btn">
          <input
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={onInputChange}
          />
          Seleziona video
        </label>
      </div>
    </div>
  );
};
