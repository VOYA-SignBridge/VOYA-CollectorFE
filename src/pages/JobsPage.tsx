import { useState, useEffect } from "react";
import { getJobStatus } from "../api/jobs";
import type { JobStatus } from "../types";
import ErrorBanner from "../components/ErrorBanner";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import Badge from "../components/ui/Badge";
import Modal from "../components/ui/Modal";

export default function JobsPage() {
  const [jobId, setJobId] = useState("");
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentJobs, setRecentJobs] = useState<Array<{id: string, status: string, timestamp: string}>>([]);
  const [showDetails, setShowDetails] = useState(false);

  // Simulate recent jobs for demo
  useEffect(() => {
    setRecentJobs([
      { id: "job_001", status: "completed", timestamp: "2024-01-15 14:30" },
      { id: "job_002", status: "running", timestamp: "2024-01-15 15:45" },
      { id: "job_003", status: "failed", timestamp: "2024-01-15 16:20" },
    ]);
  }, []);

  const checkStatus = async () => {
    if (!jobId.trim()) {
      setError("Please enter a job ID");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await getJobStatus(jobId);
      if (res.ok) {
        setStatus(res.data);
        setShowDetails(true);
      } else {
        setError(res.error);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Failed to fetch job status");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      checkStatus();
    }
  };

  const getStatusBadge = (jobStatus: string) => {
    switch (jobStatus) {
      case "completed":
        return <Badge variant="success">Completed</Badge>;
      case "running":
        return <Badge variant="info">Running</Badge>;
      case "failed":
        return <Badge variant="danger">Failed</Badge>;
      case "pending":
        return <Badge variant="warning">Pending</Badge>;
      default:
        return <Badge>{jobStatus}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Job Management" 
        subtitle="Monitor and track data processing jobs, model training tasks, and batch operations."
        breadcrumb={["Dataset", "Jobs"]}
      />

      {error && (
        <ErrorBanner 
          message={error} 
          onClose={() => setError(null)} 
          type="error"
        />
      )}

      {/* Job Status Checker */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <span className="mr-2">🔍</span>
          Check Job Status
        </h2>
        
        <div className="flex gap-3">
          <input
            className="input flex-1"
            placeholder="Enter job ID (e.g., job_001, task_abc123)"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={loading}
          />
          <Button 
            onClick={checkStatus} 
            loading={loading}
            disabled={!jobId.trim() || loading}
          >
            {loading ? "Checking..." : "Check Status"}
          </Button>
        </div>
        
        <div className="mt-3 text-sm text-gray-600">
          💡 Enter a valid job ID to view detailed status and progress information
        </div>
      </div>

      {/* Recent Jobs */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <span className="mr-2">📋</span>
            Recent Jobs
            <Badge variant="info" className="ml-3">
              {recentJobs.length} jobs
            </Badge>
          </h2>
          
          <Button variant="secondary" size="sm">
            Refresh List
          </Button>
        </div>

        <div className="space-y-3">
          {recentJobs.map((job) => (
            <div 
              key={job.id}
              className="card card-compact glass-hover group cursor-pointer"
              onClick={() => {
                setJobId(job.id);
                setStatus({ status: job.status, progress: job.status === "running" ? 45 : 100 });
                setShowDetails(true);
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="font-mono text-sm text-indigo-400">
                    {job.id}
                  </div>
                  {getStatusBadge(job.status)}
                  {job.status === "running" && (
                    <div className="flex items-center gap-2">
                      <LoadingSpinner size="sm" className="text-blue-400" />
                      <span className="text-sm text-gray-600">Processing...</span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-600">
                    {job.timestamp}
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 111.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {recentJobs.length === 0 && (
          <div className="text-center py-8 text-gray-600">
            <div className="text-4xl mb-3">🕐</div>
            <div>No recent jobs found</div>
            <div className="text-sm mt-1">Jobs will appear here once you start processing tasks</div>
          </div>
        )}
      </div>

      {/* Job Details Modal */}
      <Modal
        isOpen={showDetails}
        onClose={() => setShowDetails(false)}
        title="Job Details"
        size="lg"
      >
        {status && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-700">Job ID</label>
                <div className="font-mono text-indigo-400">{jobId}</div>
              </div>
              <div>
                <label className="text-sm text-gray-700">Status</label>
                <div className="mt-1">
                  {getStatusBadge(status?.status || "unknown")}
                </div>
              </div>
            </div>

            {status?.progress !== undefined && (
              <div>
                <label className="text-sm text-gray-700">Progress</label>
                <div className="mt-2">
                  <div className="bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-indigo-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${status?.progress || 0}%` }}
                    />
                  </div>
                  <div className="text-sm text-gray-600 mt-1">{status?.progress || 0}% complete</div>
                </div>
              </div>
            )}

            <div>
              <label className="text-sm text-gray-700 mb-2 block">Raw Data</label>
              <pre className="bg-gray-800/50 p-4 rounded-lg text-sm text-gray-300 overflow-auto max-h-64">
                {typeof status === 'string' ? status : JSON.stringify(status, null, 2)}
              </pre>
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="secondary" onClick={() => setShowDetails(false)}>
                Close
              </Button>
              <Button>
                Refresh
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
