'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Loader2, RefreshCw, Trash2, Eye, Code,
  AlertCircle, ChevronLeft, ChevronRight, Search,
  Download, Calendar, Image as ImageIcon, X,
  ZoomIn, ZoomOut, MousePointer, Maximize2,
  Database
} from 'lucide-react';

// ==================== INTERFACES ====================
interface Detection {
  id?: number;
  class_id: number;
  class_name: string;
  confidence: number;
  bbox_x?: number;
  bbox_y?: number;
  bbox_width?: number;
  bbox_height?: number;
  bbox?: number[];
  page?: number;
}

interface DBResult {
  id: string;
  image_name: string;
  file_type: string;
  image_data?: string;
  image_width: number;
  image_height: number;
  total_pages: number;
  total_detections: number;
  uat_status: string;
  uat_note?: string;
  processing_time: number;
  model_name: string;
  model_type: string;
  timestamp: string;
  created_at: string;
  updated_at: string;
}

interface DBDetection {
  id: number;
  result_id: string;
  class_id: number;
  class_name: string;
  confidence: number;
  bbox_x: number;
  bbox_y: number;
  bbox_width: number;
  bbox_height: number;
  page?: number;
  created_at: string;
}

interface ResultDetail {
  success: boolean;
  result: DBResult;
  detections: DBDetection[];
}

const CLASS_COLORS: { [key: string]: string } = {
  'Text': '#a855f7',
  'Title': '#22c55e',
  'Section header': '#ef4444',
  'Picture': '#f97316',
  'Table': '#eab308',
  'Signature': '#ec4899',
  'Logo': '#92400e',
};

// ==================== HELPER FUNCTIONS ====================
const countByClass = (detections: Detection[]): { [key: string]: number } => {
  const counts: { [key: string]: number } = {};
  detections.forEach(d => {
    counts[d.class_name] = (counts[d.class_name] || 0) + 1;
  });
  return counts;
};

const formatDate = (timestamp: string): string => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }) + ' ' + date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

const convertDBDetectionToDetection = (dbDet: DBDetection): Detection => {
  return {
    id: dbDet.id,
    class_id: dbDet.class_id,
    class_name: dbDet.class_name,
    confidence: dbDet.confidence,
    bbox: [dbDet.bbox_x, dbDet.bbox_y, dbDet.bbox_width, dbDet.bbox_height],
    page: dbDet.page
  };
};

// ==================== ANNOTATION POPUP ====================
interface AnnotationPopupProps {
  result: DBResult;
  detections: Detection[];
  onClose: () => void;
}

function AnnotationPopup({ result, detections, onClose }: AnnotationPopupProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  const isPDF = result.file_type === 'pdf';
  const totalPages = result.total_pages || 1;

  const currentPageDetections = isPDF 
    ? detections.filter(d => d.page === currentPage)
    : detections;
  const classCounts = countByClass(currentPageDetections);

  // Draw annotations
  useEffect(() => {
    if (!result.image_data || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      const maxWidth = containerRef.current?.clientWidth || 800;
      const maxHeight = containerRef.current?.clientHeight || 600;
      
      const scaleX = maxWidth / img.naturalWidth;
      const scaleY = maxHeight / img.naturalHeight;
      const scale = Math.min(scaleX, scaleY, 1);
      
      const displayWidth = img.naturalWidth * scale;
      const displayHeight = img.naturalHeight * scale;

      canvas.width = displayWidth;
      canvas.height = displayHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, displayWidth, displayHeight);

      const bboxScaleX = displayWidth / result.image_width;
      const bboxScaleY = displayHeight / result.image_height;

      currentPageDetections.forEach((det) => {
        const bbox = det.bbox || [det.bbox_x || 0, det.bbox_y || 0, det.bbox_width || 0, det.bbox_height || 0];
        const [x, y, width, height] = bbox;
        const color = CLASS_COLORS[det.class_name] || '#6b7280';

        const scaledX = x * bboxScaleX;
        const scaledY = y * bboxScaleY;
        const scaledWidth = width * bboxScaleX;
        const scaledHeight = height * bboxScaleY;

        ctx.fillStyle = color + '20';
        ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);

        const labelText = `${det.class_name} ${det.confidence.toFixed(2)}`;
        ctx.font = 'bold 12px Arial';
        const textMetrics = ctx.measureText(labelText);
        const labelWidth = textMetrics.width + 6;

        ctx.fillStyle = color;
        ctx.fillRect(scaledX, scaledY, labelWidth, 18);

        ctx.fillStyle = 'white';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(labelText, scaledX + 3, scaledY + 9);
      });
    };
    img.src = result.image_data;
  }, [result.image_data, currentPageDetections, result.image_width, result.image_height]);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.25));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoom(prev => Math.max(0.25, Math.min(5, prev + delta)));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning && zoom > 1) {
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    }
  };

  const handleMouseUp = () => setIsPanning(false);

  return (
    <div className="fixed inset-0 bg-black/70 flex z-50" onClick={onClose}>
      <div 
        className="flex-1 flex flex-col bg-gray-100 m-4 rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-gray-800">{result.image_name}</h3>
            {isPDF && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded font-medium">
                📄 PDF - Page {currentPage}/{totalPages}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={handleZoomOut}
                disabled={zoom <= 0.25}
                className="p-1.5 hover:bg-white rounded disabled:opacity-30 transition-colors"
              >
                <ZoomOut className="w-4 h-4 text-gray-600" />
              </button>
              <span className="text-xs font-medium text-gray-700 px-2 min-w-[3rem] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                disabled={zoom >= 5}
                className="p-1.5 hover:bg-white rounded disabled:opacity-30 transition-colors"
              >
                <ZoomIn className="w-4 h-4 text-gray-600" />
              </button>
              <button
                onClick={handleResetZoom}
                className="p-1.5 hover:bg-white rounded transition-colors ml-1"
              >
                <Maximize2 className="w-4 h-4 text-gray-600" />
              </button>
            </div>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
              {result.image_width} × {result.image_height} px
            </span>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div 
            ref={containerRef}
            className="flex-1 bg-gray-50 flex items-center justify-center p-6 overflow-auto relative"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: isPanning ? 'grabbing' : zoom > 1 ? 'grab' : 'default' }}
          >
            {isPDF && totalPages > 1 && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-white rounded-lg shadow-lg px-4 py-2 flex items-center gap-3">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm font-medium">Page {currentPage} / {totalPages}</span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {result.image_data ? (
              <div 
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px)`,
                  transition: isPanning ? 'none' : 'transform 0.1s'
                }}
              >
                <canvas 
                  ref={canvasRef} 
                  className="border border-gray-300 shadow-lg bg-white"
                  style={{ 
                    transform: `scale(${zoom})`,
                    transformOrigin: 'center',
                    transition: 'transform 0.2s',
                    pointerEvents: 'none'
                  }}
                />
              </div>
            ) : (
              <div className="text-center text-gray-400">
                <ImageIcon className="w-16 h-16 mx-auto mb-2" />
                <p>No image data available</p>
              </div>
            )}
          </div>

          <div className="w-12 bg-white border-l flex flex-col items-center py-4 gap-2">
            <button className="p-2 bg-blue-100 rounded-lg text-blue-700">
              <MousePointer className="w-4 h-4" />
            </button>
            <button onClick={handleZoomIn} className="p-2 hover:bg-gray-100 rounded-lg">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={handleZoomOut} className="p-2 hover:bg-gray-100 rounded-lg">
              <ZoomOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-white border-t px-4 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            {Object.entries(classCounts).map(([cls, count]) => (
              <div 
                key={cls}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border"
                style={{ 
                  borderColor: CLASS_COLORS[cls] || '#e5e7eb',
                  backgroundColor: (CLASS_COLORS[cls] || '#6b7280') + '10'
                }}
              >
                <span 
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: CLASS_COLORS[cls] }}
                />
                <span className="text-sm text-gray-700">{cls}</span>
                <span 
                  className="text-sm font-bold"
                  style={{ color: CLASS_COLORS[cls] }}
                >
                  {count}
                </span>
              </div>
            ))}
          </div>
          {result.uat_note && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-gray-500 font-medium mb-1">UAT Note:</p>
              <p className="text-sm text-gray-700">{result.uat_note}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== MAIN TABLE ====================
export default function ResultsTable() {
  const [backendUrl] = useState('http://localhost:8000');
  
  const [results, setResults] = useState<DBResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [popupResult, setPopupResult] = useState<{ result: DBResult; detections: Detection[] } | null>(null);
  const [jsonPopupResult, setJsonPopupResult] = useState<{ result: DBResult; detections: Detection[] } | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'detections'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const fetchResults = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${backendUrl}/results?limit=1000`);
      if (response.ok) {
        const data = await response.json();
        setResults(data.results || []);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchResultDetail = async (resultId: string): Promise<ResultDetail | null> => {
    try {
      const response = await fetch(`${backendUrl}/results/${resultId}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      console.error('Failed to fetch result detail:', err);
    }
    return null;
  };

  useEffect(() => {
    fetchResults();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [sortBy, sortOrder, searchQuery]);

  const handleViewResult = async (result: DBResult) => {
    const detail = await fetchResultDetail(result.id);
    if (detail) {
      const detections = detail.detections.map(convertDBDetectionToDetection);
      setPopupResult({ result: detail.result, detections });
    }
  };

  const handleViewJSON = async (result: DBResult) => {
    const detail = await fetchResultDetail(result.id);
    if (detail) {
      const detections = detail.detections.map(convertDBDetectionToDetection);
      setJsonPopupResult({ result: detail.result, detections });
    }
  };

  const filteredResults = results.filter(r => {
    return r.image_name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const sortedResults = [...filteredResults].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'date':
        comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        break;
      case 'name':
        comparison = a.image_name.localeCompare(b.image_name);
        break;
      case 'detections':
        comparison = a.total_detections - b.total_detections;
        break;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const totalPages = Math.ceil(sortedResults.length / itemsPerPage);
  const paginatedResults = sortedResults.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedResults.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedResults.map(r => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected items from database?`)) return;
    
    try {
      let successCount = 0;
      for (const id of Array.from(selectedIds)) {
        const response = await fetch(`${backendUrl}/results/${id}`, {
          method: 'DELETE'
        });
        if (response.ok) {
          successCount++;
        }
      }
      
      if (successCount > 0) {
        alert(`✓ Deleted ${successCount} items!`);
        setSelectedIds(new Set());
        fetchResults();
      }
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  };

  const exportJSON = async (exportAll = false) => {
    const toExport = exportAll ? results : results.filter(r => selectedIds.has(r.id));
    
    if (!exportAll && toExport.length === 0) {
      alert('Please select at least 1 item!');
      return;
    }

    const detailedResults = [];
    for (const result of toExport) {
      const detail = await fetchResultDetail(result.id);
      if (detail) {
        detailedResults.push({
          ...detail.result,
          detections: detail.detections
        });
      }
    }
    
    const dataStr = JSON.stringify({ 
      results: detailedResults,
      exportedAt: new Date().toISOString(),
      totalExported: detailedResults.length
    }, null, 2);
    
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `db_export_${exportAll ? 'all' : 'selected'}_${detailedResults.length}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const stats = {
    total: results.length,
    totalDetections: results.reduce((sum, r) => sum + r.total_detections, 0)
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Loading from database...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border p-8">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Failed to connect to backend</h3>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <button
            onClick={fetchResults}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="border-b px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Database className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-bold text-gray-800">PostgreSQL Database Results</h2>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-medium">
                ✓ Connected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchResults}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => exportJSON(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-purple-600 text-white hover:bg-purple-700 rounded-lg"
              >
                <Download className="w-4 h-4" />
                Export All
              </button>
              <button
                onClick={() => exportJSON(false)}
                disabled={selectedIds.size === 0}
                className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg ${
                  selectedIds.size > 0
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                <Download className="w-4 h-4" />
                Export ({selectedIds.size})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 border">
              <div className="text-3xl font-bold text-gray-800">{stats.total}</div>
              <div className="text-xs text-gray-600 font-medium mt-1">Total Results</div>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
              <div className="text-3xl font-bold text-blue-700">{stats.totalDetections}</div>
              <div className="text-xs text-blue-700 font-medium mt-1">Total Detections</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="🔍 Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'name' | 'detections')}
              className="px-3 py-2 border rounded-lg text-sm font-medium"
            >
              <option value="date">Sort by Date</option>
              <option value="name">Sort by Name</option>
              <option value="detections">Sort by Detections</option>
            </select>
            
            <button
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2 border rounded-lg hover:bg-gray-50 font-bold"
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === paginatedResults.length && paginatedResults.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Date
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Detections</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Image</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Model</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginatedResults.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                    <p className="text-sm font-medium text-gray-400">No results found</p>
                  </td>
                </tr>
              ) : (
                paginatedResults.map((result, index) => {
                  const rowIndex = (currentPage - 1) * itemsPerPage + index + 1;
                  
                  return (
                    <tr 
                      key={result.id} 
                      className={`hover:bg-blue-50 ${selectedIds.has(result.id) ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(result.id)}
                          onChange={() => toggleSelect(result.id)}
                          className="w-4 h-4 rounded"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm font-bold text-gray-900">{rowIndex}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-xs text-gray-600">{formatDate(result.timestamp)}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex items-center justify-center w-10 h-10 bg-blue-100 text-blue-700 text-sm font-bold rounded-full">
                          {result.total_detections}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-16 h-16 bg-gray-100 rounded-lg border-2 overflow-hidden cursor-pointer hover:border-blue-400 flex items-center justify-center"
                            onClick={() => handleViewResult(result)}
                          >
                            {result.image_data ? (
                              <img src={result.image_data} alt={result.image_name} className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon className="w-8 h-8 text-gray-300" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p 
                              className="text-sm font-semibold text-gray-900 truncate max-w-[250px] cursor-pointer hover:text-blue-600" 
                              onClick={() => handleViewResult(result)}
                            >
                              {result.image_name}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {result.image_width} × {result.image_height} px
                              {result.file_type === 'pdf' && (
                                <span className="ml-2 text-purple-600 font-medium">
                                  📄 PDF ({result.total_pages} pages)
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {result.processing_time.toFixed(2)}s
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-xs text-gray-600">{result.model_name}</p>
                        <p className="text-xs text-gray-400">{result.model_type}</p>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleViewResult(result)}
                            className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"
                            title="View Annotations"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleViewJSON(result)}
                            className="p-2 text-purple-500 hover:bg-purple-50 rounded-lg"
                            title="View JSON"
                          >
                            <Code className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="border-t px-6 py-4 flex items-center justify-between bg-gray-50">
            <div className="text-sm text-gray-600">
              Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> - <strong>{Math.min(currentPage * itemsPerPage, sortedResults.length)}</strong> of <strong>{sortedResults.length}</strong>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 hover:bg-white rounded-lg disabled:opacity-30"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-10 h-10 text-sm font-bold rounded-lg ${
                      currentPage === pageNum ? 'bg-blue-600 text-white' : 'hover:bg-white'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 hover:bg-white rounded-lg disabled:opacity-30"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {selectedIds.size > 0 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 z-50">
            <span className="text-sm">Selected <strong>{selectedIds.size}</strong> items</span>
            <div className="w-px h-8 bg-gray-600" />
            <button
              onClick={() => exportJSON(false)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg font-bold"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <button
              onClick={deleteSelected}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg font-bold"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {popupResult && (
        <AnnotationPopup 
          result={popupResult.result} 
          detections={popupResult.detections}
          onClose={() => setPopupResult(null)} 
        />
      )}

      {jsonPopupResult && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setJsonPopupResult(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="border-b px-6 py-4 flex items-center justify-between bg-gradient-to-r from-purple-50 to-blue-50">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-600 rounded-xl">
                  <Code className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Database Record - JSON</h3>
                  <p className="text-sm text-gray-600">{jsonPopupResult.result.image_name}</p>
                </div>
              </div>
              <button onClick={() => setJsonPopupResult(null)} className="p-2 hover:bg-gray-200 rounded-lg">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 bg-gray-900">
              <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap">
                {JSON.stringify({
                  result: jsonPopupResult.result,
                  detections: jsonPopupResult.detections
                }, null, 2)}
              </pre>
            </div>

            <div className="border-t px-6 py-4 flex items-center justify-between bg-gray-50">
              <div className="text-sm font-medium">
                {jsonPopupResult.detections.length} detections
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify({
                      result: jsonPopupResult.result,
                      detections: jsonPopupResult.detections
                    }, null, 2));
                    alert('✓ Copied!');
                  }}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-bold flex items-center gap-2"
                >
                  <Code className="w-4 h-4" />
                  Copy
                </button>
                <button
                  onClick={() => {
                    const dataStr = JSON.stringify({
                      result: jsonPopupResult.result,
                      detections: jsonPopupResult.detections
                    }, null, 2);
                    const blob = new Blob([dataStr], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `${jsonPopupResult.result.image_name.split('.')[0]}_db.json`;
                    link.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}