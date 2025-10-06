import { useState, useEffect } from "react";
import { getLabels, createLabel } from "../api/dataset";
import type { Label } from "../types";
import ErrorBanner from "../components/ErrorBanner";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import Badge from "../components/ui/Badge";

export default function LabelsPage() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const result = await getLabels();
        if (!mounted) return;
        if (result.ok) setLabels(result.data);
        else setError(result.error);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || "Failed to load labels");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleAdd = async () => {
    if (!newLabel.trim()) return setError("Label cannot be empty");
    
    setCreating(true);
    setError(null);
    
    try {
      const res = await createLabel(newLabel.trim());
      if (res.ok) {
        setLabels((s) => [...s, res.data]);
        setNewLabel("");
      } else {
        setError(res.error);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Failed to create label");
    } finally {
      setCreating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAdd();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Label Management" 
        subtitle="Create and manage classification labels for your dataset. Labels help organize and categorize your data samples."
        breadcrumb={["Dataset", "Labels"]}
      />

      {error && (
        <ErrorBanner 
          message={error} 
          onClose={() => setError(null)} 
          type="error"
          autoClose={false}
        />
      )}

      {/* Create new label */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <span className="mr-2">🏷️</span>
          Create New Label
        </h2>
        
        <div className="flex gap-3">
          <input
            className="input flex-1"
            placeholder="Enter label name (e.g., 'walking', 'sitting', 'jumping')"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={creating}
          />
          <Button 
            onClick={handleAdd} 
            loading={creating}
            disabled={!newLabel.trim() || creating}
          >
            Create Label
          </Button>
        </div>
        
        <div className="mt-3 text-sm text-gray-600">
          💡 Use descriptive names that clearly identify the action or state
        </div>
      </div>

      {/* Labels list */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <span className="mr-2">📋</span>
            Available Labels
            {!loading && (
              <Badge variant="info" className="ml-3">
                {labels.length} labels
              </Badge>
            )}
          </h2>
          
          {!loading && labels.length > 0 && (
            <Button variant="secondary" size="sm">
              Export Labels
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" className="text-indigo-400" />
            <span className="ml-3 text-gray-600">Loading labels...</span>
          </div>
        ) : labels.length === 0 ? (
          <EmptyState 
            title="No labels created yet" 
            description="Start by creating your first label above. Labels help organize your dataset into meaningful categories."
          />
        ) : (
          <div className="grid-auto-fill">
            {labels.map((label) => (
              <div 
                key={label.class_idx} 
                className="card card-compact glass-hover group cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="default" size="sm">
                        #{label.class_idx}
                      </Badge>
                      <div className="font-medium text-gray-900 truncate">
                        {label.label_original}
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-600 font-mono">
                      {label.slug}
                    </div>
                    
                    <div className="mt-3 flex items-center text-xs text-gray-500">
                      <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                      Active
                    </div>
                  </div>
                  
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="btn btn-ghost p-2 text-gray-600 hover:text-gray-900">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
