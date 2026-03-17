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
  onEvent?: (event: {
    id: string;
    type: 'probable_touch' | 'attack';
    timestamp: number;
    confidence: number;
    meta?: Record<string, unknown>;
  }) => void;
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
  onEvent,
}: UseMediapipeTrackingOptions) {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const poseRef = useRef<PoseLandmarker | null>(null);
  const handsRef = useRef<HandLandmarker | null>(null);
  const faceRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const eventSeqRef = useRef(0);
  const lastTouchRef = useRef<{ ts: number; x: number; y: number } | null>(null);
  const lastEventEmitRef = useRef(0);
  const lastAttackRef = useRef<{ ts: number; x1: number; y1: number; x2: number; y2: number } | null>(null);
  const lastPoseRef = useRef<{
    ts: number;
    wrists: { x: number; y: number }[][];
    elbows: { x: number; y: number }[][];
  } | null>(null);
  const lastAttackEmitRef = useRef<Record<number, number>>({});
  const attackEmaRef = useRef<Record<number, number>>({});

  const nextEventId = () => {
    eventSeqRef.current += 1;
    return `aie_${Date.now()}_${eventSeqRef.current}`;
  };

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
            numPoses: 2,
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

        // Probable touch detection when at least 2 fencers are visible
        if (res.landmarks.length >= 2) {
          const L_WRIST = 15;
          const R_WRIST = 16;
          const L_ELBOW = 13;
          const R_ELBOW = 14;
          const L_SHOULDER = 11;
          const R_SHOULDER = 12;
          const L_HIP = 23;
          const R_HIP = 24;
          const THRESHOLD = 0.08;
          const ATTACK_SPEED = 0.65;
          const ATTACK_COOLDOWN = 900;
          const TIP_EXTEND = 0.22;
          type BestHit = { dist: number; x: number; y: number; attacker: number; defender: number };
          let best: BestHit | null = null;

          const torsoCenter = (lm: typeof res.landmarks[0]) => {
            const pts = [lm[L_SHOULDER], lm[R_SHOULDER], lm[L_HIP], lm[R_HIP]].filter(Boolean);
            if (pts.length < 2) return null;
            const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
            const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
            return { x, y };
          };

          for (let i = 0; i < res.landmarks.length; i += 1) {
            for (let j = 0; j < res.landmarks.length; j += 1) {
              if (i === j) continue;
              const attacker = res.landmarks[i];
              const defenderCenter = torsoCenter(res.landmarks[j]);
              if (!defenderCenter) continue;
              const wrists = [
                { w: attacker[L_WRIST], e: attacker[L_ELBOW] },
                { w: attacker[R_WRIST], e: attacker[R_ELBOW] },
              ].filter(p => p.w && p.e);
              wrists.forEach(p => {
                const dirx = p.w.x - p.e.x;
                const diry = p.w.y - p.e.y;
                const tip = { x: p.w.x + dirx * TIP_EXTEND, y: p.w.y + diry * TIP_EXTEND };
                const dx = tip.x - defenderCenter.x;
                const dy = tip.y - defenderCenter.y;
                const dist = Math.hypot(dx, dy);
                if (!best || dist < best.dist) {
                  best = { dist, x: tip.x, y: tip.y, attacker: i, defender: j };
                }
              });
            }
          }

          const bestHit = best as BestHit | null;
          if (bestHit && bestHit.dist <= THRESHOLD) {
            lastTouchRef.current = {
              ts: now,
              x: bestHit.x * canvas.width,
              y: bestHit.y * canvas.height,
            };
            if (now - lastEventEmitRef.current > 800) {
              lastEventEmitRef.current = now;
              const confidence = Math.max(0, Math.min(1, 1 - bestHit.dist / THRESHOLD));
              onEvent?.({
                id: nextEventId(),
                type: 'probable_touch',
                timestamp: video.currentTime,
                confidence,
                meta: { attacker: bestHit.attacker, defender: bestHit.defender },
              });
            }
          }

          // Attack detection: wrist moving fast toward opponent torso
          const prev = lastPoseRef.current;
          if (prev && prev.wrists.length >= res.landmarks.length) {
            const dt = Math.max(0.001, (now - prev.ts) / 1000);
            for (let i = 0; i < res.landmarks.length; i += 1) {
              for (let j = 0; j < res.landmarks.length; j += 1) {
                if (i === j) continue;
                const defenderCenter = torsoCenter(res.landmarks[j]);
                if (!defenderCenter) continue;
                const curWrists = [
                  { w: res.landmarks[i][L_WRIST], e: res.landmarks[i][L_ELBOW] },
                  { w: res.landmarks[i][R_WRIST], e: res.landmarks[i][R_ELBOW] },
                ].filter(p => p.w && p.e);
                const prevWrists = prev.wrists[i] || [];
                const prevElbows = prev.elbows[i] || [];

                let bestSpeedToward = 0;
                type Point2D = { x: number; y: number };
                let bestPoint: Point2D | null = null;
                curWrists.forEach((p, idx) => {
                  const pw = prevWrists[idx];
                  const pe = prevElbows[idx];
                  if (!pw || !pe) return;
                  const vx = (p.w.x - pw.x) / dt;
                  const vy = (p.w.y - pw.y) / dt;
                  const dx = defenderCenter.x - p.w.x;
                  const dy = defenderCenter.y - p.w.y;
                  const dist = Math.hypot(dx, dy) + 1e-6;
                  const ux = dx / dist;
                  const uy = dy / dist;
                  const speedToward = vx * ux + vy * uy;
                  if (speedToward > bestSpeedToward) {
                    bestSpeedToward = speedToward;
                    const dirx = p.w.x - p.e.x;
                    const diry = p.w.y - p.e.y;
                    bestPoint = { x: p.w.x + dirx * TIP_EXTEND, y: p.w.y + diry * TIP_EXTEND };
                  }
                });

                const lastEmit = lastAttackEmitRef.current[i] || 0;
                const bestPointHit = bestPoint as Point2D | null;
                if (bestPointHit && bestSpeedToward > ATTACK_SPEED && now - lastEmit > ATTACK_COOLDOWN) {
                  lastAttackEmitRef.current[i] = now;
                  lastAttackRef.current = {
                    ts: now,
                    x1: bestPointHit.x * canvas.width,
                    y1: bestPointHit.y * canvas.height,
                    x2: defenderCenter.x * canvas.width,
                    y2: defenderCenter.y * canvas.height,
                  };
                  const rawConfidence = Math.max(0, Math.min(1, bestSpeedToward / (ATTACK_SPEED * 2)));
                  const prevEma = attackEmaRef.current[i] || 0;
                  const ema = prevEma * 0.7 + rawConfidence * 0.3;
                  attackEmaRef.current[i] = ema;
                  onEvent?.({
                    id: nextEventId(),
                    type: 'attack',
                    timestamp: video.currentTime,
                    confidence: ema,
                    meta: { attacker: i, defender: j },
                  });
                }
              }
            }
          }

          lastPoseRef.current = {
            ts: now,
            wrists: res.landmarks.map(lm => {
              const l = lm[L_WRIST];
              const r = lm[R_WRIST];
              return [
                l ? { x: l.x, y: l.y } : null,
                r ? { x: r.x, y: r.y } : null,
              ].filter(Boolean) as { x: number; y: number }[];
            }),
            elbows: res.landmarks.map(lm => {
              const l = lm[L_ELBOW];
              const r = lm[R_ELBOW];
              return [
                l ? { x: l.x, y: l.y } : null,
                r ? { x: r.x, y: r.y } : null,
              ].filter(Boolean) as { x: number; y: number }[];
            }),
          };
        }
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

      if (lastTouchRef.current && now - lastTouchRef.current.ts < 500) {
        ctx.beginPath();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.arc(lastTouchRef.current.x, lastTouchRef.current.y, 18, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (lastAttackRef.current && now - lastAttackRef.current.ts < 500) {
        ctx.beginPath();
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 3;
        ctx.moveTo(lastAttackRef.current.x1, lastAttackRef.current.y1);
        ctx.lineTo(lastAttackRef.current.x2, lastAttackRef.current.y2);
        ctx.stroke();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [enabled, ready, modes, videoRef, canvasRef, onEvent]);

  return { ready, error };
}
