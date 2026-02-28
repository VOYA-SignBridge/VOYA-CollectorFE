import axiosClient from "./axiosClient";
import type { Result } from "./validators";

export type InferenceModelStatus = {
  status?: string;
  loaded?: boolean;
  model_id?: string;
  preprocess_version?: string;
  sequence_length?: number;
  feature_dim?: number;
  artifact_path?: string;
  error?: string;
  [k: string]: unknown;
};

export type InferencePrediction = {
  index: number;
  confidence: number;
  slug?: string;
  label_original?: string;
  class_uid?: string;
  [k: string]: unknown;
};

export type PredictFeaturesResponse = {
  model_id?: string;
  preprocess_version?: string;
  prediction?: InferencePrediction;
  top_k?: InferencePrediction[];
  timing_ms?: { validate?: number; inference?: number; total?: number; [k: string]: unknown };
  [k: string]: unknown;
};

export const getInferenceModelStatus = async (): Promise<Result<InferenceModelStatus>> => {
  try {
    const res = await axiosClient.get("/api/inference/model");
    return { ok: true, data: (res.data ?? {}) as InferenceModelStatus };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg || "Failed to fetch model status" };
  }
};

export const predictFeatures = async (features: number[][], topK = 5): Promise<Result<PredictFeaturesResponse>> => {
  try {
    // Backend expects: { top_k, sequence: { sequence_length, feature_dim, features } }
    const sequence_length = features.length;
    const feature_dim = Array.isArray(features[0]) ? features[0].length : 0;
    const res = await axiosClient.post("/api/inference/predict/features", {
      top_k: topK,
      sequence: {
        sequence_length,
        feature_dim,
        features,
      },
    });

    const raw = (res.data ?? {}) as any;
    const normalizePred = (p: any): InferencePrediction => {
      const idx = p?.index ?? p?.class_idx ?? p?.classIndex ?? p?.class;
      return {
        ...p,
        index: Number(idx),
        confidence: Number(p?.confidence),
      } as InferencePrediction;
    };

    const out: PredictFeaturesResponse = {
      ...raw,
      prediction: raw?.prediction ? normalizePred(raw.prediction) : undefined,
      top_k: Array.isArray(raw?.top_k) ? raw.top_k.map(normalizePred) : undefined,
    };

    return { ok: true, data: out };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg || "Prediction failed" };
  }
};
