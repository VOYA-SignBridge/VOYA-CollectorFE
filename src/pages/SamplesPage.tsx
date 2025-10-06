import { useEffect, useState } from "react";
import { getSamples, getSampleData } from "../api/dataset";
import SamplePreview from "../components/SamplePreview";
import type { Sample as SampleT, Filters } from "../types";
import ErrorBanner from "../components/ErrorBanner";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import Badge from "../components/ui/Badge";
import Modal from "../components/ui/Modal";

export default function SamplesPage() {
  const [samples, setSamples] = useState<SampleT[]>([]);
  const [filteredSamples, setFilteredSamples] = useState<SampleT[]>([]);
  const [selectedKeypoints, setSelectedKeypoints] = useState<number[][] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedSample, setSelectedSample] = useState<SampleT | null>(null);
  
  // Filters
  const [filters, setFilters] = useState<Filters>({
    user: "",
    label: "",
    date: ""
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const result = await getSamples();
        if (!mounted) return;
        if (result.ok) {
          const sampleData = result.data as unknown as SampleT[];
          setSamples(sampleData);
          setFilteredSamples(sampleData);
        } else {
          setError(result.error);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || "Failed to load samples");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Apply filters
  useEffect(() => {
    let filtered = samples;
    
    if (filters.user) {
      filtered = filtered.filter(s => 
        s.user?.toLowerCase().includes(filters.user.toLowerCase())
      );
    }
    
    if (filters.label) {
      filtered = filtered.filter(s => 
        s.label?.toLowerCase().includes(filters.label.toLowerCase())
      );
    }
    
    if (filters.date) {
      filtered = filtered.filter(s => 
        s.created_at?.includes(filters.date)
      );
    }
    
    setFilteredSamples(filtered);
  }, [samples, filters]);

  const handlePreview = async (sample: SampleT) => {
    if (!sample.sample_id) return;
    
    setSelectedSample(sample);
    setError(null);
    
    try {
      const buf = await getSampleData(sample.sample_id);
      const text = new TextDecoder().decode(new Uint8Array(buf));
      const parsed = JSON.parse(text);
      setSelectedKeypoints(parsed.keypoints || []);
      setShowPreview(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Failed to preview sample");
    }
  };

  const clearFilters = () => {
    setFilters({ user: "", label: "", date: "" });
  };

  const getStatusBadge = (sample: SampleT) => {
    if (sample.uploaded) {
      return <Badge variant="success" size="sm">Uploaded</Badge>;
    }
    return <Badge variant="warning" size="sm">Processing</Badge>;
  };

  const uniqueUsers = [...new Set(samples.map(s => s.user).filter(Boolean))];
  const uniqueLabels = [...new Set(samples.map(s => s.label).filter(Boolean))];

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Sample Management" 
        subtitle="Browse, filter, and preview your dataset samples with detailed information and keypoint data."
        breadcrumb={["Dataset", "Samples"]}
        actions={
          <div className="flex gap-3">
            <Button 
              variant="secondary" 
              onClick={() => setShowFilters(!showFilters)}
            >
              {showFilters ? "Hide Filters" : "Show Filters"}
            </Button>
            <Button>Export Data</Button>
          </div>
        }
      />

      {error && (
        <ErrorBanner 
          message={error} 
          onClose={() => setError(null)} 
          type="error"
        />
      )}

      {/* Filters Panel */}
      {showFilters && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span className="mr-2">🔧</span>
            Filters
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-gray-700 mb-2 block">User</label>
              <select 
                className="input"
                value={filters.user}
                onChange={(e) => setFilters(prev => ({ ...prev, user: e.target.value }))}
              >
                <option value="">All Users</option>
                {uniqueUsers.map(user => (
                  <option key={user} value={user}>{user}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="text-sm text-gray-700 mb-2 block">Label</label>
              <select 
                className="input"
                value={filters.label}
                onChange={(e) => setFilters(prev => ({ ...prev, label: e.target.value }))}
              >
                <option value="">All Labels</option>
                {uniqueLabels.map(label => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="text-sm text-gray-700 mb-2 block">Date</label>
              <input 
                type="date"
                className="input"
                value={filters.date}
                onChange={(e) => setFilters(prev => ({ ...prev, date: e.target.value }))}
              />
            </div>
          </div>
          
          <div className="flex justify-between items-center mt-4">
            <div className="text-sm text-gray-600">
              Showing {filteredSamples.length} of {samples.length} samples
            </div>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear Filters
            </Button>
          </div>
        </div>
      )}

      {/* Samples Table */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <span className="mr-2">📊</span>
            Dataset Samples
            <Badge variant="info" className="ml-3">
              {filteredSamples.length} samples
            </Badge>
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" className="text-indigo-400" />
            <span className="ml-3 text-gray-600">Loading samples...</span>
          </div>
        ) : filteredSamples.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📭</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {samples.length === 0 ? "No samples found" : "No samples match your filters"}
            </h3>
            <p className="text-gray-600 mb-4">
              {samples.length === 0 
                ? "Start collecting data to see samples here" 
                : "Try adjusting your filter criteria"
              }
            </p>
            {samples.length > 0 && (
              <Button variant="secondary" onClick={clearFilters}>
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 font-medium text-gray-300">Sample ID</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-300">Label</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-300">User</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-300">Frames</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-300">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-300">Created</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSamples.map((sample, index) => (
                  <tr 
                    key={sample.sample_id || index} 
                    className="border-b border-gray-800 hover:bg-white/5 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="font-mono text-sm text-indigo-400">
                        {sample.sample_id || `sample_${index}`}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="default" size="sm">
                        {sample.label || "Unlabeled"}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-gray-300">
                      {sample.user || "Unknown"}
                    </td>
                    <td className="py-3 px-4 text-gray-300">
                      {sample.frames || "—"}
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(sample)}
                    </td>
                    <td className="py-3 px-4 text-gray-600 text-sm">
                      {sample.created_at ? new Date(sample.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handlePreview(sample)}
                      >
                        Preview
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <Modal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        title={`Sample Preview: ${selectedSample?.sample_id}`}
        size="xl"
      >
        {selectedKeypoints && (
          <SamplePreview
            keypoints={selectedKeypoints}
            onClose={() => setShowPreview(false)}
          />
        )}
      </Modal>
    </div>
  );
}
