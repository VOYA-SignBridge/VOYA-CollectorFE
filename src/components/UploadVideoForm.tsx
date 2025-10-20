import { useState } from "react";
import { uploadVideo } from "../api/upload";
import Button from "./ui/Button";

type UploadResult = {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
};

type Props = {
  onError?: (msg: string) => void;
};

export default function UploadVideoForm({ onError }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [user, setUser] = useState("");
  const [dialect, setDialect] = useState<string>(() => {
    return localStorage.getItem('dialectSelected') || 'Bắc';
  });
  const [dialectList, setDialectList] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('dialectList') || 'null');
      if (Array.isArray(stored) && stored.length > 0) return stored;
    } catch (err) {
      // ignore parse errors
      void err;
    }
    return ['Bắc', 'Trung', 'Nam'];
  });
  const [result, setResult] = useState<UploadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleUpload = async () => {
    if (!file || !label || !user) {
      onError?.("Please fill in all required fields");
      return;
    }
    setLoading(true);
    try {
      const res = await uploadVideo(file, user, label, dialect);
      if (res.ok) {
        setResult({
          success: true,
          message: "Upload successful!",
          data: res.data
        });
        setFile(null);
        setLabel("");
        setUser("");
      } else {
        onError?.(res.error || "Upload failed. Please try again.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      onError?.(msg || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type.startsWith('video/')) {
        setFile(droppedFile);
      } else {
        onError?.("Please select a valid video file");
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type.startsWith('video/')) {
        setFile(selectedFile);
      } else {
        onError?.("Please select a valid video file");
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="card">
      <div className="flex items-center mb-6">
        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mr-4">
          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Upload Video File</h2>
          <p className="text-gray-600 text-sm">Upload a video file to extract pose data for your dataset</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* File Upload Area */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Video File *</label>
          <div
            className={
              `relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ` +
              (dragActive 
                ? 'border-blue-400 bg-blue-50' 
                : file 
                  ? 'border-green-300 bg-green-50' 
                  : 'border-gray-300 hover:border-gray-400 bg-gray-50')
            }
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept="video/*"
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            
            {file ? (
              <div className="space-y-2">
                <div className="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="text-sm font-medium text-gray-900">{file.name}</div>
                <div className="text-xs text-gray-500">{formatFileSize(file.size)}</div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                  className="text-xs text-red-600 hover:text-red-700 underline"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="w-16 h-16 bg-gray-200 rounded-xl flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-gray-600 font-medium">Drag and drop your video file here</p>
                  <p className="text-gray-400 text-sm mt-1">or click to browse files</p>
                </div>
                <div className="text-xs text-gray-400">
                  Supported formats: MP4, AVI, MOV, WMV • Max size: 100MB
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Form Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Label *</label>
            <input
              className="input"
              placeholder="e.g., walking, sitting, jumping"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-gray-500">Describe the action or pose in the video</p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">User ID *</label>
            <input
              className="input"
              placeholder="e.g., user001, john_doe"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-gray-500">Unique identifier for the person in the video</p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Bộ ngôn ngữ (Dialect)</label>
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
              className="input"
              disabled={loading}
            >
              {dialectList.map(d => <option key={d} value={d}>{d}</option>)}
              <option value="Khác">Khác (thêm mới)</option>
            </select>
            <p className="text-xs text-gray-500">Chọn bộ ngôn ngữ kí hiệu liên quan</p>
          </div>
        </div>

        {/* Upload Button */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-500">
            All fields marked with * are required
          </div>
          <Button 
            onClick={handleUpload} 
            loading={loading}
            disabled={!file || !label || !user || loading}
            className="px-8"
          >
            {loading ? 'Processing...' : 'Upload & Process'}
          </Button>
        </div>

        {/* Upload Result */}
        {result && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl">
            <div className="flex items-start">
              <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mr-3 mt-0.5">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-medium text-green-900 mb-2">
                  {result.message || "Upload Successful!"}
                </h4>
                {result.data && (
                  <pre className="text-xs text-green-700 bg-green-100 p-3 rounded-lg overflow-auto">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
