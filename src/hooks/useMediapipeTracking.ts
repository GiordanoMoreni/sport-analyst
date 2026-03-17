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

export type AIEventFlags = {
  attack: boolean;
  touch: boolean;
  priority: boolean;
  measure: boolean;
  tactics: boolean;
};

export type AICalibration = {
  touchDistScale: number;
  touchSpeedScale: number;
  attackSpeedScale: number;
  measureDistScale: number;
  priorityForwardScale: number;
};

interface UseMediapipeTrackingOptions {
  enabled: boolean;
  modes: AIMode;
  flags: AIEventFlags;
  calibration?: AICalibration;
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onEvent?: (event: {
    id: string;
    type: 'probable_touch' | 'attack' | 'in_measure';
    timestamp: number;
    confidence: number;
    meta?: Record<string, unknown>;
  }) => void;
  onPriorityChange?: (state: {
    holder: number | null;
    confidence: number;
    since: number | null;
  }) => void;
  onFencerPositions?: (positions: { id: number; x: number; y: number }[]) => void;
  onMetrics?: (metrics: {
    reactionTimes: { attacker: number; defender: number; ms: number; ts: number }[];
    stance: { id: number; forward: 'L' | 'R' | null; speed: number }[];
    aggressiveness: { id: number; score: number }[];
    distance?: { value: number; avg: number; inMeasure: boolean; threshold: number };
  }) => void;
}

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const BASE_TOUCH_DIST = 0.08;
const BASE_ATTACK_SPEED = 0.65;
const BASE_TOUCH_SPEED = 0.12;
const BASE_MEASURE = 0.28;
const BASE_PRIORITY_FORWARD = 0.18;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function useMediapipeTracking({
  enabled,
  modes,
  flags,
  calibration,
  videoRef,
  canvasRef,
  onEvent,
  onPriorityChange,
  onFencerPositions,
  onMetrics,
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
  const attackTrackRef = useRef<Record<number, { start: number; last: number }>>({});
  const lastPoseRef = useRef<{
    ts: number;
    wrists: { x: number; y: number }[][];
    elbows: { x: number; y: number }[][];
    centers: ({ x: number; y: number } | null)[];
  } | null>(null);
  const lastPosePrevRef = useRef<typeof lastPoseRef.current>(null);
  const lastAttackEmitRef = useRef<Record<number, number>>({});
  const attackEmaRef = useRef<Record<number, number>>({});
  const touchEmaRef = useRef<Record<number, number>>({});
  const priorityRef = useRef<{ holder: number | null; confidence: number; since: number | null }>({
    holder: null,
    confidence: 0,
    since: null,
  });
  const lastAnyAttackRef = useRef(0);
  const lastPriorityEmitRef = useRef(0);
  const lastPriorityActiveRef = useRef(0);
  const prevCentersRef = useRef<Record<number, { x: number; y: number }>>({});
  const fencerSmoothRef = useRef<Record<number, { x: number; y: number }>>({});
  const lastAttackStartRef = useRef<Record<number, { ts: number; opponent: number }>>({});
  const reactionQueueRef = useRef<{ attacker: number; defender: number; ts: number }[]>([]);
  const reactionTimesRef = useRef<{ attacker: number; defender: number; ms: number; ts: number }[]>([]);
  const stanceRef = useRef<Record<number, { forward: 'L' | 'R' | null; speed: number }>>({});
  const aggressivenessRef = useRef<Record<number, { count: number; last: number; score: number }>>({});
  const distanceAvgRef = useRef<number | null>(null);
  const distanceLastRef = useRef<number | null>(null);
  const inMeasureRef = useRef(false);
  const lastMeasureEmitRef = useRef(0);
  const currentCentersRef = useRef<Record<number, { x: number; y: number }> | null>(null);

  const safeCalibration: AICalibration = {
    touchDistScale: calibration?.touchDistScale ?? 1,
    touchSpeedScale: calibration?.touchSpeedScale ?? 1,
    attackSpeedScale: calibration?.attackSpeedScale ?? 1,
    measureDistScale: calibration?.measureDistScale ?? 1,
    priorityForwardScale: calibration?.priorityForwardScale ?? 1,
  };

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
      if (video.paused || video.ended) return;
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
          const ATTACK_COOLDOWN = 900;
          const TIP_EXTEND = 0.22;
          type BestHit = { dist: number; x: number; y: number; attacker: number; defender: number };
          let best: BestHit | null = null;

          const touchDist = BASE_TOUCH_DIST * clamp(safeCalibration.touchDistScale, 0.6, 1.6);
          const touchSpeed = BASE_TOUCH_SPEED * clamp(safeCalibration.touchSpeedScale, 0.6, 1.6);
          const attackSpeed = BASE_ATTACK_SPEED * clamp(safeCalibration.attackSpeedScale, 0.6, 1.6);
          const measureDist = BASE_MEASURE * clamp(safeCalibration.measureDistScale, 0.6, 1.6);
          const priorityForwardScale = clamp(safeCalibration.priorityForwardScale, 0.6, 1.6);

          const torsoCenter = (lm: typeof res.landmarks[0]) => {
            const pts = [lm[L_SHOULDER], lm[R_SHOULDER], lm[L_HIP], lm[R_HIP]].filter(Boolean);
            if (pts.length < 2) return null;
            const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
            const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
            return { x, y };
          };

          let bestSpeedToward = 0;
          const fencerPositions: { id: number; x: number; y: number }[] = [];
          const centers: { raw: number; x: number; y: number }[] = [];
          for (let i = 0; i < res.landmarks.length; i += 1) {
            const center = torsoCenter(res.landmarks[i]);
            if (center) {
              centers.push({ raw: i, x: center.x, y: center.y });
            }
          }
          const stableMap: Record<number, number> = {};
          if (centers.length >= 2) {
            const sorted = [...centers].sort((a, b) => a.x - b.x);
            stableMap[sorted[0].raw] = 0;
            stableMap[sorted[1].raw] = 1;
            fencerPositions.push(
              { id: 0, x: sorted[0].x * canvas.width, y: sorted[0].y * canvas.height },
              { id: 1, x: sorted[1].x * canvas.width, y: sorted[1].y * canvas.height }
            );
          }
          for (let i = 0; i < res.landmarks.length; i += 1) {
            for (let j = 0; j < res.landmarks.length; j += 1) {
              if (i === j) continue;
              const attacker = res.landmarks[i];
              const defenderCenter = torsoCenter(res.landmarks[j]);
              if (!defenderCenter) continue;
              const prev = lastPoseRef.current;
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
                if (prev && prev.wrists[i]) {
                  const pw = prev.wrists[i][0];
                  if (pw) {
                    const dt = Math.max(0.001, (now - prev.ts) / 1000);
                    const vx = (p.w.x - pw.x) / dt;
                    const vy = (p.w.y - pw.y) / dt;
                    const dxv = defenderCenter.x - p.w.x;
                    const dyv = defenderCenter.y - p.w.y;
                    const inv = 1 / (Math.hypot(dxv, dyv) + 1e-6);
                    const speedToward = vx * (dxv * inv) + vy * (dyv * inv);
                    if (speedToward > bestSpeedToward) bestSpeedToward = speedToward;
                  }
                }
                if (!best || dist < best.dist) {
                  const attackerId = stableMap[i] ?? i;
                  const defenderId = stableMap[j] ?? j;
                  best = { dist, x: tip.x, y: tip.y, attacker: attackerId, defender: defenderId };
                }
              });
            }
          }

          // Distance / measure detection
          if (centers.length >= 2) {
            const sorted = [...centers].sort((a, b) => a.x - b.x);
            const dx = sorted[1].x - sorted[0].x;
            const dy = sorted[1].y - sorted[0].y;
            const dist = Math.hypot(dx, dy);
            distanceLastRef.current = dist;
            const prevAvg = distanceAvgRef.current ?? dist;
            const avg = prevAvg * 0.85 + dist * 0.15;
            distanceAvgRef.current = avg;
            const inMeasure = dist <= measureDist;
            if (flags.measure) {
              if (inMeasure && !inMeasureRef.current && now - lastMeasureEmitRef.current > 800) {
                lastMeasureEmitRef.current = now;
                onEvent?.({
                  id: nextEventId(),
                  type: 'in_measure',
                  timestamp: video.currentTime,
                  confidence: Math.max(0, Math.min(1, 1 - dist / measureDist)),
                  meta: { distance: dist, threshold: measureDist },
                });
              }
            }
            inMeasureRef.current = inMeasure;
          } else {
            inMeasureRef.current = false;
          }

          // Tip tracking overlay (approximate weapon tip)
          if (centers.length >= 2) {
            const colors = ['#3d7fff', '#ef4444'];
            res.landmarks.forEach((lm, rawIdx) => {
              const id = stableMap[rawIdx];
              if (id === undefined) return;
              const w = lm[R_WRIST] || lm[L_WRIST];
              const e = lm[R_ELBOW] || lm[L_ELBOW];
              if (!w || !e) return;
              const dirx = w.x - e.x;
              const diry = w.y - e.y;
              const tip = { x: w.x + dirx * TIP_EXTEND, y: w.y + diry * TIP_EXTEND };
              ctx.beginPath();
              ctx.fillStyle = colors[id] || '#3d7fff';
              ctx.arc(tip.x * canvas.width, tip.y * canvas.height, 3, 0, Math.PI * 2);
              ctx.fill();
            });
          }

          const bestHit = best as BestHit | null;
          if (flags.touch && bestHit && bestHit.dist <= touchDist && bestSpeedToward >= touchSpeed) {
            lastTouchRef.current = {
              ts: now,
              x: bestHit.x * canvas.width,
              y: bestHit.y * canvas.height,
            };
            if (now - lastEventEmitRef.current > 800) {
              lastEventEmitRef.current = now;
              const raw = Math.max(0, Math.min(1, 1 - bestHit.dist / touchDist));
              const prevEma = touchEmaRef.current[bestHit.attacker] || 0;
              const ema = prevEma * 0.6 + raw * 0.4;
              touchEmaRef.current[bestHit.attacker] = ema;
              onEvent?.({
                id: nextEventId(),
                type: 'probable_touch',
                timestamp: video.currentTime,
                confidence: ema,
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

                const stableAttacker = stableMap[i] ?? i;
                const stableDefender = stableMap[j] ?? j;
                const lastEmit = lastAttackEmitRef.current[stableAttacker] || 0;
                const bestPointHit = bestPoint as Point2D | null;
                if (flags.attack && bestPointHit && bestSpeedToward > attackSpeed) {
                  lastAttackEmitRef.current[stableAttacker] = now;
                  lastAnyAttackRef.current = now;
                  lastAttackRef.current = {
                    ts: now,
                    x1: bestPointHit.x * canvas.width,
                    y1: bestPointHit.y * canvas.height,
                    x2: defenderCenter.x * canvas.width,
                    y2: defenderCenter.y * canvas.height,
                  };
                  const rawConfidence = Math.max(0, Math.min(1, bestSpeedToward / (attackSpeed * 2)));
                  const prevEma = attackEmaRef.current[stableAttacker] || 0;
                  const ema = prevEma * 0.7 + rawConfidence * 0.3;
                  attackEmaRef.current[stableAttacker] = ema;
                  const track = attackTrackRef.current[stableAttacker];
                  if (!track) {
                    attackTrackRef.current[stableAttacker] = { start: video.currentTime, last: video.currentTime };
                  } else {
                    track.last = video.currentTime;
                  }

                  if (now - lastEmit > ATTACK_COOLDOWN) {
                    onEvent?.({
                      id: nextEventId(),
                      type: 'attack',
                      timestamp: video.currentTime,
                      confidence: ema,
                      meta: { attacker: stableAttacker, defender: stableDefender, phase: 'start' },
                    });
                    lastAttackStartRef.current[stableAttacker] = {
                      ts: video.currentTime,
                      opponent: stableDefender,
                    };
                    reactionQueueRef.current.push({
                      attacker: stableAttacker,
                      defender: stableDefender,
                      ts: video.currentTime,
                    });
                    const aggr = aggressivenessRef.current[stableAttacker] || { count: 0, last: 0, score: 0 };
                    aggr.count += 1;
                    aggr.last = performance.now();
                    aggr.score = Math.min(1, aggr.count / 12);
                    aggressivenessRef.current[stableAttacker] = aggr;
                  }

                  if (flags.priority) {
                    const pr = priorityRef.current;
                    const shouldSwitch =
                      pr.holder === null ||
                      pr.holder === stableAttacker ||
                      ema > pr.confidence + 0.1 ||
                      (pr.since !== null && now - pr.since > 1200);
                  if (shouldSwitch) {
                    priorityRef.current = { holder: stableAttacker, confidence: ema, since: now };
                    lastPriorityActiveRef.current = now;
                    onPriorityChange?.(priorityRef.current);
                  }
                  }
                }
              }
            }
          }

          // Priority from forward movement (torso moving toward opponent)
          if (flags.priority && prev && centers.length >= 2) {
            const dt = Math.max(0.001, (now - prev.ts) / 1000);
            const scores: { id: number; speedToward: number }[] = [];
            for (let i = 0; i < centers.length; i += 1) {
              const a = centers[i];
              const b = centers[(i + 1) % centers.length];
              const aId = stableMap[a.raw];
              const bId = stableMap[b.raw];
              if (aId === undefined || bId === undefined) continue;
              const prevCenter = prev.centers[aId];
              if (!prevCenter) continue;
              const vx = (a.x - prevCenter.x) / dt;
              const vy = (a.y - prevCenter.y) / dt;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const inv = 1 / (Math.hypot(dx, dy) + 1e-6);
              const speedToward = vx * (dx * inv) + vy * (dy * inv);
              scores.push({ id: aId, speedToward });
            }

            if (scores.length >= 2) {
              scores.sort((a, b) => b.speedToward - a.speedToward);
              const top = scores[0];
              const second = scores[1];
              const FORWARD_MIN = BASE_PRIORITY_FORWARD * priorityForwardScale;
              const DELTA_MIN = 0.06;
              const nowMs = now;
              const shouldTake =
                top.speedToward > FORWARD_MIN &&
                top.speedToward - second.speedToward > DELTA_MIN &&
                (priorityRef.current.holder === null ||
                  top.id !== priorityRef.current.holder &&
                  top.speedToward > second.speedToward + 0.08);
              if (shouldTake) {
                if (nowMs - lastPriorityEmitRef.current > 400) {
                  lastPriorityEmitRef.current = nowMs;
                  priorityRef.current = {
                    holder: top.id,
                    confidence: Math.min(1, (top.speedToward - FORWARD_MIN) / 0.3),
                    since: nowMs,
                  };
                  lastPriorityActiveRef.current = nowMs;
                  onPriorityChange?.(priorityRef.current);
                }
              }
            }
          }

          lastPosePrevRef.current = lastPoseRef.current;
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
            centers: (() => {
              const map: ({ x: number; y: number } | null)[] = [];
              centers.forEach(c => {
                const id = stableMap[c.raw];
                if (id !== undefined) map[id] = { x: c.x, y: c.y };
              });
              return map;
            })(),
          };

          if (onFencerPositions) {
            let visible = fencerPositions;
            if (visible.length >= 2) {
              const a = visible[0];
              const b = visible[1];
              const dx = (a.x - b.x) / canvas.width;
              const dy = (a.y - b.y) / canvas.height;
              const dist = Math.hypot(dx, dy);
              if (dist < 0.15) visible = [];
            } else {
              visible = [];
            }
            if (visible.length >= 2) {
              const ALPHA = 0.2;
              const MAX_JUMP = 0.25;
              const smoothed = visible.map(v => {
                const prev = fencerSmoothRef.current[v.id];
                if (!prev) {
                  fencerSmoothRef.current[v.id] = { x: v.x, y: v.y };
                  return v;
                }
                const dxp = (v.x - prev.x) / canvas.width;
                const dyp = (v.y - prev.y) / canvas.height;
                const jump = Math.hypot(dxp, dyp);
                if (jump > MAX_JUMP) {
                  fencerSmoothRef.current[v.id] = { x: v.x, y: v.y };
                  return v;
                }
                const nx = prev.x + (v.x - prev.x) * ALPHA;
                const ny = prev.y + (v.y - prev.y) * ALPHA;
                fencerSmoothRef.current[v.id] = { x: nx, y: ny };
                return { ...v, x: nx, y: ny };
              });
              onFencerPositions(smoothed);
            } else {
              onFencerPositions([]);
            }
          }

          // Stance + forward foot (approx): compare ankles x positions
          const L_ANKLE = 27;
          const R_ANKLE = 28;
          const currentCenters: Record<number, { x: number; y: number }> = {};
          centers.forEach(c => {
            const id = stableMap[c.raw];
            if (id === undefined) return;
            const lm = res.landmarks[c.raw];
            const lA = lm[L_ANKLE];
            const rA = lm[R_ANKLE];
            if (!lA || !rA) return;
            const forward: 'L' | 'R' = lA.x < rA.x ? 'L' : 'R';
            const prevC = prevCentersRef.current[id];
            const speed = prevC ? Math.hypot(c.x - prevC.x, c.y - prevC.y) * 30 : 0;
            stanceRef.current[id] = { forward, speed };
            currentCenters[id] = { x: c.x, y: c.y };
          });
          currentCentersRef.current = currentCenters;
        } else {
          if (onFencerPositions) onFencerPositions([]);
          fencerSmoothRef.current = {};
          distanceAvgRef.current = null;
          distanceLastRef.current = null;
          inMeasureRef.current = false;
          currentCentersRef.current = null;
          prevCentersRef.current = {};
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
        const { x1, y1, x2, y2 } = lastAttackRef.current;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len;
        const ny = dy / len;
        const head = 10;
        const wing = 6;
        ctx.beginPath();
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 3;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = '#f97316';
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - nx * head + -ny * wing, y2 - ny * head + nx * wing);
        ctx.lineTo(x2 - nx * head - -ny * wing, y2 - ny * head - nx * wing);
        ctx.closePath();
        ctx.fill();
      }

      // Tactical overlay: direction arrows and intent lines
      if (flags.tactics && lastPoseRef.current && lastPoseRef.current.centers.length >= 2) {
        const drawArrow = (x: number, y: number, dx: number, dy: number, color: string) => {
          const len = Math.hypot(dx, dy);
          if (len < 6) return;
          const nx = dx / len;
          const ny = dy / len;
          const head = 8;
          const wing = 5;
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.moveTo(x, y);
          ctx.lineTo(x + dx, y + dy);
          ctx.stroke();
          ctx.beginPath();
          ctx.fillStyle = color;
          ctx.moveTo(x + dx, y + dy);
          ctx.lineTo(x + dx - nx * head + -ny * wing, y + dy - ny * head + nx * wing);
          ctx.lineTo(x + dx - nx * head - -ny * wing, y + dy - ny * head - nx * wing);
          ctx.closePath();
          ctx.fill();
        };

        const centers = lastPoseRef.current.centers;
        const prev = prevCentersRef.current;
        const prevPose = lastPosePrevRef.current;
        const dt = Math.max(0.001, ((lastPoseRef.current.ts || now) - (prevPose?.ts || now - 66)) / 1000);
        const colors = ['#3d7fff', '#ef4444'];
        centers.forEach((c, id) => {
          if (!c) return;
          const p = prev[id];
          if (!p) return;
          const vx = (c.x - p.x) / dt;
          const vy = (c.y - p.y) / dt;
          const speed = Math.hypot(vx, vy);
          if (speed < 0.02) return;
          const scale = Math.min(90, Math.max(25, speed * 160));
          drawArrow(c.x * canvas.width, c.y * canvas.height, vx * scale, vy * scale, colors[id] || '#3d7fff');
        });
      }

      if (currentCentersRef.current) {
        prevCentersRef.current = currentCentersRef.current;
        currentCentersRef.current = null;
      }

      // Close attack segments after a short inactivity
      const ATTACK_END_GAP = 0.35;
      const ATTACK_MIN_DUR = 0.2;
      Object.entries(attackTrackRef.current).forEach(([key, seg]) => {
        const id = Number(key);
        if (video.currentTime - seg.last > ATTACK_END_GAP) {
          const duration = Math.max(0, seg.last - seg.start);
          if (duration >= ATTACK_MIN_DUR) {
            onEvent?.({
              id: nextEventId(),
              type: 'attack',
              timestamp: seg.start,
              confidence: attackEmaRef.current[id] || 0.5,
              meta: { attacker: id, duration, phase: 'segment' },
            });
          }
          delete attackTrackRef.current[id];
        }
      });

      if (flags.priority && priorityRef.current.holder !== null && now - lastPriorityActiveRef.current > 2000) {
        priorityRef.current = { holder: null, confidence: 0, since: null };
        onPriorityChange?.(priorityRef.current);
      }

      // Reaction times: defender attack after attacker
      if (reactionQueueRef.current.length) {
        const latest = reactionQueueRef.current[0];
        const defenderStart = lastAttackStartRef.current[latest.defender];
        if (defenderStart && (video.currentTime - latest.ts) < 2) {
          const ms = (defenderStart.ts - latest.ts) * 1000;
          if (ms > 80 && ms < 2000) {
            reactionTimesRef.current.push({
              attacker: latest.attacker,
              defender: latest.defender,
              ms,
              ts: video.currentTime,
            });
            reactionQueueRef.current.shift();
          }
        } else if ((video.currentTime - latest.ts) >= 2) {
          reactionQueueRef.current.shift();
        }
      }

      if (onMetrics) {
        const reactionTimes = reactionTimesRef.current.slice(-10);
        const stance = Object.entries(stanceRef.current).map(([id, s]) => ({
          id: Number(id),
          forward: s.forward,
          speed: s.speed,
        }));
        const aggressiveness = Object.entries(aggressivenessRef.current).map(([id, a]) => ({
          id: Number(id),
          score: a.score,
        }));
        const distance = distanceAvgRef.current !== null
          ? {
            value: distanceLastRef.current ?? distanceAvgRef.current,
            avg: distanceAvgRef.current,
            inMeasure: inMeasureRef.current,
            threshold: BASE_MEASURE * clamp(safeCalibration.measureDistScale, 0.6, 1.6),
          }
          : undefined;
        onMetrics({ reactionTimes, stance, aggressiveness, distance });
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [enabled, ready, modes, flags, calibration, videoRef, canvasRef, onEvent, onPriorityChange, onFencerPositions, onMetrics]);

  return { ready, error };
}
