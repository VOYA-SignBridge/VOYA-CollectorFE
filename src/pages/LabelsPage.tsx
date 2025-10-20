import { useState, useEffect, useMemo } from "react";
import { getLabels, createLabel, updateLabel, deleteLabel } from "../api/dataset";
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
  const [editing, setEditing] = useState<boolean>(false);
  const [editLabel, setEditLabel] = useState<Label | null>(null);
  const [updating, setUpdating] = useState(false);
  const [search, setSearch] = useState<string>("");

  const filteredLabels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return labels;
    return labels.filter((l) => {
      return (
        String(l.class_idx).includes(q) ||
        (l.label_original || "").toLowerCase().includes(q) ||
        (l.slug || "").toLowerCase().includes(q)
      );
    });
  }, [labels, search]);

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

  const handleEditLabel = (label: Label) => {
    setEditLabel(label);
    setNewLabel(label.label_original);
    setEditing(true);
    setError(null);
  };

  const handleDeleteLabel = async (label: Label) => {
    if (!confirm(`Are you sure you want to delete label "${label.label_original}"? This action cannot be undone.`)) return;
    setError(null);
    try {
      setLoading(true);
      const res = await deleteLabel(label.class_idx);
      if (res.ok) {
        setLabels(prev => prev.filter(l => l.class_idx !== label.class_idx));
      } else {
        setError(res.error || 'Failed to delete label');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Failed to delete label");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editLabel) return;
    const trimmed = newLabel.trim();
    if (!trimmed) return setError('Label cannot be empty');

    setUpdating(true);
    setError(null);
    try {
      const res = await updateLabel(editLabel.class_idx, trimmed);
      if (res.ok) {
        setLabels(prev => prev.map(l => l.class_idx === editLabel.class_idx ? res.data : l));
        setEditLabel(null);
        setEditing(false);
        setNewLabel('');
      } else {
        setError(res.error || 'Failed to update label');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to update label');
    } finally {
      setUpdating(false);
    }
  };

  const exportJSON = () => {
    const data = JSON.stringify(labels, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `labels-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = useMemo(() => {
    const rows = ['class_idx,label_original,slug'];
    labels.forEach(l => rows.push(`${l.class_idx},"${l.label_original.replace(/"/g, '""')}",${l.slug}`));
    return rows.join('\n');
  }, [labels]);

  const downloadCSV = () => {
    const blob = new Blob([exportCSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `labels-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
          
          <div className="flex items-center space-x-3">
            <div className="flex-1">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search labels, slug or id..."
                className="input w-full"
                aria-label="Search labels"
              />
            </div>
            {!loading && labels.length > 0 && (
              <div className="flex items-center space-x-2">
                <Button variant="secondary" size="sm" onClick={exportJSON}>Export JSON</Button>
                <Button variant="secondary" size="sm" onClick={downloadCSV}>Export CSV</Button>
              </div>
            )}
          </div>
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
            {filteredLabels.map((label) => (
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
                    <div className="flex items-center gap-1">
                      <button 
                        className="btn btn-ghost p-2 text-blue-600 hover:text-blue-800"
                        title="Edit label"
                        onClick={() => handleEditLabel(label)}
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </button>
                      <button 
                        className="btn btn-ghost p-2 text-red-600 hover:text-red-800"
                        title="Delete label"
                  onClick={() => handleDeleteLabel(label)}
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

        {/* Edit Modal */}
        {editing && editLabel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-xl w-96 p-6">
              <h3 className="text-lg font-semibold mb-3">Edit Label #{editLabel.class_idx}</h3>
              <div className="mb-4">
                <input
                  className="input w-full"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  disabled={updating}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="secondary" onClick={() => { setEditing(false); setEditLabel(null); setNewLabel(''); }}>Cancel</Button>
                <Button onClick={handleUpdate} loading={updating}>Save</Button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
