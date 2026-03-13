// src/types/index.ts

export type ToolType =
  | 'select'
  | 'arrow'
  | 'circle'
  | 'rectangle'
  | 'freehand'
  | 'text'
  | 'spotlight';

export interface Annotation {
  id: string;
  timestamp: number; // seconds
  duration: number;  // how long annotation is visible (seconds)
  label?: string;
  fabricData: string; // JSON serialized fabric object
  toolType: ToolType;
  color: string;
  createdAt: number;
}

export interface AnnotationSession {
  id: string;
  name: string;
  videoName: string;
  videoDuration: number;
  annotations: Annotation[];
  createdAt: number;
  updatedAt: number;
}

export interface KeyFrame {
  timestamp: number;
  label: string;
  dataUrl: string;
}

export interface ExportData {
  session: Omit<AnnotationSession, 'annotations'>;
  annotations: Annotation[];
  keyFrames: KeyFrame[];
  exportedAt: number;
  version: string;
}

export interface AppState {
  currentTool: ToolType;
  currentColor: string;
  currentStrokeWidth: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  sessionName: string;
  videoName: string;
  showAnnotations: boolean;
}
