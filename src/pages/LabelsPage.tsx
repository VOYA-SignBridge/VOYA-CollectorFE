import { useState, useEffect, useMemo } from "react";
import { getLabels, getClassesList, getClassesStats } from "../api/dataset";
import type { Label, ClassRow } from "../types";
import ErrorBanner from "../components/ErrorBanner";
import PageHeader from "../components/ui/PageHeader";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import Badge from "../components/ui/Badge";

export default function LabelsPage() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [sampleCounts, setSampleCounts] = useState<Record<string, number>>({});
  const [language, setLanguage] = useState<string>('vn');
  const [dialect, setDialect] = useState<string>(''); // Empty = all dialects
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Dialect normalization helper: map various forms to canonical slugs used by BE
  const normalizeDialect = (d?: string) => {
    if (!d) return '';
    const s = String(d).toLowerCase().trim();
    // common variants map
    const map: Record<string, string> = {
      'chung': 'common',
      'common': 'common',
      'bac': 'bac',
      'bắc': 'bac',
      'nam': 'nam',
      'trung': 'trung',
      'hoa-de': 'hoa-de',
      'hoa de': 'hoa-de',
      'hoade': 'hoa-de',
      'cần thơ': 'can-tho',
      'can tho': 'can-tho',
      'cantho': 'can-tho',
      'can-tho': 'can-tho',
    };
    return map[s] ?? s;
  };

  // Normalize either `classes` (new BE) or legacy `labels` into a common render shape
  type RenderItem = {
    class_uid?: string;
    class_idx: number;
    slug: string;
    label_original: string;
    created_at?: string;
    dialect?: string;
    folder_name?: string;
    samples_count?: number;
    is_common_language?: boolean;
    is_common_global?: boolean;
  };

  const renderItems = useMemo<RenderItem[]>(() => {
    const q = search.trim().toLowerCase();
    const raw: RenderItem[] = [];
    if (classes && classes.length > 0) {
      for (const c of classes) {
        // Client-side dialect filter if dialect is selected (use normalized forms)
        const cDialect = normalizeDialect(c.dialect);
        if (dialect && cDialect && dialect !== '' && cDialect !== dialect) {
          continue;
        }
        raw.push({
          class_uid: c.class_uid,
          class_idx: typeof c.class_idx === 'string' ? parseInt(c.class_idx, 10) : Number(c.class_idx),
          slug: c.slug,
          label_original: c.label_original,
          created_at: c.created_at,
          dialect: cDialect || c.dialect,
          folder_name: c.folder_name,
          samples_count: sampleCounts[c.class_uid] ?? 0,
          is_common_language: String(c.is_common_language) === '1' || c.is_common_language === true,
          is_common_global: String(c.is_common_global) === '1' || c.is_common_global === true,
        });
      }
    } else {
      for (const l of labels) {
        raw.push({
          class_idx: l.class_idx,
          slug: l.slug,
          label_original: l.label_original,
          created_at: undefined,
          samples_count: 0,
        });
      }
    }

    if (!q) return raw;
    return raw.filter((r) => {
      return (
        String(r.class_idx).includes(q) ||
        (r.label_original || '').toLowerCase().includes(q) ||
        (r.slug || '').toLowerCase().includes(q)
      );
    });
  }, [classes, labels, search, sampleCounts, dialect]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null); // Clear previous errors
        // Try modern classes endpoint first - KHÔNG gửi dialect để lấy TẤT CẢ
        console.log('[LabelsPage] Fetching classes list...');
        const classesRes = await getClassesList(language, undefined);
        console.log('[LabelsPage] getClassesList result:', classesRes);
        
        if (!mounted) return;
        if (classesRes.ok) {
          // Debug: log classes response received from backend
          // eslint-disable-next-line no-console
          console.debug('[LabelsPage] getClassesList:', classesRes.data);
          setClasses(classesRes.data.items || []);
          console.log('[LabelsPage] Classes set:', classesRes.data.items?.length || 0, 'items');

          // fetch stats and map counts by class_uid - cũng KHÔNG filter dialect
          console.log('[LabelsPage] Fetching classes stats...');
          const statsRes = await getClassesStats(language, undefined);
          console.log('[LabelsPage] getClassesStats result:', statsRes);
          
          if (statsRes.ok && statsRes.data) {
            const map: Record<string, number> = {};
            const distribution = statsRes.data.distribution || [];
            for (const s of distribution) {
              if (s.class_uid) map[s.class_uid] = s.count || s.samples_count || 0;
            }
            // Debug: log sample count mapping size
            // eslint-disable-next-line no-console
            console.debug('[LabelsPage] sampleCounts mapped for', Object.keys(map).length, 'classes');
            setSampleCounts(map);
          } else {
            console.warn('[LabelsPage] Stats fetch failed or empty:', statsRes);
          }
        } else {
          console.warn('[LabelsPage] getClassesList failed, trying legacy endpoint. Error:', classesRes.error);
          // fallback to legacy labels endpoint
          const legacy = await getLabels();
          if (!mounted) return;
          if (legacy.ok) {
            console.log('[LabelsPage] Legacy labels loaded:', legacy.data.length);
            setLabels(legacy.data);
          } else {
            console.error('[LabelsPage] Legacy labels also failed:', legacy.error);
            setError(legacy.error);
          }
        }
      } catch (err: unknown) {
        console.error('[LabelsPage] Exception during fetch:', err);
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || "Failed to load labels");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [language]); // Chỉ phụ thuộc language, KHÔNG phụ thuộc dialect

  const exportJSON = () => {
    const data = JSON.stringify(classes && classes.length > 0 ? classes : labels, null, 2);
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
    if (classes && classes.length > 0) {
      classes.forEach(c => rows.push(`${c.class_idx},"${String(c.label_original).replace(/"/g, '""')}",${c.slug}`));
    } else {
      labels.forEach(l => rows.push(`${l.class_idx},"${l.label_original.replace(/"/g, '""')}",${l.slug}`));
    }
    return rows.join('\n');
  }, [labels, classes]);

  const downloadCSV = () => {
    const blob = new Blob([exportCSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `labels-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };



  return (
    <div className="space-y-6">
      <PageHeader 
        title="Thư viện nhãn" 
        subtitle="Quản lý và tìm kiếm các nhãn ngôn ngữ ký hiệu."
        breadcrumb={["Dữ liệu", "Nhãn"]}
      />

      {error && (
        <ErrorBanner 
          message={error} 
          onClose={() => setError(null)} 
          type="error"
          autoClose={false}
        />
      )}

      {/* Stats Overview */}
      {!loading && renderItems.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200">
            <div className="text-sm font-medium text-indigo-600">Tổng nhãn</div>
            <div className="text-3xl font-bold text-indigo-900 mt-1">{renderItems.length}</div>
            <div className="text-xs text-indigo-600 mt-2">trong {language === 'vn' ? 'Tiếng Việt' : 'English'}</div>
          </div>
          
          <div className="card bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <div className="text-sm font-medium text-green-600">Tổng mẫu</div>
            <div className="text-3xl font-bold text-green-900 mt-1">
              {renderItems.reduce((sum, item) => sum + (item.samples_count ?? 0), 0)}
            </div>
            <div className="text-xs text-green-600 mt-2">video samples</div>
          </div>
          
          <div className="card bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <div className="text-sm font-medium text-purple-600">Phổ biến</div>
            <div className="text-3xl font-bold text-purple-900 mt-1">
              {renderItems.filter(item => item.is_common_language || item.is_common_global).length}
            </div>
            <div className="text-xs text-purple-600 mt-2">nhãn phổ biến</div>
          </div>
          
          <div className="card bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <div className="text-sm font-medium text-orange-600">Phương ngữ</div>
            <div className="text-3xl font-bold text-orange-900 mt-1">
              {new Set(renderItems.map(item => item.dialect)).size}
            </div>
            <div className="text-xs text-orange-600 mt-2">vùng miền</div>
          </div>
        </div>
      )}

      {/* Labels list */}
      <div className="card">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
              📚 Danh sách nhãn
              {!loading && (
                <Badge variant="info" className="ml-3">
                  {renderItems.length}
                </Badge>
              )}
            </h2>
            
            <div className="flex items-center gap-2">
              {!loading && renderItems.length > 0 && (
                <>
                  <Button variant="secondary" size="sm" onClick={exportJSON}>
                    <span className="text-xs">📥 JSON</span>
                  </Button>
                  <Button variant="secondary" size="sm" onClick={downloadCSV}>
                    <span className="text-xs">📥 CSV</span>
                  </Button>
                </>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex gap-2">
              <select className="input text-sm" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="vn">🇻🇳 Tiếng Việt</option>
                <option value="en">🇬🇧 English</option>
              </select>
              <select className="input text-sm" value={dialect} onChange={(e) => setDialect(e.target.value)}>
                <option value="">🗺️ Tất cả vùng</option>
                <option value="common">Chung</option>
                <option value="bac">Miền Bắc</option>
                <option value="nam">Miền Nam</option>
                <option value="can-tho">Cần Thơ</option>
                <option value="trung">Miền Trung</option>
                <option value="hoa-de">Hòa Đê</option>
              </select>
            </div>
            
            <div className="flex-1">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Tìm kiếm nhãn, slug hoặc ID..."
                className="input w-full"
                aria-label="Tìm kiếm nhãn"
              />
            </div>
            
            <div className="flex border border-gray-300 rounded-lg overflow-hidden">
              <button
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setViewMode('grid')}
                title="Xem dạng lưới"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'list' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setViewMode('list')}
                title="Xem dạng danh sách"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" className="text-indigo-400" />
            <span className="ml-3 text-gray-600">Loading labels...</span>
          </div>
        ) : renderItems.length === 0 ? (
          <EmptyState 
            title="Không tìm thấy nhãn" 
            description="Thử điều chỉnh bộ lọc hoặc tìm kiếm với từ khóa khác."
          />
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5' : 'space-y-3'}>
            {renderItems.map((item) => (
              <div 
                key={item.class_uid ?? item.class_idx}
                className={`${
                  viewMode === 'grid' 
                    ? 'card group hover:shadow-xl hover:-translate-y-1 transition-all duration-300 p-6 border-2 border-transparent hover:border-indigo-200' 
                    : 'card group hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 transition-all duration-200 p-5'
                }`}
              >
                <div className={`flex ${
                  viewMode === 'grid' ? 'flex-col' : 'flex-row items-center justify-between'
                }`}>
                  <div className="flex-1 min-w-0 w-full">
                    {/* Header */}
                    <div className="flex items-start gap-3 mb-4">
                      <div className="flex-shrink-0">
                        <span className="text-3xl">🏷️</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-xl text-gray-900 leading-tight mb-1 truncate">
                          {item.label_original}
                        </h3>
                        <p className="text-sm text-gray-500 font-mono truncate">
                          {item.slug}
                        </p>
                      </div>
                    </div>
                    
                    {/* Badges */}
                    {viewMode === 'grid' && (
                      <div className="flex items-center gap-2 flex-wrap mb-4">
                        {item.class_idx !== -1 && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                            #{item.class_idx}
                          </span>
                        )}
                        {item.dialect === 'common' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
                            Chung
                          </span>
                        )}
                        {item.dialect === 'bac' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                            Miền Bắc
                          </span>
                        )}
                        {item.dialect === 'nam' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                            Miền Nam
                          </span>
                        )}
                        {item.dialect === 'trung' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            Miền Trung
                          </span>
                        )}
                        {item.dialect === 'hoa-de' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                            Hòa Đê
                          </span>
                        )}
                        {item.dialect === 'can-tho' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-800">
                            Cần Thơ
                          </span>
                        )}
                        {item.is_common_global && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                            ⭐ Toàn cầu
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* List view */}
                  {viewMode === 'list' && (
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.class_idx !== -1 && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                            #{item.class_idx}
                          </span>
                        )}
                        {item.dialect === 'common' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">Chung</span>
                        )}
                        {item.dialect === 'bac' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">Miền Bắc</span>
                        )}
                        {item.dialect === 'nam' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Miền Nam</span>
                        )}
                        {item.dialect === 'trung' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Miền Trung</span>
                        )}
                        {item.dialect === 'hoa-de' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">Hòa Đê</span>
                        )}
                        {item.dialect === 'can-tho' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-800">Cần Thơ</span>
                        )}
                        {item.is_common_global && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">⭐ Toàn cầu</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
