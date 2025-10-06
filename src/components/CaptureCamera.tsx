import { useState } from "react";
import type { Sample as SampleT, SessionStats, MediaPipeLandmark } from "../types";
import { uploadCamera } from "../api/upload";
import CaptureGuide from "./CaptureGuide";
import SessionPanel from "./SessionPanel";
import SessionSummary from "./SessionSumary";
import FullscreenCaptureModal from "./FullscreenCaptureModal";
import Button from "./ui/Button";

type Props = {
  onError?: (msg: string) => void;
};

export default function CaptureCamera({ onError }: Props) {
  // Removed frames state - now using only fullscreen capture
  const [label, setLabel] = useState("");
  const [user] = useState("user1");
  const [showGuide, setShowGuide] = useState(false);
  // Removed preview state - using fullscreen capture only
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // New capture settings
  const [targetFrames, setTargetFrames] = useState(30); // Default 30 frames (~1 second at 30fps)
  const [captureCount, setCaptureCount] = useState(1); // Default 1 capture

  const [sessionId] = useState(() => Date.now().toString());
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [samples, setSamples] = useState<SampleT[]>([]);
  const [sampleCounter, setSampleCounter] = useState(1);

  const handleFinish = () => {
    const totalSamples = samples.length;
    const totalFrames = samples.reduce((sum, s) => sum + (s.frames ?? 0), 0);
    const avgFrames = totalSamples > 0 ? totalFrames / totalSamples : 0;

    const labelsCount: Record<string, number> = {};
    samples.forEach((s) => {
      const lbl = s.label ?? 'unknown';
      labelsCount[lbl] = (labelsCount[lbl] || 0) + 1;
    });

    const stats: SessionStats = {
      totalSamples,
      totalFrames,
      avgFrames: Math.round(avgFrames),
      labelsCount,
    };

    setSessionStats(stats);
  };

    

  // Removed handleUpload - now using only fullscreen capture

  const handleDelete = (sampleId: number) => {
    setSamples(prev => prev.filter(s => s.id !== sampleId));
  };

  const handleFullscreenCapture = async (capturedFrames: Array<{
    pose: MediaPipeLandmark[];
    face: MediaPipeLandmark[];
    left_hand: MediaPipeLandmark[];
    right_hand: MediaPipeLandmark[];
  }>, capturedLabel: string, capturedUser: string) => {
    setUploading(true);
    try {
      // Prepare data for backend API
      const payload = {
        user: capturedUser,
        label: capturedLabel,
        session_id: sessionId,
        frames: capturedFrames.map((frame, idx) => ({
          timestamp: idx,
          landmarks: frame
        }))
      };

      // Call real API
      const result = await uploadCamera(payload);
      
      if (result.ok) {
        const sample: SampleT = {
          id: sampleCounter,
          session_id: sessionId,
          label: capturedLabel,
          user: capturedUser,
          frames: capturedFrames.length,
          uploaded: true,
          sample_id: result.data.id?.toString(),
        };

        setSamples(prev => [...prev, sample]);
        setSampleCounter(prev => prev + 1);
        
        console.log(`Sample "${capturedLabel}" captured and uploaded successfully!`);
      } else {
        if (onError) {
          onError(result.error || 'Upload failed. Please try again.');
        }
      }
    } catch (error) {
      console.error('Upload failed:', error);
      if (onError) {
        onError('Upload failed. Please try again.');
      }
    } finally {
      setUploading(false);
    }
    
    setShowFullscreen(false);
  };


  return (
    <div className="space-y-6">
      {/* Quick Start Section */}
      <div className="card">
        <div className="text-center py-12">
          <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-blue-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Professional Motion Capture</h2>
          <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
            Launch our dedicated fullscreen capture interface for distraction-free, professional-grade pose data collection. 
            Optimized for speed and accuracy.
          </p>

          {/* Capture Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md mx-auto mb-8">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Target Frames</label>
              <input
                type="number"
                min="10"
                max="300"
                value={targetFrames}
                onChange={(e) => setTargetFrames(parseInt(e.target.value) || 30)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="30"
              />
              <p className="text-xs text-gray-500">Frames to capture per sample (10-300)</p>
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Capture Count</label>
              <input
                type="number"
                min="1"
                max="20"
                value={captureCount}
                onChange={(e) => setCaptureCount(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="1"
              />
              <p className="text-xs text-gray-500">Number of captures to take (1-20)</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-6">
            <Button
              onClick={() => setShowFullscreen(true)}
              className="px-8 py-4 text-lg font-semibold min-w-48"
              variant="primary"
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <svg className="w-6 h-6 mr-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Uploading...
                </>
              ) : (
                <>
                  <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  Launch Fullscreen Capture
                </>
              )}
            </Button>
            
            <Button
              onClick={() => setShowGuide(true)}
              variant="secondary"
              className="px-6 py-4"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              View Guide
            </Button>
          </div>

          {/* Quick Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto text-sm">
            <div className="flex items-center justify-center p-4 bg-green-50 rounded-xl">
              <svg className="w-5 h-5 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-green-800 font-medium">Quick 3-second countdown</span>
            </div>
            <div className="flex items-center justify-center p-4 bg-blue-50 rounded-xl">
              <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-blue-800 font-medium">AI-powered pose detection</span>
            </div>
            <div className="flex items-center justify-center p-4 bg-purple-50 rounded-xl">
              <svg className="w-5 h-5 text-purple-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h4a1 1 0 011 1v2m-6 0h8m-6 0a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V6a2 2 0 00-2-2m-6 0V4" />
              </svg>
              <span className="text-purple-800 font-medium">Keyboard shortcuts support</span>
            </div>
          </div>
        </div>
      </div>

      {/* Productivity Panel */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">📈 Collection Progress</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                // Auto-fill next sample
                setSampleCounter(prev => prev + 1);
                setLabel("");
              }}
              className="btn btn-ghost text-sm"
            >
              Next Sample
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{samples.length}</div>
            <div className="text-xs text-blue-600">Samples Today</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {samples.length > 0 ? Math.round((samples.length / 60) * 100) / 100 : 0}
            </div>
            <div className="text-xs text-green-600">Samples/min</div>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {samples.reduce((sum, s) => sum + (s.frames || 0), 0)}
            </div>
            <div className="text-xs text-purple-600">Total Frames</div>
          </div>
          <div className="text-center p-3 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {new Set(samples.map(s => s.label)).size}
            </div>
            <div className="text-xs text-yellow-600">Unique Labels</div>
          </div>
        </div>

        {/* Quick Actions for Efficiency */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Quick Actions</span>
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  // Clear all samples
                  if (confirm('Clear all samples from this session?')) {
                    setSamples([]);
                    setSampleCounter(1);
                  }
                }}
                className="btn btn-ghost text-xs text-red-600"
              >
                Clear Session
              </button>
              <button
                onClick={() => {
                  // Duplicate last sample settings
                  const lastSample = samples[samples.length - 1];
                  if (lastSample) {
                    setLabel(lastSample.label || "");
                  }
                }}
                className="btn btn-ghost text-xs"
                disabled={samples.length === 0}
              >
                Repeat Last
              </button>
            </div>
          </div>
        </div>
      </div>

      <SessionPanel
        sessionId={sessionId}
        samples={samples}
        onFinish={handleFinish}
        onDelete={handleDelete}
      />

      {/* Fullscreen Modal */}
      {showFullscreen && (
        <FullscreenCaptureModal
          isOpen={showFullscreen}
          onClose={() => setShowFullscreen(false)}
          onSampleCapture={handleFullscreenCapture}
          initialLabel={label}
          initialUser={user}
          targetFrames={targetFrames}
          captureCount={captureCount}
        />
      )}

      {showGuide && <CaptureGuide onClose={() => setShowGuide(false)} />}
      {/* PreviewModal removed - using fullscreen capture only */}
      {sessionStats && (
        <SessionSummary
          sessionId={sessionId}
          stats={sessionStats}
          onClose={() => setSessionStats(null)}
        />
      )}
    </div>
  );
}
