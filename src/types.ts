export interface Label {
  class_idx: number;
  label_original: string;
  slug: string;
}

export interface SampleFrame {
  timestamp: number;
  landmarks: number[];
}

export interface Sample {
  sample_id?: string; // used by SamplesPage
  id?: number; // used by SessionPanel
  label?: string;
  dialect?: string;
  file_path?: string;
  created_at?: string;
  session_id?: string;
  user?: string;
  uploaded?: boolean;
  frames?: number; // count of frames in the sample
}

export interface SessionStats {
  totalSamples: number;
  totalFrames: number;
  avgFrames: number;
  labelsCount: Record<string, number>;
}

export type UploadResult = {
  success: boolean;
  id?: string | number;
  message?: string;
  task_id?: string;
  status?: string;
  filename?: string;
  total_frames?: number;
  detail?: string;
  [k: string]: unknown;
};

// MediaPipe landmark types for pose detection
export interface MediaPipeLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface CameraUploadPayload {
  user: string;
  label: string;
  dialect?: string;
  session_id: string;
  frames: Array<{
    timestamp: number;
    landmarks: {
      pose?: MediaPipeLandmark[];
      face?: MediaPipeLandmark[];
      left_hand?: MediaPipeLandmark[];
      right_hand?: MediaPipeLandmark[];
    };
  }>;
}

export interface CameraInfo {
  userAgent?: string;
  deviceMemory?: number | null;
  hardwareConcurrency?: number | null;
  screen?: { width: number; height: number } | null;
  frameIntervalMs?: number | null;
}

export interface QualityInfo {
  framesCollected: number;
  framesAccepted?: number; // after simple client-side filter
  avgPoseLandmarksPerFrame?: number;
  percentFramesWithHands?: number;
  confidenceSummary?: { min?: number; max?: number; avg?: number };
}

export type JobStatus = {
  jobId?: string;
  status?: string;
  progress?: number;
  message?: string;
  startTime?: string;
  endTime?: string;
  [k: string]: unknown;
};

export interface Session {
  session_id: string;
  user: string;
  labels: string[];
  samples_count: number;
  created_at: string;
}

export interface Filters {
  user: string;
  label: string;
  date: string;
}
