import axiosClient from "./axiosClient";
import { validateLabels, validateSessions, validateLabel } from "./validators";
import type { Result } from "./validators";
import type { Label, Session } from "../types";

export const getLabels = async (): Promise<Result<Label[]>> => {
  const res = await axiosClient.get("/dataset/labels");
  return validateLabels(res.data);
};

export const createLabel = async (label: string): Promise<Result<Label>> => {
  const formData = new FormData();
  formData.append("label", label);
  const res = await axiosClient.post("/dataset/labels", formData);
  return validateLabel(res.data);
};

export const updateLabel = async (class_idx: number, label: string): Promise<Result<Label>> => {
  const formData = new FormData();
  formData.append("label", label);
  const res = await axiosClient.put(`/dataset/labels/${class_idx}`, formData);
  return validateLabel(res.data);
};

export const deleteLabel = async (class_idx: number): Promise<Result<null>> => {
  const res = await axiosClient.delete(`/dataset/labels/${class_idx}`);
  // Backend may return simple status object; we'll coerce to Result<null>
  return { ok: res.status >= 200 && res.status < 300, data: null, error: res.statusText } as Result<null>;
};

export const getSamples = async (): Promise<Result<Session[]>> => {
  const res = await axiosClient.get("/dataset/sessions");
  return validateSessions(res.data);
};

export const getSampleData = async (sampleId: string) => {
  const res = await axiosClient.get(`/dataset/samples/${sampleId}/data`, {
    responseType: "arraybuffer", // để xử lý npz
  });
  return res.data;
};

export const deleteSample = async (sampleId: string) => {
  const res = await axiosClient.delete(`/dataset/samples/${sampleId}`);
  return { ok: res.status >= 200 && res.status < 300, status: res.status, statusText: res.statusText };
};
