// src/utils/export.ts

import { AnnotationSession, ExportData, KeyFrame, Annotation } from '../types';

export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const ms = Math.floor((seconds % 1) * 100).toString().padStart(2, '0');
  return `${m}:${s}.${ms}`;
}

export async function captureKeyFrame(
  videoEl: HTMLVideoElement,
  timestamp: number,
  label: string,
  canvasOverlayEl?: HTMLCanvasElement
): Promise<KeyFrame> {
  return new Promise((resolve) => {
    const seekHandler = () => {
      const offscreen = document.createElement('canvas');
      offscreen.width = videoEl.videoWidth;
      offscreen.height = videoEl.videoHeight;
      const ctx = offscreen.getContext('2d')!;
      ctx.drawImage(videoEl, 0, 0);

      // Draw canvas overlay annotations if provided
      if (canvasOverlayEl) {
        const scaleX = videoEl.videoWidth / canvasOverlayEl.width;
        const scaleY = videoEl.videoHeight / canvasOverlayEl.height;
        ctx.save();
        ctx.scale(scaleX, scaleY);
        ctx.drawImage(canvasOverlayEl, 0, 0);
        ctx.restore();
      }

      resolve({
        timestamp,
        label,
        dataUrl: offscreen.toDataURL('image/jpeg', 0.92),
      });

      videoEl.removeEventListener('seeked', seekHandler);
    };

    videoEl.addEventListener('seeked', seekHandler);
    videoEl.currentTime = timestamp;
  });
}

export function exportToJSON(
  session: AnnotationSession,
  keyFrames: KeyFrame[]
): ExportData {
  return {
    session: {
      id: session.id,
      name: session.name,
      videoName: session.videoName,
      videoDuration: session.videoDuration,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
    annotations: session.annotations,
    keyFrames,
    exportedAt: Date.now(),
    version: '1.0.0',
  };
}

export function downloadJSON(data: ExportData, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportSessionWithScreenshots(
  session: AnnotationSession,
  videoEl: HTMLVideoElement,
  fabricCanvasEl: HTMLCanvasElement,
  onProgress?: (pct: number) => void
): Promise<void> {
  const savedTime = videoEl.currentTime;
  const keyFrames: KeyFrame[] = [];

  // Capture keyframe for every annotation (deduplicated by second)
  const uniqueTimestamps = Array.from(
    new Map(
      session.annotations.map(a => [Math.floor(a.timestamp), a])
    ).values()
  );

  for (let i = 0; i < uniqueTimestamps.length; i++) {
    const ann = uniqueTimestamps[i];
    const label = ann.label || `Annotazione al ${formatTimestamp(ann.timestamp)}`;
    const kf = await captureKeyFrame(videoEl, ann.timestamp, label, fabricCanvasEl);
    keyFrames.push(kf);
    onProgress?.(Math.round(((i + 1) / uniqueTimestamps.length) * 100));
  }

  const data = exportToJSON(session, keyFrames);
  const filename = `${session.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.json`;
  downloadJSON(data, filename);

  // Restore video position
  videoEl.currentTime = savedTime;
}

export function getAnnotationsAtTime(
  annotations: Annotation[],
  currentTime: number
): Annotation[] {
  return annotations.filter(a => {
    const start = a.timestamp;
    const end = a.timestamp + (a.duration || 3);
    return currentTime >= start && currentTime <= end;
  });
}
