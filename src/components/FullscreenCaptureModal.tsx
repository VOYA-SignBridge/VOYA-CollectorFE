import { useEffect, useRef, useState, useCallback } from "react";
import { Holistic, POSE_CONNECTIONS, HAND_CONNECTIONS } from "@mediapipe/holistic";
import { Camera } from "@mediapipe/camera_utils";
import * as drawing from "@mediapipe/drawing_utils";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import type { MediaPipeLandmark, CameraInfo, QualityInfo } from "../types";
import { OneEuroFilter } from "../utils/oneEuro";
import { TARGET_FRAMES, CAPTURE_COUNT } from "../config/capture";

// Use module-scope fixed constants so they are stable across renders and
// won't need to be added to hook dependency arrays.
const FIXED_TARGET_FRAMES = TARGET_FRAMES;
const FIXED_CAPTURE_COUNT = CAPTURE_COUNT;

interface FullscreenCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSampleCapture: (frames: Array<{
    pose: MediaPipeLandmark[];
    face: MediaPipeLandmark[];
    left_hand: MediaPipeLandmark[];
    right_hand: MediaPipeLandmark[];
  }>, label: string, user: string, meta?: { camera_info?: CameraInfo; quality_info?: QualityInfo; dialect?: string }) => void;
  initialLabel?: string;
  initialUser?: string;
  targetFrames?: number;
  captureCount?: number;
}

export default function FullscreenCaptureModal({ 
  isOpen, 
  onClose, 
  onSampleCapture,
  initialLabel = "",
  initialUser = "",
  targetFrames = 60,
  captureCount = 1
}: FullscreenCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  
  const [recording, setRecording] = useState(false);
  const [frames, setFrames] = useState<Array<{
    pose: MediaPipeLandmark[];
    face: MediaPipeLandmark[];
    left_hand: MediaPipeLandmark[];
    right_hand: MediaPipeLandmark[];
  }>>([]);
  const [label, setLabel] = useState(initialLabel);
  const [user, setUser] = useState(initialUser);
  const [dialect, setDialect] = useState<string>("Bắc");
  const [dialectList, setDialectList] = useState<string[]>(["Bắc", "Trung", "Nam"]);
  const [countdown, setCountdown] = useState(0);
  const [isReady, setIsReady] = useState(false);
  
  // New state for capture management
  const [currentCaptureIndex, setCurrentCaptureIndex] = useState(0);
  const [completedCaptures, setCompletedCaptures] = useState(0);
  const [showTips, setShowTips] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  // Track whether hands are currently visible to gate frame capture
  const [handsVisible, setHandsVisible] = useState(false);
  
  // Refs to prevent stale closures
  const recordingRef = useRef(false);
  const framesRef = useRef<Array<{
    pose: MediaPipeLandmark[];
    face: MediaPipeLandmark[];
    left_hand: MediaPipeLandmark[];
    right_hand: MediaPipeLandmark[];
  }>>([]);
  
  // Add frame interval control for better training data
  const lastFrameTimeRef = useRef(0);
  const frameIntervalMs = useRef(100); // Default 100ms = 10 FPS, good for training

  // Helper to compute lightweight quality metrics for a captured frameset
  const computeQuality = useCallback((capturedFrames: Array<{
    pose: MediaPipeLandmark[];
    face: MediaPipeLandmark[];
    left_hand: MediaPipeLandmark[];
    right_hand: MediaPipeLandmark[];
  }>) => {
    let totalPoseLandmarks = 0;
    let framesWithHands = 0;
    let framesAccepted = 0;
    let confidenceSum = 0;
    let confidenceCount = 0;

    for (const f of capturedFrames) {
      const poseCount = (f.pose || []).length;
      totalPoseLandmarks += poseCount;
      const hasHands = (f.left_hand && f.left_hand.length > 0) || (f.right_hand && f.right_hand.length > 0);
      if (hasHands) framesWithHands++;

      // approximate confidence if landmark has visibility field
      const landmarks = [...(f.pose || []), ...(f.left_hand || []), ...(f.right_hand || []), ...(f.face || [])];
      let frameConfSum = 0;
      let frameConfCnt = 0;
      for (const lm of landmarks) {
        if (typeof lm.visibility === 'number') {
          frameConfSum += lm.visibility;
          frameConfCnt++;
        }
      }
      if (frameConfCnt > 0) {
        confidenceSum += frameConfSum;
        confidenceCount += frameConfCnt;
      }
      // Simple client-side acceptance: require at least 1 pose landmark
      if (poseCount > 0) framesAccepted++;
    }

    const quality: QualityInfo = {
      framesCollected: capturedFrames.length,
      framesAccepted,
      avgPoseLandmarksPerFrame: capturedFrames.length ? totalPoseLandmarks / capturedFrames.length : 0,
      percentFramesWithHands: capturedFrames.length ? (framesWithHands / capturedFrames.length) * 100 : 0,
      confidenceSummary: confidenceCount ? { avg: confidenceSum / confidenceCount } : undefined,
    };

    return quality;
  // FIXED_CAPTURE_COUNT and FIXED_TARGET_FRAMES are stable module constants; disable exhaustive-deps warning
  // FIXED_CAPTURE_COUNT and FIXED_TARGET_FRAMES are module-level constants and do not change at runtime.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Add canvas rendering optimization
  const pendingRenderRef = useRef(false);
  const renderDataRef = useRef<{
    poseLandmarks?: MediaPipeLandmark[];
    leftHandLandmarks?: MediaPipeLandmark[];
    rightHandLandmarks?: MediaPipeLandmark[];
    image?: HTMLImageElement | HTMLVideoElement;
  } | null>(null);

  // Filters for smoothing landmarks (keyed by group.index.coord)
  const filtersRef = useRef<Record<string, OneEuroFilter>>({});

  // Fixed filter parameters for simplified public uploader
  const filterMinCutoff = 1.0; // higher = more responsive, less smoothing
  const filterBeta = 0.01; // higher = more adaptive to speed
  // Render smoothing (lerp) - higher = more immediate (0.0 very smooth, 1.0 raw)
  const renderAlpha = 0.85;

  const getFilter = useCallback((key: string) => {
    if (!filtersRef.current[key]) {
      // create using live params
      filtersRef.current[key] = new OneEuroFilter(30, filterMinCutoff, filterBeta, 1.0);
    }
    return filtersRef.current[key];
  }, []);

  const filterLandmarks = useCallback((landmarks: MediaPipeLandmark[] | undefined, group = 'pose') => {
    if (!landmarks) return [] as MediaPipeLandmark[];
    const now = Date.now();
    return landmarks.map((lm, idx) => {
      const kx = `${group}.${idx}.x`;
      const ky = `${group}.${idx}.y`;
      const kz = `${group}.${idx}.z`;
      const kv = `${group}.${idx}.v`;
      const fx = getFilter(kx).filter(lm.x ?? 0, now);
      const fy = getFilter(ky).filter(lm.y ?? 0, now);
      const fz = getFilter(kz).filter(lm.z ?? 0, now);
      const fv = typeof lm.visibility === 'number' ? getFilter(kv).filter(lm.visibility, now) : lm.visibility;
      return { ...lm, x: fx, y: fy, z: fz, visibility: fv } as MediaPipeLandmark;
    });
  }, [getFilter]);

  // Filters use fixed parameters in this simplified modal; no dynamic clearing required

  // Low-latency render state (lerp towards raw each frame) to reduce perceived lag
  const renderPrevRef = useRef<Record<string, MediaPipeLandmark>>({});

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const getRenderLandmarks = useCallback((raw: MediaPipeLandmark[] | undefined, group = 'pose') => {
    if (!raw) return [] as MediaPipeLandmark[];
    const prev = renderPrevRef.current;
    const alpha = Math.max(0, Math.min(1, renderAlpha));
    return raw.map((lm, idx) => {
      const key = `${group}.${idx}`;
      const prevLm = prev[key];
      const tx = lm.x ?? 0;
      const ty = lm.y ?? 0;
      const tz = lm.z ?? 0;
      const tv = typeof lm.visibility === 'number' ? lm.visibility : undefined;
      if (!prevLm) {
        const newLm = { ...lm } as MediaPipeLandmark;
        prev[key] = newLm;
        return newLm;
      }
      const nx = lerp(prevLm.x ?? tx, tx, alpha);
      const ny = lerp(prevLm.y ?? ty, ty, alpha);
      const nz = lerp(prevLm.z ?? tz, tz, alpha);
      const nv = typeof tv === 'number' ? lerp((prevLm.visibility as number) ?? tv, tv, alpha) : (prevLm.visibility as number | undefined);
      const out: MediaPipeLandmark = { ...lm, x: nx, y: ny, z: nz, visibility: typeof nv === 'number' ? nv : undefined };
      prev[key] = out;
      return out;
    });
  }, [renderAlpha]);

  // Optimized rendering function
  const renderLandmarks = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const data = renderDataRef.current;
    
    if (!canvas || !data) return;
    
    const ctx = canvas.getContext("2d", { alpha: false }); // Disable alpha for performance
    if (!ctx) return;

    // Clear and draw video
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (video && video.readyState >= 2 && video.videoWidth > 0) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else if (data.image) {
      ctx.drawImage(data.image, 0, 0, canvas.width, canvas.height);
    }

    // Draw landmarks with simplified styling for better performance
    if (data.poseLandmarks) {
      drawing.drawConnectors(ctx, data.poseLandmarks, POSE_CONNECTIONS, { 
        color: "#00FF88", 
        lineWidth: 2 // Slightly thicker for visibility
      });
      drawing.drawLandmarks(ctx, data.poseLandmarks, { 
        color: "#00FF88", 
        radius: 4 // Larger for visibility
      });
    }
    
    if (data.leftHandLandmarks) {
      drawing.drawConnectors(ctx, data.leftHandLandmarks, HAND_CONNECTIONS, { 
        color: "#FF6B35", 
        lineWidth: 2 
      });
      drawing.drawLandmarks(ctx, data.leftHandLandmarks, { 
        color: "#FF6B35", 
        radius: 5 
      });
    }
    
    if (data.rightHandLandmarks) {
      drawing.drawConnectors(ctx, data.rightHandLandmarks, HAND_CONNECTIONS, { 
        color: "#4ECDC4", 
        lineWidth: 2 
      });
      drawing.drawLandmarks(ctx, data.rightHandLandmarks, { 
        color: "#4ECDC4", 
        radius: 5 
      });
    }
    
    pendingRenderRef.current = false;
  }, []);
  const labelRef = useRef(label);
  const userRef = useRef(user);
  const dialectRef = useRef(dialect);
  const targetFramesRef = useRef(targetFrames);
  const captureCountRef = useRef(captureCount);
  const onSampleCaptureRef = useRef(onSampleCapture);
  const handleCloseRef = useRef<() => void>(() => {});
  const completedCapturesRef = useRef(0);

  const handleClose = useCallback(() => {
    // If recording or there are partial frames, confirm before closing
    const partialFrames = framesRef.current?.length || 0;
    if (recordingRef.current || (partialFrames > 0 && partialFrames < targetFramesRef.current)) {
      const ok = window.confirm(`Capture chưa hoàn tất (${partialFrames}/${targetFramesRef.current}) — bạn có muốn thoát và bỏ dữ liệu này không?`);
      if (!ok) return;
    }

    setRecording(false);
    setFrames([]);
    setCountdown(0);
    setIsReady(false);
    setCurrentCaptureIndex(0);
    setCompletedCaptures(0);
    
    // Exit browser fullscreen if active
    try {
      if (document.fullscreenElement) {
        // Requesting exit may return a promise
        document.exitFullscreen?.();
      }
    } catch (e) {
      // ignore fullscreen exit errors
    }

    // Stop camera and close video stream
    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }
    
    // Stop video tracks
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    
    onClose();
  }, [onClose]);

  // Request fullscreen when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const root = rootRef.current;
    if (!root) return;

    // Try to enter browser fullscreen for the modal container
    try {
      // Vendor-prefixed fullscreen methods may exist on HTMLElement in some browsers
  type Fn = (...args: unknown[]) => unknown;
  const el = root as HTMLElement & Partial<Record<'webkitRequestFullscreen' | 'mozRequestFullScreen' | 'msRequestFullscreen' | 'requestFullscreen', Fn>>;
  const request = (el.requestFullscreen as Fn | undefined) ?? el.webkitRequestFullscreen ?? el.mozRequestFullScreen ?? el.msRequestFullscreen;
      if (request) {
        const maybe = request.call(el);
        if (maybe && typeof (maybe as Promise<unknown>).catch === 'function') {
          (maybe as Promise<unknown>).catch((err) => {
            console.warn('Fullscreen request failed:', err);
          });
        }
      }
    } catch (err) {
      // ignore
    }

    // When modal closes, ensure we exit fullscreen in cleanup
    return () => {
      try {
        if (document.fullscreenElement) {
          document.exitFullscreen?.();
        }
      } catch (e) {
        // ignore
      }
    };
  }, [isOpen]);
  
  // Update refs when state changes
  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);
  
  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  useEffect(() => {
    labelRef.current = label;
  }, [label]);

  useEffect(() => {
    dialectRef.current = dialect;
  }, [dialect]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    console.log('Component mounted with props:', { targetFrames, captureCount, initialLabel, initialUser });
    console.log('Initial targetFramesRef.current:', targetFramesRef.current);
  }, [targetFrames, captureCount, initialLabel, initialUser]);

  useEffect(() => {
    // Enforce fixed target frames for simplified UI
    targetFramesRef.current = FIXED_TARGET_FRAMES;
    console.log('targetFramesRef enforced to fixed value:', targetFramesRef.current);
  }, [targetFrames]);

  useEffect(() => {
    // Enforce fixed capture count for simplified UI
    captureCountRef.current = FIXED_CAPTURE_COUNT;
    console.log('captureCountRef enforced to fixed value:', captureCountRef.current);
  }, [captureCount]);

  useEffect(() => {
    onSampleCaptureRef.current = onSampleCapture;
  }, [onSampleCapture]);

  // Load persisted dialects & selection
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('dialectList') || 'null');
      if (Array.isArray(stored) && stored.length > 0) setDialectList(stored);
      const storedSel = localStorage.getItem('dialectSelected');
      if (storedSel) setDialect(storedSel);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    handleCloseRef.current = handleClose;
  }, [handleClose]);

  useEffect(() => {
    completedCapturesRef.current = completedCaptures;
    console.log('completedCapturesRef updated to:', completedCaptures);
  }, [completedCaptures]);

  // Quick labels for fast selection
  // quickLabels removed for simplified public uploader

  // Handlers
  const handleQuickCapture = useCallback(() => {
    if (!labelRef.current || !userRef.current) return;
    // Reset capture state
    setFrames([]);
    framesRef.current = [];
    setCurrentCaptureIndex(0);
    setCompletedCaptures(0);
    completedCapturesRef.current = 0;
    
    // Reset frame timing
    lastFrameTimeRef.current = 0;
    
    setCountdown(3);
    
  console.log(`Starting capture sequence: ${FIXED_CAPTURE_COUNT} captures of ${FIXED_TARGET_FRAMES} frames each`);
    
    setTimeout(() => {
          setRecording(true);
          recordingRef.current = true;
          lastFrameTimeRef.current = Date.now(); // Start timing from recording start
    }, 3000);
  // FIXED_CAPTURE_COUNT and FIXED_TARGET_FRAMES are stable module constants and
  // intentionally omitted from dependencies to avoid unnecessary re-creations.
  }, []);

  const handleStop = useCallback(() => {
    const collected = framesRef.current.length || 0;
    const required = targetFramesRef.current || 0;

    if (collected < required) {
      // Block stopping early — inform the user to continue until enough frames
      window.alert(`Bạn chưa thu đủ khung hình: ${collected}/${required}. Vui lòng tiếp tục quay cho đến khi đủ.`);
      return;
    }

    setRecording(false);
    recordingRef.current = false;

      if (framesRef.current.length > 0) {
      const quality = computeQuality(framesRef.current);
      onSampleCaptureRef.current(framesRef.current, labelRef.current, userRef.current, { quality_info: quality, dialect: dialectRef.current });
      setFrames([]);
      framesRef.current = [];
    }
  }, [computeQuality]);

  useEffect(() => {
    if (!isOpen) return;

    console.log('Setting up camera and MediaPipe...');

    const holistic = new Holistic({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
    });

    holistic.setOptions({
      modelComplexity: 0, // Reduce from 1 to 0 for faster processing
      smoothLandmarks: false, // Disable smoothing for real-time responsiveness
      refineFaceLandmarks: false,
      enableSegmentation: false, // Disable segmentation for better performance
      smoothSegmentation: false,
      minDetectionConfidence: 0.7, // Increase detection threshold
      minTrackingConfidence: 0.7, // Increase tracking threshold
    });

    console.log('MediaPipe Holistic initialized');

    holistic.onResults((results) => {
      // For rendering use a low-latency lerp of raw landmarks (keeps UI responsive)
      const renderPose = getRenderLandmarks(results.poseLandmarks, 'pose');
      const renderLeft = getRenderLandmarks(results.leftHandLandmarks, 'leftHand');
      const renderRight = getRenderLandmarks(results.rightHandLandmarks, 'rightHand');

      // Store render data and schedule optimized rendering (render uses lerped landmarks)
      renderDataRef.current = {
        poseLandmarks: renderPose,
        leftHandLandmarks: renderLeft,
        rightHandLandmarks: renderRight,
        image: results.image as HTMLImageElement | HTMLVideoElement
      };
      
      // Use RAF for smooth rendering
      if (!pendingRenderRef.current) {
        pendingRenderRef.current = true;
        requestAnimationFrame(renderLandmarks);
      }

      // Process frame capture directly here to avoid dependency issues
      if (recordingRef.current) {
        const currentTime = Date.now();
        
        // Check if enough time has passed since last frame capture
        if (currentTime - lastFrameTimeRef.current < frameIntervalMs.current) {
          return; // Skip this frame to maintain consistent interval
        }
        
        lastFrameTimeRef.current = currentTime;
        console.log(`Capturing frame at ${currentTime}, interval: ${frameIntervalMs.current}ms`);
        
          // Determine if hands are visible using visibility or presence
          const leftHas = (results.leftHandLandmarks && results.leftHandLandmarks.length > 0);
          const rightHas = (results.rightHandLandmarks && results.rightHandLandmarks.length > 0);

          // If visibility field exists, require at least one landmark with visibility >= 0.5
          let leftVisible = false;
          let rightVisible = false;
          if (results.leftHandLandmarks) {
            leftVisible = results.leftHandLandmarks.some(lm => typeof lm.visibility === 'number' ? lm.visibility >= 0.5 : true);
          }
          if (results.rightHandLandmarks) {
            rightVisible = results.rightHandLandmarks.some(lm => typeof lm.visibility === 'number' ? lm.visibility >= 0.5 : true);
          }

          const anyHands = leftHas || rightHas;
          const anyVisible = leftVisible || rightVisible;

          // Update UI hint
          setHandsVisible(anyVisible || anyHands);

          // Only capture frames when a hand is present/visible
          if (!(anyVisible || anyHands)) {
            // Skip storing this frame
            console.log('Skipping frame: no hands detected');
          } else {
            const landmarks = {
              pose: filterLandmarks(results.poseLandmarks, 'pose') || [],
              face: results.faceLandmarks || [],
              left_hand: filterLandmarks(results.leftHandLandmarks, 'leftHand') || [],
              right_hand: filterLandmarks(results.rightHandLandmarks, 'rightHand') || [],
            };

            // Directly update refs without causing state updates during recording
            framesRef.current.push(landmarks);
          }
        
        // Update UI every frame (smoother feedback for training)
        setFrames([...framesRef.current]);
        
        // Debug current progress
        console.log(`Recording progress: ${framesRef.current.length}/${targetFramesRef.current} frames`);
        
        // Check if target reached
        console.log(`Frame check: ${framesRef.current.length} >= ${FIXED_TARGET_FRAMES}?`, framesRef.current.length >= FIXED_TARGET_FRAMES);
        if (framesRef.current.length >= FIXED_TARGET_FRAMES) {
          console.log('Target frames reached, stopping recording');
          recordingRef.current = false;
          setRecording(false);
          
          // Process current capture
          const capturedFrames = [...framesRef.current];

          // Compute lightweight quality metrics for this capture
          const quality = computeQuality(capturedFrames);
          const newCompleted = completedCapturesRef.current + 1;
          
          console.log(`Capture ${newCompleted} completed with ${capturedFrames.length} frames`);
          
          // Send capture data immediately
          onSampleCaptureRef.current(capturedFrames, labelRef.current, userRef.current, { quality_info: quality, dialect: dialectRef.current });
          
          // Update completed count
          completedCapturesRef.current = newCompleted;
          setCompletedCaptures(newCompleted);
          setCurrentCaptureIndex(newCompleted);
          
          console.log('Current capture stats:', {
            newCompleted,
            captureCountRefCurrent: captureCountRef.current,
            shouldContinue: newCompleted < captureCountRef.current
          });
          
          if (newCompleted < FIXED_CAPTURE_COUNT) {
            // More captures needed - reset for next capture
            console.log(`Preparing capture ${newCompleted + 1} of ${FIXED_CAPTURE_COUNT}`);
            setFrames([]);
            framesRef.current = [];
            
            // Reset frame timing for next capture
            lastFrameTimeRef.current = 0;
            
            // Auto-start next capture after 2 seconds
            setTimeout(() => {
              console.log(`Starting countdown for capture ${newCompleted + 1}`);
              setCountdown(3);
              setTimeout(() => {
                console.log(`Recording capture ${newCompleted + 1}`);
                setRecording(true);
                recordingRef.current = true;
                lastFrameTimeRef.current = Date.now(); // Start timing for new capture
              }, 3000);
            }, 2000);
          } else {
            // All captures completed, close modal
            console.log(`All ${newCompleted} captures completed, closing modal`);
            setTimeout(() => {
              console.log('Attempting to close modal');
              handleCloseRef.current?.();
            }, 1000);
          }
        }
      }
    });

    if (videoRef.current) {
      console.log('Video element found, setting up camera...');
      
      // Setup canvas size once
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 1280;
        canvas.height = 720;
        console.log('Canvas initialized to 1280x720');
      }
      
      // Add video event listeners for debugging
      const video = videoRef.current;
      
      const onLoadedMetadata = () => {
        console.log('Video metadata loaded:', {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState
        });
      };
      
      const onCanPlay = () => {
        console.log('Video can play:', {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState
        });
      };

      video.addEventListener('loadedmetadata', onLoadedMetadata);
      video.addEventListener('canplay', onCanPlay);

      console.log('Creating camera instance...');
      
      // Check camera permissions first
      navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: 1280, 
          height: 720,
          frameRate: { ideal: 30, max: 60 } // Optimize camera FPS
        } 
      })
        .then((stream) => {
          console.log('Camera permission granted, stream:', stream);
          // Stop the test stream
          stream.getTracks().forEach(track => track.stop());
          
          // Now create the MediaPipe camera
          const camera = new Camera(videoRef.current!, {
            onFrame: async () => {
              if (videoRef.current) {
                await holistic.send({ image: videoRef.current });
              }
            },
            width: 1280,
            height: 720,
            facingMode: 'user' // Ensure front camera for better performance
          });
          
          cameraRef.current = camera;
          console.log('Starting camera...');
          camera.start().then(() => {
            console.log('Camera started successfully! Video element:', {
              videoWidth: videoRef.current?.videoWidth,
              videoHeight: videoRef.current?.videoHeight,
              readyState: videoRef.current?.readyState,
              srcObject: !!videoRef.current?.srcObject
            });
            setIsReady(true);
          }).catch((error) => {
            console.error('Camera start failed:', error);
            setIsReady(false);
          });
        })
        .catch((error) => {
          console.error('Camera permission denied or not available:', error);
          setIsReady(false);
        });

      // Cleanup listeners
      return () => {
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('canplay', onCanPlay);
        holistic.close();
        if (cameraRef.current) {
          cameraRef.current.stop();
          cameraRef.current = null;
        }
      };
    }

    return () => {
      holistic.close();
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
    };
  // FIXED_CAPTURE_COUNT and FIXED_TARGET_FRAMES are stable module constants and
  // intentionally omitted from dependencies.
  }, [isOpen, renderLandmarks, computeQuality, filterLandmarks, getRenderLandmarks]); // Include renderLandmarks, computeQuality, filterLandmarks and getRenderLandmarks

  // Countdown effect
  useEffect(() => {
    console.log('Countdown effect triggered:', countdown, 'recording:', recording);
    if (countdown > 0) {
      console.log(`Countdown: ${countdown}`);
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && recording) {
      console.log('Countdown finished, recording started');
      // Remove auto-timeout - let frame completion logic handle stopping
      console.log('Recording started, waiting for frame completion...');
      
      // Backup timeout only if frame completion fails (much longer)
      const backupTimer = setTimeout(() => {
        console.warn('BACKUP TIMEOUT: Frame completion failed after 30 seconds');
        handleStop();
      }, 30000);
      return () => clearTimeout(backupTimer);
    }
  }, [countdown, recording, handleStop]);

  // Cleanup on unmount
  useEffect(() => {
    const currentCamera = cameraRef.current;
    const currentVideo = videoRef.current;
    
    return () => {
      // Cleanup when component unmounts
      if (currentCamera) {
        currentCamera.stop();
      }
      if (currentVideo && currentVideo.srcObject) {
        const stream = currentVideo.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when user is typing in an input/textarea or editable element
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
        return;
      }

      console.log('Key pressed:', e.code);

      if (e.code === 'Enter') {
        e.preventDefault();
        console.log('Enter pressed - recording:', recordingRef.current, 'label:', labelRef.current, 'user:', userRef.current);
        if (!recordingRef.current && labelRef.current && userRef.current) {
          // Inline quick capture logic
          setFrames([]);
          framesRef.current = [];
          setCurrentCaptureIndex(0);
          setCompletedCaptures(0);
          completedCapturesRef.current = 0;
          setCountdown(3);
          
          console.log(`Starting capture sequence: ${captureCountRef.current} captures of ${targetFramesRef.current} frames each`);
          
          setTimeout(() => {
            setRecording(true);
            recordingRef.current = true;
          }, 3000);
        } else if (recordingRef.current) {
          // Inline stop logic — enforce target frames before allowing stop
          const collected = framesRef.current.length || 0;
          const required = targetFramesRef.current || 0;
          if (collected < required) {
            window.alert(`Bạn chưa thu đủ khung hình: ${collected}/${required}. Vui lòng tiếp tục quay cho đến khi đủ.`);
          } else {
            setRecording(false);
            recordingRef.current = false;

            if (framesRef.current.length > 0) {
              const quality = computeQuality(framesRef.current);
              onSampleCaptureRef.current(framesRef.current, labelRef.current, userRef.current, { quality_info: quality, dialect: dialectRef.current });
              setFrames([]);
              framesRef.current = [];
            }
          }
        }
      } else if (e.code === 'Escape') {
        console.log('Escape pressed - closing modal');
        handleCloseRef.current?.();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, computeQuality]);

  if (!isOpen) return null;

  console.log('FullscreenCaptureModal rendered, isReady:', isReady, 'recording:', recording, 'countdown:', countdown);

  return (
    <div ref={rootRef} className="fixed inset-0 z-[9999] bg-black">
      {/* Header Bar */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-black/80 backdrop-blur-sm border-b border-gray-700">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-semibold text-white">🎬 Fullscreen Capture</h2>
            {isReady && (
              <Badge variant="success">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-2"></span>
                Camera Ready
              </Badge>
            )}
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-white text-sm">
              Press <kbd className="px-2 py-1 bg-gray-700 rounded text-xs">Enter</kbd> to capture • <kbd className="px-2 py-1 bg-gray-700 rounded text-xs">Esc</kbd> to exit
            </div>
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center space-x-2"
            >
              <span>{showGuide ? '🙈' : '👁️'}</span>
              <span>{showGuide ? 'Hide Guide' : 'Show Guide'}</span>
            </button>
            <button
              onClick={handleClose}
              className="text-white hover:text-gray-300 p-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="h-full flex">
        {/* Camera Feed */}
        <div className="flex-1 relative flex items-center justify-center bg-gray-900">
          <video ref={videoRef} autoPlay muted className="hidden" />
          <canvas 
            ref={canvasRef} 
            width={1280} 
            height={720} 
            className="w-full h-full max-w-full max-h-full object-contain border border-gray-600 rounded-lg"
            style={{ minHeight: '400px', backgroundColor: '#1a1a1a' }}
            onLoad={() => console.log('Canvas loaded')}
          />

          {/* Hint overlay when hands are not visible during recording */}
          {recording && !handsVisible && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-black/70 text-yellow-300 px-4 py-2 rounded-lg text-center">
                <div className="font-semibold">Không thấy tay — vui lòng hiển thị cả hai tay</div>
                <div className="text-xs mt-1">Hệ thống sẽ chỉ lưu khung khi tay được phát hiện</div>
              </div>
            </div>
          )}
          
          {/* Toggle Guide Overlay - Only show when enabled and not recording/countdown */}
          {showGuide && !recording && countdown === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative">
                {/* Compact guide frame - just corner markers */}
                <div className="w-80 h-80 relative">
                  {/* Corner markers only */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-green-400/80 rounded-tl-xl"></div>
                  <div className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-green-400/80 rounded-tr-xl"></div>
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-green-400/80 rounded-bl-xl"></div>
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-green-400/80 rounded-br-xl"></div>
                  
                  {/* Center crosshair */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-1 h-8 bg-green-400/60 rounded-full"></div>
                    <div className="absolute w-8 h-1 bg-green-400/60 rounded-full"></div>
                  </div>
                  
                  {/* Hand position indicators - small and subtle */}
                  <div className="absolute top-16 -left-6 w-8 h-8 border border-orange-400/60 rounded-full bg-orange-400/10 flex items-center justify-center">
                    <span className="text-orange-400 text-xs">L</span>
                  </div>
                  <div className="absolute top-16 -right-6 w-8 h-8 border border-teal-400/60 rounded-full bg-teal-400/10 flex items-center justify-center">
                    <span className="text-teal-400 text-xs">R</span>
                  </div>
                </div>
                
                {/* Minimal instruction */}
                <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-gray-800/80 backdrop-blur-sm text-white px-4 py-2 rounded-lg text-sm font-medium">
                  🎯 Position yourself in frame
                </div>
                
                {/* Quality tip */}
                <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-gray-800/70 backdrop-blur-sm text-white px-3 py-1 rounded-lg text-xs">
                  Upper body + hands visible
                </div>
              </div>
            </div>
          )}

          {/* Countdown Overlay */}
          {countdown > 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="text-center text-white">
                <div className="text-8xl font-bold mb-4 animate-pulse">{countdown}</div>
                <div className="text-2xl mb-2">Get ready to perform:</div>
                <div className="text-3xl font-semibold text-green-400">{label}</div>
                {captureCount > 1 && (
                  <div className="text-lg mt-4 text-gray-300">
                    Capture {currentCaptureIndex + 1} of {FIXED_CAPTURE_COUNT}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Between Captures Overlay */}
          {!recording && !countdown && completedCaptures > 0 && completedCaptures < captureCount && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="text-center text-white">
                <div className="text-4xl mb-4">🎉</div>
                <div className="text-2xl font-bold mb-2 text-green-400">Capture {completedCaptures} Complete!</div>
                <div className="text-xl mb-4">Preparing next capture...</div>
                <div className="text-lg text-gray-300">
                  Progress: {completedCaptures} / {FIXED_CAPTURE_COUNT}
                </div>
                <div className="w-64 bg-gray-700 rounded-full h-3 mt-4 mx-auto">
                  <div 
                    className="bg-green-500 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${(completedCaptures / captureCount) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Completion Overlay */}
          {!recording && !countdown && completedCaptures > 0 && completedCaptures >= captureCount && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="text-center text-white">
                <div className="text-6xl mb-4">✅</div>
                <div className="text-3xl font-bold mb-2 text-green-400">All Captures Complete!</div>
                <div className="text-xl mb-4">{completedCaptures} samples of "{label}" captured</div>
                <div className="text-lg text-gray-300">Closing modal...</div>
              </div>
            </div>
          )}

          {/* Recording Indicator */}
          {recording && (
            <div className="absolute top-24 left-6 flex items-center space-x-3 bg-red-500 text-white px-4 py-2 rounded-full shadow-lg">
              <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
              <span className="font-medium">RECORDING</span>
              {FIXED_CAPTURE_COUNT > 1 && (
                <span className="text-sm">({completedCaptures + 1}/{FIXED_CAPTURE_COUNT})</span>
              )}
            </div>
          )}

          {/* Recording Progress */}
          {recording && (
            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-black/50 backdrop-blur-sm rounded-full px-6 py-2">
              <div className="text-white text-sm">
                📊 {frames.length} frames captured
              </div>
            </div>
          )}
        </div>

        {/* Control Panel */}
        <div className="w-80 bg-gray-900 border-l border-gray-700 flex flex-col">
          <div className="flex-1 p-6 space-y-6 overflow-y-auto">
            {/* Enhanced Form Fields with validation */}
            <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 rounded-xl p-5 border border-blue-500/20">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <span className="w-3 h-3 bg-blue-400 rounded-full mr-3"></span>
                Capture Setup
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-blue-300 mb-2">📝 Action Label *</label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g., walking, jumping, waving"
                    className="w-full px-4 py-3 bg-gray-800/80 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                    disabled={recording || countdown > 0}
                  />
                  {!label && (
                    <p className="text-xs text-yellow-400 mt-1">⚠️ Action label is required</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-blue-300 mb-2">👤 User ID *</label>
                  <input
                    type="text"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    placeholder="e.g., user001, john_doe"
                    className="w-full px-4 py-3 bg-gray-800/80 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                    disabled={recording || countdown > 0}
                  />
                  {!user && (
                    <p className="text-xs text-yellow-400 mt-1">⚠️ User ID is required</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-blue-300 mb-2">🗂️ Bộ ngôn ngữ (Dialect)</label>
                  <select
                    value={dialect}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'Khác') {
                        const name = window.prompt('Nhập tên bộ mới:');
                        if (name && name.trim()) {
                          const updated = Array.from(new Set([...dialectList, name.trim()]));
                          setDialectList(updated);
                          setDialect(name.trim());
                          localStorage.setItem('dialectList', JSON.stringify(updated));
                          localStorage.setItem('dialectSelected', name.trim());
                        }
                      } else {
                        setDialect(v);
                        localStorage.setItem('dialectSelected', v);
                      }
                    }}
                    className="w-full px-4 py-3 bg-gray-800/80 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                    disabled={recording || countdown > 0}
                  >
                    {dialectList.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                    <option value="Khác">Khác (thêm mới)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Quick labels removed for public-facing modal to simplify UX */}

            {/* Recording Stats */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-300 mb-3">📊 Capture Settings & Progress</h4>
              <div className="space-y-2 text-sm">
                {/* Capture settings removed for simplified public uploader; defaults are enforced. */}
                <div className="flex justify-between text-gray-400">
                  <span>Total captures:</span>
                  <span className="text-white">{FIXED_CAPTURE_COUNT}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Current capture:</span>
                  <span className="text-white">{currentCaptureIndex + 1}/{FIXED_CAPTURE_COUNT}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Completed:</span>
                  <span className="text-white">{completedCaptures}/{FIXED_CAPTURE_COUNT}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Current frames:</span>
                  <span className="text-white">{frames.length}/{FIXED_TARGET_FRAMES}</span>
                </div>
                {frames.length > 0 && (
                  <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min((frames.length / FIXED_TARGET_FRAMES) * 100, 100)}%` }}
                    />
                  </div>
                )}
                <div className="flex justify-between text-gray-400">
                  <span>Status:</span>
                  <Badge variant={recording ? "danger" : isReady ? "success" : "warning"} size="sm">
                    {recording ? "Recording" : isReady ? "Ready" : "Loading"}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="p-6 border-t border-gray-700 space-y-3">
            {countdown > 0 ? (
              <div className="w-full py-4 bg-yellow-600 text-white rounded-lg text-center font-medium">
                Starting in {countdown}...
              </div>
            ) : !recording ? (
              <Button
                onClick={handleQuickCapture}
                disabled={!label || !user || !isReady}
                className="w-full py-4 text-lg font-medium"
                variant="primary"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {FIXED_CAPTURE_COUNT > 1 ? `Start Captures (${FIXED_CAPTURE_COUNT}x)` : 'Start Capture'} (Enter)
              </Button>
            ) : (
              <Button
                onClick={handleStop}
                className="w-full py-4 text-lg font-medium"
                variant="danger"
                disabled={frames.length < FIXED_TARGET_FRAMES}
                title={frames.length < FIXED_TARGET_FRAMES ? `Need ${FIXED_TARGET_FRAMES} frames before stopping` : undefined}
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9h6v6H9z" />
                </svg>
                Stop Recording
              </Button>
            )}
            
            <Button
              onClick={handleClose}
              className="w-full"
              variant="secondary"
            >
              Exit Fullscreen
            </Button>
          </div>

          {/* Collapsible Tips Footer */}
          <div className="bg-gray-800 border-t border-gray-700 p-4">
            <button
              onClick={() => setShowTips(!showTips)}
              className="w-full flex items-center justify-between text-sm font-medium text-gray-300 hover:text-white transition-colors"
            >
              <span>💡 Quick Tips for Best Results</span>
              <span className="text-xs">{showTips ? '🔽' : '▶️'}</span>
            </button>
            
            {showTips && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-400">
                <div>✨ Ensure good lighting and clear background</div>
                <div>🤲 Keep hands visible and fingers extended</div>
                <div>👁️ Use "Show Guide" button for positioning help</div>
                <div>🔗 Watch hand connections for better tracking</div>
                <div>🎯 Stay centered in the camera view</div>
                <div>⚡ Move naturally for best results</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}