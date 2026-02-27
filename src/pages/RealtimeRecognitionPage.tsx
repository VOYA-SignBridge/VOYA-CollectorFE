import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hands, HAND_CONNECTIONS } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";
import * as drawing from "@mediapipe/drawing_utils";
import PageHeader from "../components/ui/PageHeader";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import type { MediaPipeLandmark } from "../types";
import { FRAME_INTERVAL_MS } from "../config/capture";
import { getInferenceModelStatus, predictFeatures } from "../api/inference";

const parseBoolEnv = (value: unknown, fallback: boolean) => {
  if (typeof value !== "string") return fallback;
  const v = value.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return fallback;
};

const MIRROR_PREVIEW = parseBoolEnv(import.meta.env.VITE_MIRROR_PREVIEW, true);
const SWAP_HANDEDNESS = parseBoolEnv(import.meta.env.VITE_SWAP_HANDEDNESS, false);

// Keep CDN asset version aligned with pinned npm dependency.
const MP_HANDS_VERSION = "0.4.1675469240";

type HandPair = {
  left?: MediaPipeLandmark[];
  right?: MediaPipeLandmark[];
};

const SEQ_LEN = 60; // backend currently expects 60
const FEATURE_DIM = 126; // 2 hands * 21 points * (x,y,z)
const HAND_VEC_DIM = 63;

function landmarksToHandVec(hand?: MediaPipeLandmark[] | null): number[] {
  if (!hand || hand.length === 0) return new Array(HAND_VEC_DIM).fill(0);
  const out: number[] = [];
  for (let i = 0; i < 21; i++) {
    const lm = hand[i];
    out.push(lm?.x ?? 0, lm?.y ?? 0, lm?.z ?? 0);
  }
  // Ensure length exactly 63
  while (out.length < HAND_VEC_DIM) out.push(0);
  return out.slice(0, HAND_VEC_DIM);
}

function handPairToFeatureVec(pair: HandPair): number[] {
  const left = landmarksToHandVec(pair.left);
  const right = landmarksToHandVec(pair.right);
  const vec = left.concat(right);
  // Ensure 126
  while (vec.length < FEATURE_DIM) vec.push(0);
  return vec.slice(0, FEATURE_DIM);
}

export default function RealtimeRecognitionPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const viewRef = useRef<HTMLDivElement | null>(null);

  const [running, setRunning] = useState(false);
  const [autoPredict, setAutoPredict] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraSessionKey, setCameraSessionKey] = useState(0);
  const [windowCount, setWindowCount] = useState(0);
  const [handPresent, setHandPresent] = useState(false);
  const [, setMotionLevel] = useState(0);
  const [noHandMessage, setNoHandMessage] = useState<string | null>(null);

  const [modelStatus, setModelStatus] = useState<{
    loaded?: boolean;
    model_id?: string;
    sequence_length?: number;
    feature_dim?: number;
    preprocess_version?: string;
    status?: string;
    error?: string;
  } | null>(null);

  const topK = 1;
  const [bestText, setBestText] = useState<string>("");
  const [bestConfidence, setBestConfidence] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const stableRef = useRef<{
    label: string;
    score: number;
    candidate: string;
    candidateScore: number;
    candidateCount: number;
  }>({ label: "", score: 0, candidate: "", candidateScore: 0, candidateCount: 0 });

  const featureWindowRef = useRef<number[][]>([]);
  const lastFrameTimeRef = useRef(0);
  const inFlightPredictRef = useRef(false);
  const runningSinceRef = useRef<number>(0);
  const lastHandSeenAtRef = useRef<number>(0);
  const prevVecRef = useRef<number[] | null>(null);
  const motionEmaRef = useRef<number>(0);
  const motionUiThrottleRef = useRef<number>(0);

  // Short hold-last-good to reduce flicker when a hand disappears briefly
  const lastGoodHandsRef = useRef<{ left?: MediaPipeLandmark[]; right?: MediaPipeLandmark[]; t: number }>({ t: 0 });
  const HOLD_MS = 250;

  const makeZeroVec = useCallback(() => new Array(FEATURE_DIM).fill(0), []);

  const padOrTrimWindow = useCallback(
    (win: number[][]) => {
      const out = win.map((row) => {
        const r = Array.isArray(row) ? row.slice(0, FEATURE_DIM) : [];
        while (r.length < FEATURE_DIM) r.push(0);
        // sanitize NaN/Infinity
        for (let i = 0; i < r.length; i++) {
          const v = r[i];
          r[i] = Number.isFinite(v) ? v : 0;
        }
        return r;
      });
      if (out.length > SEQ_LEN) return out.slice(-SEQ_LEN);
      while (out.length < SEQ_LEN) out.unshift(makeZeroVec());
      return out;
    },
    [makeZeroVec]
  );

  const refreshModelStatus = useCallback(async () => {
    const res = await getInferenceModelStatus();
    if (res.ok) {
      const d = res.data;
      setModelStatus({
        loaded: Boolean(d.loaded),
        model_id: String(d.model_id ?? ""),
        sequence_length: typeof d.sequence_length === "number" ? d.sequence_length : undefined,
        feature_dim: typeof d.feature_dim === "number" ? d.feature_dim : undefined,
        preprocess_version: d.preprocess_version ? String(d.preprocess_version) : undefined,
        status: d.status ? String(d.status) : undefined,
        error: d.error ? String(d.error) : undefined,
      });
      return;
    }
    setModelStatus({ status: "error", error: res.error });
  }, []);

  const resetWindow = useCallback(() => {
    featureWindowRef.current = [];
    setLatencyMs(null);
    setBestText("");
    setBestConfidence(null);
    stableRef.current = { label: "", score: 0, candidate: "", candidateScore: 0, candidateCount: 0 };
    setWindowCount(0);
    prevVecRef.current = null;
    motionEmaRef.current = 0;
    setMotionLevel(0);
  }, []);

  const reloadCamera = useCallback(() => {
    resetWindow();
    setError(null);
    setAutoPredict(true);
    setRunning(true);
    setCameraSessionKey((k) => k + 1);
  }, [resetWindow]);

  const nextWord = useCallback(() => {
    // Start a fresh 60-frame window without restarting the camera.
    resetWindow();
    setError(null);
    setRunning(true);
    runningSinceRef.current = Date.now();
  }, [resetWindow]);

  const updateStableBest = useCallback((newLabel: string, newScore: number) => {
    const SWITCH_COUNT = 2; // require repeated frames before switching labels
    const STRONG_MARGIN = 0.08; // if new label is much stronger, switch sooner
    const EMA = 0.35;

    const s = stableRef.current;

    if (!s.label) {
      s.label = newLabel;
      s.score = newScore;
      s.candidate = "";
      s.candidateScore = 0;
      s.candidateCount = 0;
      setBestText(newLabel);
      setBestConfidence(newScore);
      return;
    }

    if (newLabel === s.label) {
      s.score = s.score * (1 - EMA) + newScore * EMA;
      s.candidate = "";
      s.candidateScore = 0;
      s.candidateCount = 0;
      setBestText(s.label);
      setBestConfidence(s.score);
      return;
    }

    if (newLabel === s.candidate) {
      s.candidateCount += 1;
      s.candidateScore = s.candidateScore * (1 - EMA) + newScore * EMA;
    } else {
      s.candidate = newLabel;
      s.candidateScore = newScore;
      s.candidateCount = 1;
    }

    const shouldSwitch =
      (s.candidateCount >= SWITCH_COUNT && s.candidateScore > s.score + STRONG_MARGIN) ||
      s.candidateCount >= 3;

    if (shouldSwitch) {
      s.label = s.candidate;
      s.score = s.candidateScore;
      s.candidate = "";
      s.candidateScore = 0;
      s.candidateCount = 0;
      setBestText(s.label);
      setBestConfidence(s.score);
    }
  }, []);

  const runPredictOnce = useCallback(async (force = false) => {
    if (inFlightPredictRef.current) return;

    // Practical gating to avoid predicting on idle/empty frames.
    const now = Date.now();
    const filled = featureWindowRef.current.length >= SEQ_LEN;
    const recentlySawHand = now - lastHandSeenAtRef.current <= 700;

    // Motion is computed over feature vectors; small = idle.
    const MIN_MOTION = 0.0012;
    const movingEnough = motionEmaRef.current >= MIN_MOTION;

    // Warm-up after starting to avoid immediate (wrong) prediction.
    const warmedUp = now - runningSinceRef.current >= 900;

    // Never predict if we don't see hands (even for manual predict).
    if (!recentlySawHand) {
      setNoHandMessage("Không phát hiện tay. Vui lòng đưa tay vào khung hình.");
      return;
    }

    if (!force) {
      if (!filled || !movingEnough || !warmedUp) return;
    }

    const windowCopy = padOrTrimWindow(featureWindowRef.current);
    inFlightPredictRef.current = true;
    try {
      const res = await predictFeatures(windowCopy, topK);
      if (!res.ok) {
        setError(res.error);
        return;
      }

      const top = Array.isArray(res.data.top_k) ? res.data.top_k : [];
      const pred = res.data.prediction ?? top[0];
      if (pred) {
        const labelText =
          (pred.label_original ? String(pred.label_original) : "") ||
          (pred.slug ? String(pred.slug) : "") ||
          `#${Number(pred.index)}`;
        const score = Number(pred.confidence);
        // Extra guard: don't lock in very weak predictions.
        const MIN_CONF = 0.35;
        if (labelText && Number.isFinite(score) && score >= MIN_CONF) updateStableBest(labelText, score);
      }

      const total = res.data.timing_ms && typeof res.data.timing_ms.total === "number" ? res.data.timing_ms.total : null;
      setLatencyMs(total);
    } finally {
      inFlightPredictRef.current = false;
    }
  }, [padOrTrimWindow, topK, updateStableBest]);

  const render = useCallback((image: HTMLImageElement | HTMLVideoElement, left?: MediaPipeLandmark[], right?: MediaPipeLandmark[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    if (MIRROR_PREVIEW) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    if (left && left.length > 0) {
      // @ts-expect-error - mediapipe types are not bundled
      drawing.drawConnectors(ctx, left, HAND_CONNECTIONS, { color: "#FF6B35", lineWidth: 2 });
      drawing.drawLandmarks(ctx, left, { color: "#FF6B35", radius: 4 });
    }
    if (right && right.length > 0) {
      // @ts-expect-error - mediapipe types are not bundled
      drawing.drawConnectors(ctx, right, HAND_CONNECTIONS, { color: "#4ECDC4", lineWidth: 2 });
      drawing.drawLandmarks(ctx, right, { color: "#4ECDC4", radius: 4 });
    }
    ctx.restore();
  }, []);

  const onHandsResults = useCallback(
    (results: unknown) => {
      const r = results as {
        multiHandLandmarks?: MediaPipeLandmark[][];
        multiHandedness?: Array<{ label?: string; score?: number }>;
        image?: HTMLImageElement | HTMLVideoElement;
      };

      let left: MediaPipeLandmark[] | undefined;
      let right: MediaPipeLandmark[] | undefined;

      if (r.multiHandLandmarks && r.multiHandedness && r.multiHandLandmarks.length === r.multiHandedness.length) {
        for (let i = 0; i < r.multiHandLandmarks.length; i++) {
          const lm = r.multiHandLandmarks[i] as MediaPipeLandmark[];
          const h = r.multiHandedness[i] as { label?: string };
          const rawLabel = h.label;
          const effectiveLabel = SWAP_HANDEDNESS
            ? rawLabel === "Left"
              ? "Right"
              : rawLabel === "Right"
              ? "Left"
              : rawLabel
            : rawLabel;

          if (effectiveLabel === "Left" && !left) left = lm;
          if (effectiveLabel === "Right" && !right) right = lm;
        }
      }

      // hold-last-good for short dropouts
      const now = Date.now();
      const hasAnyRaw = (left?.length ?? 0) > 0 || (right?.length ?? 0) > 0;
      if (hasAnyRaw) lastHandSeenAtRef.current = now;

      // Keep UI indicator reactive but not too spammy
      if (now - motionUiThrottleRef.current > 120) {
        setHandPresent(hasAnyRaw);
        motionUiThrottleRef.current = now;
      }

      const hasAny = hasAnyRaw;
      if (hasAny) {
        lastGoodHandsRef.current = { left, right, t: now };
      } else if (now - lastGoodHandsRef.current.t <= HOLD_MS) {
        left = lastGoodHandsRef.current.left;
        right = lastGoodHandsRef.current.right;
      }

      if (r.image) {
        render(r.image, left, right);
      }

      if (!running) return;

      const currentTime = Date.now();
      if (currentTime - lastFrameTimeRef.current < FRAME_INTERVAL_MS) return;
      lastFrameTimeRef.current = currentTime;

      // Always push a frame (use last-good/zeros) so we can reach 60 frames quickly
      const vec = handPairToFeatureVec({ left, right });
      if (vec.length !== FEATURE_DIM) return;

      // Motion estimate (avg abs delta); helps avoid predicting while idle.
      if (prevVecRef.current) {
        let sum = 0;
        for (let i = 0; i < FEATURE_DIM; i++) {
          sum += Math.abs(vec[i] - prevVecRef.current[i]);
        }
        const diff = sum / FEATURE_DIM;
        const ema = motionEmaRef.current * 0.8 + diff * 0.2;
        motionEmaRef.current = hasAnyRaw ? ema : ema * 0.9;
      }
      prevVecRef.current = vec;

      // Update motion UI at a low rate
      if (now - motionUiThrottleRef.current > 120) {
        setMotionLevel((prev) => {
          const next = motionEmaRef.current;
          return Math.abs(prev - next) < 1e-6 ? prev : next;
        });
      }

      // User-facing message (debounced)
      setNoHandMessage((prev) => {
        if (!hasAnyRaw) return prev || "Không phát hiện tay. Vui lòng đưa tay vào khung hình.";
        return null;
      });

      featureWindowRef.current.push(vec);
      if (featureWindowRef.current.length > SEQ_LEN) {
        featureWindowRef.current.splice(0, featureWindowRef.current.length - SEQ_LEN);
      }

      // keep UI progress reactive (avoid rerender per-frame by only updating when changed)
      const nextCount = featureWindowRef.current.length;
      setWindowCount((prev) => (prev === nextCount ? prev : nextCount));
    },
    [render, running]
  );

  const canPredict = useMemo(() => {
    const st = modelStatus;
    if (!st) return true;
    if (st.loaded === false) return false;
    if (typeof st.sequence_length === "number" && st.sequence_length !== SEQ_LEN) return false;
    if (typeof st.feature_dim === "number" && st.feature_dim !== FEATURE_DIM) return false;
    return true;
  }, [modelStatus]);

  useEffect(() => {
    void refreshModelStatus();
  }, [refreshModelStatus]);

  useEffect(() => {
    // Setup camera + mediapipe once, keep it mounted while on the page.
    const video = videoRef.current;
    if (!video) return;

    const hands = new Hands({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${MP_HANDS_VERSION}/${file}`,
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.7,
    });

    hands.onResults(onHandsResults);

    const cam = new Camera(video, {
      onFrame: async () => {
        try {
          await hands.send({ image: video });
        } catch (e) {
          // Ignore occasional send errors during teardown
          if (import.meta.env.DEV) console.debug("[realtime] hands.send error", e);
        }
      },
      width: 1280,
      height: 720,
    });

    cameraRef.current = cam;

    const syncCanvasToVideo = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      canvas.width = w;
      canvas.height = h;
    };

    video.addEventListener("loadedmetadata", syncCanvasToVideo);

    // Start camera immediately; user toggles `running` to start window fill/predict.
    cam
      .start()
      .then(() => {
        setError(null);
        syncCanvasToVideo();
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg || "Unable to start camera");
      });

    return () => {
      video.removeEventListener("loadedmetadata", syncCanvasToVideo);
      try {
        cam.stop();
      } catch {
        // ignore
      }
      try {
        hands.close();
      } catch {
        // ignore
      }
    };
  }, [onHandsResults, cameraSessionKey]);

  // Fullscreen tracking
  useEffect(() => {
    const onFs = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await viewRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Fullscreen failed");
    }
  }, []);

  // Continuous prediction loop (controlled + throttled)
  useEffect(() => {
    if (!running || !autoPredict) return;
    if (!canPredict) return;

    const intervalMs = 450;
    const id = window.setInterval(() => {
      void runPredictOnce(false);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [autoPredict, canPredict, runPredictOnce, running]);

  const manualPredict = useCallback(async () => {
    if (!canPredict) {
      setError("Model/input spec mismatch (check /api/inference/model)");
      return;
    }
    await runPredictOnce(true);
  }, [canPredict, runPredictOnce]);

  const modelBadge = useMemo(() => {
    const st = modelStatus;
    if (!st) return <Badge variant="warning">Model: unknown</Badge>;
    if (st.loaded) return <Badge variant="success">Model: {st.model_id || "loaded"}</Badge>;
    return <Badge variant="danger">Model: not ready</Badge>;
  }, [modelStatus]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nhận diện Real-time"
        subtitle={undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {modelBadge}
            <Badge variant={running ? "success" : "info"}>{running ? "Đang chạy" : "Đã dừng"}</Badge>
            <Badge variant={autoPredict ? "success" : "warning"}>{autoPredict ? "Auto predict" : "Manual"}</Badge>
            <Button size="sm" variant="secondary" onClick={toggleFullscreen}>
              {isFullscreen ? "Thoát full" : "Full screen"}
            </Button>
          </div>
        }
      />

      {error && (
        <div className="card border border-red-200 bg-red-50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-semibold text-red-800">Lỗi</div>
              <div className="text-sm text-red-700 break-words">{error}</div>
            </div>
            <button className="text-sm text-red-700 underline" onClick={() => setError(null)}>
              Đóng
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 card p-0 overflow-hidden" ref={viewRef}>
          <div className={"relative w-full " + (isFullscreen ? "h-screen" : "h-[78vh]") }>
            <video ref={videoRef} className="hidden" playsInline autoPlay muted />
            <canvas ref={canvasRef} className="w-full h-full bg-black object-contain" />

            <div className="absolute left-3 top-3 flex flex-col gap-2">
              <Badge variant="info">Window: {windowCount}/{SEQ_LEN}</Badge>
              <Badge variant={handPresent ? "success" : "warning"}>{handPresent ? "Có tay" : "Chưa thấy tay"}</Badge>
              {latencyMs !== null && <Badge variant="success">Latency: {latencyMs}ms</Badge>}
            </div>

            {/* Best-result overlay */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-3 w-[min(720px,95%)]">
              <div className="bg-white/85 backdrop-blur border border-slate-200 rounded-xl px-4 py-3 shadow">
                <div className="text-xs text-slate-600">Kết quả tốt nhất</div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xl font-semibold text-slate-900 truncate">
                    {bestText || "(chưa có)"}
                  </div>
                  {bestConfidence !== null && (
                    <div className="text-sm font-semibold tabular-nums text-slate-700">
                      {(bestConfidence * 100).toFixed(1)}%
                    </div>
                  )}
                </div>
                {noHandMessage && (
                  <div className="mt-2 text-sm font-medium text-amber-900 bg-amber-100/80 border border-amber-200 rounded-lg px-3 py-2">
                    {noHandMessage}
                  </div>
                )}
              </div>
            </div>

            <div className="absolute right-3 top-3 flex flex-col gap-2 items-end">
              <Button
                size="sm"
                variant={running ? "secondary" : "primary"}
                onClick={() => {
                  setRunning((v) => {
                    const next = !v;
                    if (next) {
                      runningSinceRef.current = Date.now();
                    }
                    return next;
                  });
                  setError(null);
                }}
              >
                {running ? "Dừng" : "Bắt đầu"}
              </Button>
              <Button size="sm" variant="primary" onClick={nextWord}>
                Từ tiếp theo
              </Button>
              <Button size="sm" variant="secondary" onClick={reloadCamera}>
                Reload camera
              </Button>
              <Button size="sm" variant="secondary" onClick={toggleFullscreen}>
                {isFullscreen ? "Thoát full" : "Full screen"}
              </Button>
            </div>
          </div>
        </div>

        {/* Hide the sidebar in fullscreen for maximum camera area */}
        {!isFullscreen && (
          <div className="lg:col-span-1 card space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-gray-900">Điều khiển</div>
            <button className="text-sm underline text-gray-600" onClick={refreshModelStatus}>
              Refresh model
            </button>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-gray-600">Kết quả tốt nhất</div>
            <input
              className="w-full border rounded-lg px-3 py-2 text-base font-semibold"
              value={bestText}
              readOnly
              placeholder="(chưa có)"
            />
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">
                {bestConfidence !== null ? `Độ tin cậy: ${(bestConfidence * 100).toFixed(1)}%` : ""}
              </div>
              <button
                className="text-xs underline text-gray-600"
                onClick={() => {
                  if (bestText) void navigator.clipboard?.writeText(bestText);
                }}
              >
                Copy
              </button>
            </div>
          </div>

          <div className="space-y-2 text-sm text-gray-700">
            <div className="flex items-center justify-between">
              <span>Auto predict</span>
              <input type="checkbox" checked={autoPredict} onChange={(e) => setAutoPredict(e.target.checked)} />
            </div>
          </div>

          <div className="pt-2 border-t">
            <Button
              variant="primary"
              className="w-full"
              onClick={manualPredict}
              disabled={!canPredict}
            >
              Dự đoán ngay
            </Button>
            {!canPredict && (
              <div className="mt-2 text-xs text-red-700">
                Model spec không khớp (mở /api/inference/model để kiểm tra)
              </div>
            )}
          </div>

          </div>
        )}
      </div>

      <div className="card text-sm text-gray-600">
        <div className="font-semibold text-gray-900 mb-1">Ghi chú</div>
        <ul className="list-disc pl-5 space-y-1">
          <li>Mỗi frame tạo vector 126 chiều: (Left hand 63) + (Right hand 63).</li>
          <li>Window luôn đủ 60 frame (tự pad/trim) để nhận diện liên tục.</li>
          <li>Nếu backend yêu cầu spec khác, cập nhật ở models/active/model_manifest.json.</li>
        </ul>
      </div>
    </div>
  );
}
