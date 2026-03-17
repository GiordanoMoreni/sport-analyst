// src/hooks/useMediapipeTracking.ts

import { useEffect, useRef, useState } from 'react';
import {
  FilesetResolver,
  PoseLandmarker,
  HandLandmarker,
  FaceLandmarker,
  DrawingUtils,
} from '@mediapipe/tasks-vision';

export type AIMode = {
  pose: boolean;
  hands: boolean;
  face: boolean;
};

interface UseMediapipeTrackingOptions {
  enabled: boolean;
  modes: AIMode;
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export function useMediapipeTracking({
  enabled,
  modes,
  videoRef,
  canvasRef,
}: UseMediapipeTrackingOptions) {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const poseRef = useRef<PoseLandmarker | null>(null);
  const handsRef = useRef<HandLandmarker | null>(null);
  const faceRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (!enabled) return;
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        if (cancelled) return;

        if (!poseRef.current) {
          poseRef.current = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: POSE_MODEL },
            runningMode: 'VIDEO',
            numPoses: 1,
          });
        }
        if (!handsRef.current) {
          handsRef.current = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: HAND_MODEL },
            runningMode: 'VIDEO',
            numHands: 2,
          });
        }
        if (!faceRef.current) {
          faceRef.current = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: FACE_MODEL },
            runningMode: 'VIDEO',
            numFaces: 1,
          });
        }

        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'MediaPipe init error');
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !ready) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const drawingUtils = new DrawingUtils(ctx);

    const tick = (ts: number) => {
      if (!enabled) return;
      rafRef.current = requestAnimationFrame(tick);
      if (ts - lastTsRef.current < 1000 / 15) return;
      lastTsRef.current = ts;

      if (video.readyState < 2) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const now = performance.now();
      if (modes.pose && poseRef.current) {
        const res = poseRef.current.detectForVideo(video, now);
        res.landmarks.forEach(landmarks => {
          drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
            color: '#22c55e',
            lineWidth: 2,
          });
          drawingUtils.drawLandmarks(landmarks, { color: '#86efac', lineWidth: 1 });
        });
      }
      if (modes.hands && handsRef.current) {
        const res = handsRef.current.detectForVideo(video, now);
        res.landmarks.forEach(landmarks => {
          drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
            color: '#3d7fff',
            lineWidth: 2,
          });
          drawingUtils.drawLandmarks(landmarks, { color: '#93c5fd', lineWidth: 1 });
        });
      }
      if (modes.face && faceRef.current) {
        const res = faceRef.current.detectForVideo(video, now);
        res.faceLandmarks.forEach(landmarks => {
          drawingUtils.drawLandmarks(landmarks, { color: '#f97316', lineWidth: 1 });
        });
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [enabled, ready, modes, videoRef, canvasRef]);

  return { ready, error };
}
