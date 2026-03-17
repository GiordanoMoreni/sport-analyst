// src/App.tsx

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { VideoDropzone } from './components/VideoDropzone';
import { Toolbar } from './components/Toolbar';
import { VideoControls } from './components/VideoControls';
import { AnnotationPanel } from './components/AnnotationPanel';
import { Timeline } from './components/Timeline';
import { ExportPanel } from './components/ExportPanel';
import { AIEventsPanel } from './components/AIEventsPanel';
import { useVideoPlayer } from './hooks/useVideoPlayer';
import { useFabricCanvas } from './hooks/useFabricCanvas';
import { useMediapipeTracking, AIMode, AIEventFlags } from './hooks/useMediapipeTracking';
import { ToolType, Annotation, AnnotationSession, AIEvent } from './types';
import {
  createSession, saveSession, loadCurrentSession, clearCurrentSession,
  addAnnotationToSession, removeAnnotationFromSession, updateAnnotationInSession
} from './utils/storage';
import './App.css';

export default function App() {
  const DEBUG = true;
  const DEFAULT_DURATION_KEY = 'sport_analyst_default_duration';
  const [currentTool, setCurrentTool] = useState<ToolType>('arrow');
  const [currentColor, setCurrentColor] = useState('#FF3B3B');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [session, setSession] = useState<AnnotationSession | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [annotationDuration, setAnnotationDuration] = useState(() => {
    const raw = localStorage.getItem(DEFAULT_DURATION_KEY);
    const parsed = raw ? parseFloat(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
  }); // seconds annotation stays visible

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aiCanvasRef = useRef<HTMLCanvasElement>(null);

  const video = useVideoPlayer();
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiModes, setAiModes] = useState<AIMode>({
    pose: true,
    hands: true,
    face: true,
  });
  const [aiFlags, setAiFlags] = useState<AIEventFlags>({
    attack: true,
    touch: true,
    priority: true,
  });
  const [aiEvents, setAiEvents] = useState<AIEvent[]>([]);
  const [aiPriority, setAiPriority] = useState<{ holder: number | null; confidence: number }>({
    holder: null,
    confidence: 0,
  });
  const [aiFencers, setAiFencers] = useState<{ id: number; x: number; y: number }[]>([]);

  const { ready: aiReady, error: aiError } = useMediapipeTracking({
    enabled: aiEnabled,
    modes: aiModes,
    flags: aiFlags,
    videoRef: video.videoRef,
    canvasRef: aiCanvasRef,
    onEvent: (event) => {
      setAiEvents(prev => {
        const next = [...prev, event];
        return next.length > 300 ? next.slice(next.length - 300) : next;
      });
    },
    onPriorityChange: (state) => {
      setAiPriority({ holder: state.holder, confidence: state.confidence });
    },
    onFencerPositions: (positions) => {
      setAiFencers(positions);
    },
  });

  useEffect(() => {
    if (!aiEnabled || !aiFlags.priority) {
      setAiPriority({ holder: null, confidence: 0 });
    }
  }, [aiEnabled, aiFlags.priority]);

  const {
    clearCanvas,
    deleteSelected,
    deleteByAnnotationId,
    updateVisibilityByTime,
    getCanvasJSON,
    loadFromJSON,
    getCanvasElement,
    objectCount,
  } = useFabricCanvas(canvasRef, {
    width: canvasSize.width,
    height: canvasSize.height,
    currentTool,
    currentColor,
    strokeWidth,
    onObjectAdded: (fabricJson, annotationId) => {
      handleAnnotationAdded(fabricJson, annotationId);
    },
    onObjectsDeleted: (annotationIds) => {
      if (!session || annotationIds.length === 0) return;
      const updated = {
        ...session,
        annotations: session.annotations.filter(a => !annotationIds.includes(a.id)),
        updatedAt: Date.now(),
      };
      setSession(updated);
      saveSession(updated);
    },
  });

  // Sync canvas size to the video container (full overlay)
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const videoEl = video.videoRef.current;
    if (!videoEl) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const size = { width: Math.round(rect.width), height: Math.round(rect.height) };
      if (!size.width || !size.height) return;
      setCanvasSize(size);
      if (DEBUG) {
        // eslint-disable-next-line no-console
        console.debug('[video] size', {
          container: { w: rect.width, h: rect.height },
          media: { w: videoEl.videoWidth, h: videoEl.videoHeight },
          canvas: size,
        });
      }
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);
    ro.observe(videoEl);
    window.addEventListener('resize', updateSize);
    videoEl.addEventListener('loadedmetadata', updateSize);
    videoEl.addEventListener('loadeddata', updateSize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
      videoEl.removeEventListener('loadedmetadata', updateSize);
      videoEl.removeEventListener('loadeddata', updateSize);
    };
  }, [video.videoRef, video.videoSrc]);

  // Load existing session on mount
  useEffect(() => {
    const existing = loadCurrentSession();
    if (existing) setSession(existing);
  }, []);

  // Persist default duration
  useEffect(() => {
    localStorage.setItem(DEFAULT_DURATION_KEY, String(annotationDuration));
  }, [annotationDuration]);

  // When loading a new video file, clear canvas and current session view
  useEffect(() => {
    if (!video.videoSrc) return;
    clearCurrentSession();
    clearCanvas();
    setSession(null);
    setAiEvents([]);
  }, [video.videoSrc, clearCanvas]);

  // Create session when video is loaded
  useEffect(() => {
    if (video.isLoaded && video.duration > 0 && video.videoName) {
      const existing = loadCurrentSession();
      if (existing && existing.videoName === video.videoName) {
        setSession(existing);
      } else {
        const newSession = createSession(video.videoName, video.duration);
        setSession(newSession);
        saveSession(newSession);
      }
    }
  }, [video.isLoaded, video.duration, video.videoName]);

  // Show/hide annotations based on current time
  useEffect(() => {
    if (!session || !video.isLoaded) return;
    updateVisibilityByTime(session.annotations, video.currentTime);
  }, [video.currentTime, session, video.isLoaded, updateVisibilityByTime]);

  const handleAnnotationAdded = useCallback((fabricJson: string, annotationId: string) => {
    if (!session) return;
    const annotation: Annotation = {
      id: annotationId,
      timestamp: video.currentTime,
      duration: annotationDuration,
      fabricData: fabricJson,
      toolType: currentTool,
      color: currentColor,
      createdAt: Date.now(),
    };
    const updated = addAnnotationToSession(session, annotation);
    setSession(updated);
    saveSession(updated);
  }, [session, video.currentTime, annotationDuration, currentTool, currentColor]);

  const handleDeleteAnnotation = useCallback((id: string) => {
    if (!session) return;
    deleteByAnnotationId(id);
    const updated = removeAnnotationFromSession(session, id);
    setSession(updated);
    saveSession(updated);
  }, [session, deleteByAnnotationId]);

  const handleUpdateLabel = useCallback((id: string, label: string) => {
    if (!session) return;
    const ann = session.annotations.find(a => a.id === id);
    if (!ann) return;
    const updated = updateAnnotationInSession(session, { ...ann, label });
    setSession(updated);
    saveSession(updated);
  }, [session]);

  const handleUpdateDuration = useCallback((id: string, duration: number) => {
    if (!session) return;
    const ann = session.annotations.find(a => a.id === id);
    if (!ann) return;
    const updated = updateAnnotationInSession(session, { ...ann, duration });
    setSession(updated);
    saveSession(updated);
  }, [session]);

  const handleAddKeyFrame = useCallback(() => {
    // Marks current position as keyframe annotation
    if (!session) return;
    const annotation: Annotation = {
      id: `kf_${Date.now()}`,
      timestamp: video.currentTime,
      duration: 0.1,
      fabricData: getCanvasJSON(),
      toolType: 'select',
      color: '#FFD600',
      label: `⚑ Keyframe`,
      createdAt: Date.now(),
    };
    const updated = addAnnotationToSession(session, annotation);
    setSession(updated);
    saveSession(updated);
  }, [session, video.currentTime, getCanvasJSON]);

  const handleClearAll = useCallback(() => {
    clearCanvas();
    if (!session) return;
    const updated = {
      ...session,
      annotations: [],
      updatedAt: Date.now(),
    };
    setSession(updated);
    saveSession(updated);
  }, [clearCanvas, session]);

  const handleJumpTo = useCallback((time: number) => {
    video.seek(time);
    video.pause();
  }, [video]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') { e.preventDefault(); video.togglePlay(); }
      if (e.code === 'ArrowLeft' && e.shiftKey) video.stepFrame(false);
      else if (e.code === 'ArrowLeft') video.seekRelative(-5);
      if (e.code === 'ArrowRight' && e.shiftKey) video.stepFrame(true);
      else if (e.code === 'ArrowRight') video.seekRelative(5);
      if (
        e.code === 'Delete' ||
        e.key === 'Delete' ||
        e.key === 'Del' ||
        e.code === 'Backspace' ||
        e.key === 'Backspace'
      ) {
        deleteSelected();
      }

      // Tool shortcuts
      if (e.code === 'KeyV') setCurrentTool('select');
      if (e.code === 'KeyA') setCurrentTool('arrow');
      if (e.code === 'KeyC') setCurrentTool('circle');
      if (e.code === 'KeyR') setCurrentTool('rectangle');
      if (e.code === 'KeyP') setCurrentTool('freehand');
      if (e.code === 'KeyT') setCurrentTool('text');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [video, deleteSelected]);

  if (!video.videoSrc) {
    return <VideoDropzone onFileLoaded={video.loadVideo} />;
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <span className="logo">⚽ Sport Analyst</span>
          <span className="video-name" title={video.videoName}>
            {video.videoName}
          </span>
        </div>
        <div className="header-right">
          <button
            className="header-btn"
            onClick={() => { video.loadVideo; window.location.reload(); }}
            title="Carica altro video"
          >
            Cambia video
          </button>
        </div>
      </header>

      {/* Main layout */}
      <div className="main-layout">
        {/* Left sidebar */}
        <aside className="sidebar">
          <AnnotationPanel
            annotations={session?.annotations || []}
            currentTime={video.currentTime}
            defaultDuration={annotationDuration}
            onJumpTo={handleJumpTo}
            onDelete={handleDeleteAnnotation}
            onUpdateLabel={handleUpdateLabel}
            onUpdateDuration={handleUpdateDuration}
            onDefaultDurationChange={setAnnotationDuration}
            onAddCurrentAsKeyFrame={handleAddKeyFrame}
          />
          <AIEventsPanel
            events={aiEvents}
            currentTime={video.currentTime}
            onJumpTo={handleJumpTo}
            onClear={() => setAiEvents([])}
          />
          <ExportPanel
            session={session}
            videoRef={video.videoRef}
            fabricCanvasEl={getCanvasElement()}
          />
        </aside>

        {/* Video + canvas area */}
        <main className="video-area">
          <Toolbar
            currentTool={currentTool}
            currentColor={currentColor}
            strokeWidth={strokeWidth}
            onToolChange={setCurrentTool}
            onColorChange={setCurrentColor}
            onStrokeWidthChange={setStrokeWidth}
            onDeleteSelected={deleteSelected}
            onClearAll={handleClearAll}
            objectCount={objectCount}
          />

          <div className="ai-controls">
            <label className="ai-toggle">
              <input
                type="checkbox"
                checked={aiEnabled}
                onChange={e => setAiEnabled(e.target.checked)}
              />
              AI Tracking
            </label>
            <div className={`ai-modes ${aiEnabled ? '' : 'disabled'}`}>
              <label>
                <input
                  type="checkbox"
                  checked={aiModes.pose}
                  onChange={e => setAiModes(m => ({ ...m, pose: e.target.checked }))}
                  disabled={!aiEnabled}
                />
                Pose
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={aiModes.hands}
                  onChange={e => setAiModes(m => ({ ...m, hands: e.target.checked }))}
                  disabled={!aiEnabled}
                />
                Hands
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={aiModes.face}
                  onChange={e => setAiModes(m => ({ ...m, face: e.target.checked }))}
                  disabled={!aiEnabled}
                />
                Face
              </label>
            </div>
            <div className={`ai-flags ${aiEnabled ? '' : 'disabled'}`}>
              <label>
                <input
                  type="checkbox"
                  checked={aiFlags.attack}
                  onChange={e => setAiFlags(f => ({ ...f, attack: e.target.checked }))}
                  disabled={!aiEnabled}
                />
                Attacco
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={aiFlags.touch}
                  onChange={e => setAiFlags(f => ({ ...f, touch: e.target.checked }))}
                  disabled={!aiEnabled}
                />
                Tocco
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={aiFlags.priority}
                  onChange={e => setAiFlags(f => ({ ...f, priority: e.target.checked }))}
                  disabled={!aiEnabled}
                />
                Priorita
              </label>
            </div>
            <div className="ai-status">
              {aiEnabled && !aiReady && !aiError && 'Caricamento modelli...'}
              {aiEnabled && aiError && 'Errore AI'}
            </div>
            <div className={`ai-priority ${aiPriority.holder === null ? 'none' : `f${aiPriority.holder + 1}`}`}>
              Priorita: {aiFlags.priority ? (aiPriority.holder === null ? '—' : `F${aiPriority.holder + 1}`) : 'OFF'}
              {aiFlags.priority && aiPriority.holder !== null && (
                <span className="ai-priority-conf">{Math.round(aiPriority.confidence * 100)}%</span>
              )}
            </div>
          </div>

          <div className="video-container" ref={containerRef}>
            <video
              ref={video.videoRef}
              src={video.videoSrc}
              className="video-el"
              playsInline
              preload="metadata"
            />
            {aiFlags.priority && aiPriority.holder !== null && (
              <div className={`priority-badge f${aiPriority.holder + 1}`}>
                Priorita: F{aiPriority.holder + 1}
              </div>
            )}
            {aiEnabled && aiModes.pose && aiFencers.length >= 2 && aiFencers.map(f => (
              <div
                key={`fencer-${f.id}`}
                className={`fencer-tag f${f.id + 1} ${aiPriority.holder === f.id ? 'priority' : ''}`}
                style={{ left: f.x, top: f.y }}
              >
                F{f.id + 1}
              </div>
            ))}
            <canvas
              ref={aiCanvasRef}
              className="ai-canvas"
              width={canvasSize.width || 0}
              height={canvasSize.height || 0}
              style={{
                width: canvasSize.width,
                height: canvasSize.height,
              }}
            />
            <canvas
              ref={canvasRef}
              className="fabric-canvas"
              width={canvasSize.width || 0}
              height={canvasSize.height || 0}
              style={{
                width: canvasSize.width,
                height: canvasSize.height,
                cursor: currentTool === 'select' ? 'default'
                  : currentTool === 'text' ? 'text'
                  : 'crosshair',
              }}
            />
          </div>

          <Timeline
            duration={video.duration}
            currentTime={video.currentTime}
            annotations={session?.annotations || []}
            onSeek={video.seek}
          />

          <VideoControls
            isPlaying={video.isPlaying}
            currentTime={video.currentTime}
            duration={video.duration}
            volume={video.volume}
            playbackRate={video.playbackRate}
            onTogglePlay={video.togglePlay}
            onSeek={video.seek}
            onSeekRelative={video.seekRelative}
            onStepFrame={video.stepFrame}
            onVolumeChange={video.changeVolume}
            onPlaybackRateChange={video.setPlaybackRate}
          />
        </main>
      </div>

      {/* Shortcuts hint */}
      <div className="shortcuts-hint">
        <kbd>Space</kbd> play/pausa &nbsp;
        <kbd>←</kbd><kbd>→</kbd> ±5s &nbsp;
        <kbd>Shift+←</kbd><kbd>Shift+→</kbd> frame &nbsp;
        <kbd>V</kbd> select <kbd>A</kbd> freccia <kbd>C</kbd> cerchio <kbd>R</kbd> rett. <kbd>P</kbd> disegno <kbd>T</kbd> testo
      </div>
    </div>
  );
}
