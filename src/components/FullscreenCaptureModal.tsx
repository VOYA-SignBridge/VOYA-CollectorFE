import { useEffect, useRef, useState, useCallback } from "react";
import { Holistic, POSE_CONNECTIONS } from "@mediapipe/holistic";
import { Camera } from "@mediapipe/camera_utils";
import * as drawing from "@mediapipe/drawing_utils";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import type { MediaPipeLandmark } from "../types";

interface FullscreenCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSampleCapture: (frames: Array<{
    pose: MediaPipeLandmark[];
    face: MediaPipeLandmark[];
    left_hand: MediaPipeLandmark[];
    right_hand: MediaPipeLandmark[];
  }>, label: string, user: string) => void;
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
  
  const [recording, setRecording] = useState(false);
  const [frames, setFrames] = useState<Array<{
    pose: MediaPipeLandmark[];
    face: MediaPipeLandmark[];
    left_hand: MediaPipeLandmark[];
    right_hand: MediaPipeLandmark[];
  }>>([]);
  const [label, setLabel] = useState(initialLabel);
  const [user, setUser] = useState(initialUser);
  const [countdown, setCountdown] = useState(0);
  const [isReady, setIsReady] = useState(false);
  
  // New state for capture management
  const [currentCaptureIndex, setCurrentCaptureIndex] = useState(0);
  const [completedCaptures, setCompletedCaptures] = useState(0);
  
  // Refs to prevent stale closures
  const recordingRef = useRef(false);
  const framesRef = useRef<Array<{
    pose: MediaPipeLandmark[];
    face: MediaPipeLandmark[];
    left_hand: MediaPipeLandmark[];
    right_hand: MediaPipeLandmark[];
  }>>([]);
  
  // Update refs when state changes
  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);
  
  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  // Quick labels for fast selection
  const quickLabels = [
    "walking", "running", "sitting", "standing", 
    "jumping", "waving", "pointing", "clapping",
    "dancing", "stretching", "exercising", "resting"
  ];

  // Handlers
  const handleQuickCapture = useCallback(() => {
    if (!label || !user) return;
    // Reset capture state
    setFrames([]);
    framesRef.current = [];
    setCurrentCaptureIndex(0);
    setCompletedCaptures(0);
    setCountdown(3);
    
    setTimeout(() => {
      setRecording(true);
      recordingRef.current = true;
    }, 3000);
  }, [label, user]);

  const handleStop = useCallback(() => {
    setRecording(false);
    recordingRef.current = false;
    
    if (framesRef.current.length > 0) {
      onSampleCapture(framesRef.current, label, user);
      setFrames([]);
      framesRef.current = [];
    }
  }, [label, user, onSampleCapture]);

  // Separate function to handle capture completion
  const processFrameCapture = useCallback((results: {
    poseLandmarks?: MediaPipeLandmark[];
    faceLandmarks?: MediaPipeLandmark[];
    leftHandLandmarks?: MediaPipeLandmark[];
    rightHandLandmarks?: MediaPipeLandmark[];
  }) => {
    if (!recordingRef.current) return;

    const landmarks = {
      pose: results.poseLandmarks || [],
      face: results.faceLandmarks || [],
      left_hand: results.leftHandLandmarks || [],
      right_hand: results.rightHandLandmarks || [],
    };

    // Update frames using refs to prevent stale closures
    framesRef.current = [...framesRef.current, landmarks];
    setFrames(prev => [...prev, landmarks]);

    // Check if target reached
    if (framesRef.current.length >= targetFrames) {
      setRecording(false);
      recordingRef.current = false;
      
      // Process current capture
      const capturedFrames = [...framesRef.current];
      onSampleCapture(capturedFrames, label, user);
      
      setCompletedCaptures(prev => {
        const newCompleted = prev + 1;
        if (newCompleted < captureCount) {
          // More captures needed - reset for next capture
          setCurrentCaptureIndex(newCompleted);
          setFrames([]);
          framesRef.current = [];
          
          // Auto-start next capture after 2 seconds
          setTimeout(() => {
            setCountdown(3);
            setTimeout(() => {
              setRecording(true);
              recordingRef.current = true;
            }, 3000);
          }, 2000);
        }
        return newCompleted;
      });
    }
  }, [targetFrames, captureCount, label, user, onSampleCapture]);

  const handleClose = useCallback(() => {
    setRecording(false);
    setFrames([]);
    setCountdown(0);
    setIsReady(false);
    setCurrentCaptureIndex(0);
    setCompletedCaptures(0);
    
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

  useEffect(() => {
    if (!isOpen) return;

    const holistic = new Holistic({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
    });

    holistic.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      refineFaceLandmarks: false,
    });

    holistic.onResults((results) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

      // Draw pose landmarks
      drawing.drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: "#00FF00", lineWidth: 3 });
      drawing.drawLandmarks(ctx, results.leftHandLandmarks, { color: "#FF0000", radius: 5 });
      drawing.drawLandmarks(ctx, results.rightHandLandmarks, { color: "#0000FF", radius: 5 });

      // Use processFrameCapture for better performance
      processFrameCapture(results);
    });

    if (videoRef.current) {
      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (videoRef.current) {
            await holistic.send({ image: videoRef.current });
          }
        },
        width: 1280,
        height: 720,
      });
      
      cameraRef.current = camera;
      camera.start().then(() => setIsReady(true));
    }

    return () => {
      holistic.close();
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
    };
  }, [isOpen, processFrameCapture]);

  // Countdown effect
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && recording) {
      // Auto-stop after 5 seconds
      const timer = setTimeout(() => handleStop(), 5000);
      return () => clearTimeout(timer);
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
      if (e.code === 'Space') {
        e.preventDefault();
        if (!recording && label && user) {
          handleQuickCapture();
        } else if (recording) {
          handleStop();
        }
      } else if (e.code === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, recording, label, user, handleClose, handleQuickCapture, handleStop]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black">
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
              Press <kbd className="px-2 py-1 bg-gray-700 rounded text-xs">Space</kbd> to capture • <kbd className="px-2 py-1 bg-gray-700 rounded text-xs">Esc</kbd> to exit
            </div>
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
            className="max-w-full max-h-full object-contain"
          />
          
          {/* Pose Guide Overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative">
              <div className="border-4 border-green-400/60 w-80 h-80 rounded-2xl bg-green-400/5 backdrop-blur-sm"></div>
              <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg">
                🎯 Position yourself here
              </div>
            </div>
          </div>

          {/* Countdown Overlay */}
          {countdown > 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="text-center text-white">
                <div className="text-8xl font-bold mb-4 animate-pulse">{countdown}</div>
                <div className="text-2xl mb-2">Get ready to perform:</div>
                <div className="text-3xl font-semibold text-green-400">{label}</div>
              </div>
            </div>
          )}

          {/* Recording Indicator */}
          {recording && (
            <div className="absolute top-24 left-6 flex items-center space-x-3 bg-red-500 text-white px-4 py-2 rounded-full shadow-lg">
              <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
              <span className="font-medium">RECORDING</span>
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
            {/* Form Fields */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Action Label</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g., walking, jumping"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={recording || countdown > 0}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">User ID</label>
                <input
                  type="text"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="e.g., user001"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={recording || countdown > 0}
                />
              </div>
            </div>

            {/* Quick Labels */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">🏷️ Quick Labels</label>
              <div className="grid grid-cols-2 gap-2">
                {quickLabels.map((quickLabel) => (
                  <button
                    key={quickLabel}
                    onClick={() => setLabel(quickLabel)}
                    disabled={recording || countdown > 0}
                    className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                      label === quickLabel
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {quickLabel}
                  </button>
                ))}
              </div>
            </div>

            {/* Recording Stats */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-300 mb-3">📊 Capture Settings & Progress</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-400">
                  <span>Target frames:</span>
                  <span className="text-white">{targetFrames}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Total captures:</span>
                  <span className="text-white">{captureCount}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Current capture:</span>
                  <span className="text-white">{currentCaptureIndex + 1}/{captureCount}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Completed:</span>
                  <span className="text-white">{completedCaptures}/{captureCount}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Current frames:</span>
                  <span className="text-white">{frames.length}/{targetFrames}</span>
                </div>
                {frames.length > 0 && (
                  <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min((frames.length / targetFrames) * 100, 100)}%` }}
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
                Start Capture (Space)
              </Button>
            ) : (
              <Button
                onClick={handleStop}
                className="w-full py-4 text-lg font-medium"
                variant="danger"
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
        </div>
      </div>
    </div>
  );
}