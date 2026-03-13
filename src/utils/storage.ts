// src/utils/storage.ts

import { AnnotationSession, Annotation } from '../types';

const STORAGE_KEY = 'sport_analyst_sessions';
const CURRENT_SESSION_KEY = 'sport_analyst_current_session';

export function loadSessions(): AnnotationSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSession(session: AnnotationSession): void {
  const sessions = loadSessions();
  const idx = sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.unshift(session);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  localStorage.setItem(CURRENT_SESSION_KEY, session.id);
}

export function loadCurrentSession(): AnnotationSession | null {
  try {
    const id = localStorage.getItem(CURRENT_SESSION_KEY);
    if (!id) return null;
    const sessions = loadSessions();
    return sessions.find(s => s.id === id) || null;
  } catch {
    return null;
  }
}

export function deleteSession(id: string): void {
  const sessions = loadSessions().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function createSession(videoName: string, videoDuration: number): AnnotationSession {
  return {
    id: `session_${Date.now()}`,
    name: `Analisi ${new Date().toLocaleDateString('it-IT')} - ${videoName}`,
    videoName,
    videoDuration,
    annotations: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function addAnnotationToSession(
  session: AnnotationSession,
  annotation: Annotation
): AnnotationSession {
  return {
    ...session,
    annotations: [...session.annotations, annotation],
    updatedAt: Date.now(),
  };
}

export function removeAnnotationFromSession(
  session: AnnotationSession,
  annotationId: string
): AnnotationSession {
  return {
    ...session,
    annotations: session.annotations.filter(a => a.id !== annotationId),
    updatedAt: Date.now(),
  };
}

export function updateAnnotationInSession(
  session: AnnotationSession,
  annotation: Annotation
): AnnotationSession {
  return {
    ...session,
    annotations: session.annotations.map(a => a.id === annotation.id ? annotation : a),
    updatedAt: Date.now(),
  };
}
