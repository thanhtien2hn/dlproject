'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Loader2, RefreshCw, Trash2, Eye, Code, CheckCircle,
  XCircle, AlertCircle, ChevronLeft, ChevronRight, Search,
  Download, Calendar, Image as ImageIcon,
  Check, X, Sparkles, Grid3X3, Ban, ZoomIn, ZoomOut,
  Move, MousePointer, RotateCcw, Undo, Redo,
  Minus
} from 'lucide-react';

interface Detection {
  class_id: number;
  class_name: string;
  confidence: number;
  bbox: number[];
}

interface SavedResult {
  id: string;
  imageName: string;
  imageData?: string; // base64 image data
  imageSize: { width: number; height: number };
  detections: Detection[];
  uatStatus: 'pass' | 'fail';
  uatNote: string;
  timestamp: string;
}

interface ResultFile {
  results: SavedResult[];
  lastUpdated: string;
}

// Class colors
const CLASS_COLORS: { [key: string]: string } = {
  'Text': '#a855f7',
  'Title': '#22c55e',
  'Section header': '#ef4444',
  'Picture': '#f97316',
  'Table': '#eab308',
  'Signature': '#ec4899',
  'Logo': '#92400e',
};

// Count detections by class
const countByClass = (detections: Detection[]): { [key: string]: number } => {
  const counts: { [key: string]: number } = {};
  detections.forEach(d => {
    counts[d.class_name] = (counts[d.class_name] || 0) + 1;
  });
  return counts;
};

// Format date
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

// ==================== ANNOTATION POPUP COMPONENT ====================
interface AnnotationPopupProps {
  result: SavedResult;
  onClose: () => void;
}

function AnnotationPopup({ result, onClose }: AnnotationPopupProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [imageLoaded, setImageLoaded] = useState(false);

  const classCounts = countByClass(result.detections);
  const legendClasses = ['Title', 'Text', 'Table', 'Picture', 'Signature', 'Section header', 'Logo'];

  // Draw annotations on canvas
  useEffect(() => {
    if (!result.imageData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Debug: Log detections data
    console.log('Drawing annotations for:', result.imageName);
    console.log('Number of detections:', result.detections?.length || 0);
    console.log('Detections:', result.detections);

    const img = new Image();
    img.onload = () => {
      // Set canvas size
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      // Draw image
      ctx.drawImage(img, 0, 0);

      // Draw bounding boxes
      result.detections.forEach((det) => {
        const [x, y, width, height] = det.bbox;
        const color = CLASS_COLORS[det.class_name] || '#6b7280';

        // Draw semi-transparent fill
        ctx.fillStyle = color + '40'; // 25% opacity
        ctx.fillRect(x, y, width, height);

        // Draw border
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);

        // Draw label at top-right corner of the box (giống Label Studio)
        const labelText = det.class_name;
        ctx.font = 'bold 11px Arial';
        const textMetrics = ctx.measureText(labelText);
        const labelPadding = 4;
        const labelHeight = 16;
        const labelWidth = textMetrics.width + labelPadding * 2;

        // Position label at top-right corner of the box
        const labelX = x + width - labelWidth;
        const labelY = y;

        // Draw label background (rounded corners effect)
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 2);
        ctx.fill();

        // Draw label text
        ctx.fillStyle = 'white';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(labelText, labelX + labelWidth / 2, labelY + labelHeight / 2);
        
        // Reset text align
        ctx.textAlign = 'left';
      });

      setImageLoaded(true);
    };
    img.onerror = () => {
      console.error('Failed to load image');
    };
    img.src = result.imageData;
  }, [result]);

  // Calculate scale to fit container
  useEffect(() => {
    if (containerRef.current && imageLoaded) {
      const containerWidth = containerRef.current.clientWidth - 48;
      const containerHeight = containerRef.current.clientHeight - 100;
      const scaleX = containerWidth / result.imageSize.width;
      const scaleY = containerHeight / result.imageSize.height;
      setScale(Math.min(scaleX, scaleY, 1));
    }
  }, [imageLoaded, result.imageSize]);

  return (
    <div className="fixed inset-0 bg-black/70 flex z-50" onClick={onClose}>
      <div 
        className="flex-1 flex flex-col bg-gray-100 m-4 rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-gray-800">{result.imageName}</h3>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              result.uatStatus === 'pass' 
                ? 'bg-green-100 text-green-700' 
                : 'bg-red-100 text-red-700'
            }`}>
              {result.uatStatus === 'pass' ? '✓ Pass' : '✗ Fail'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Canvas Area */}
          <div 
            ref={containerRef}
            className="flex-1 bg-gray-200 flex items-center justify-center p-6 overflow-auto"
          >
            <div 
              className="bg-white shadow-lg rounded-lg overflow-hidden"
              style={{ 
                transform: `scale(${scale})`,
                transformOrigin: 'center center'
              }}
            >
              {result.imageData ? (
                <canvas ref={canvasRef} className="block" />
              ) : (
                <div className="w-96 h-96 flex items-center justify-center bg-gray-100">
                  <div className="text-center text-gray-400">
                    <ImageIcon className="w-16 h-16 mx-auto mb-2" />
                    <p>Không có dữ liệu ảnh</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar - Tools */}
          <div className="w-12 bg-white border-l border-gray-200 flex flex-col items-center py-4 gap-2">
            <button className="p-2 bg-gray-100 rounded-lg text-gray-700">
              <MousePointer className="w-4 h-4" />
            </button>
            <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
              <Move className="w-4 h-4" />
            </button>
            <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="w-6 h-px bg-gray-200 my-2" />
            <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
              <Minus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Footer - Legend: Chỉ hiển thị các nhãn có trong tài liệu đã lưu */}
        <div className="bg-white border-t border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Chỉ hiển thị các class có count > 0 */}
              {Object.entries(classCounts).map(([cls, count]) => (
                <div 
                  key={cls} 
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-white"
                  style={{ 
                    borderColor: CLASS_COLORS[cls] || '#e5e7eb',
                    backgroundColor: (CLASS_COLORS[cls] || '#6b7280') + '10'
                  }}
                >
                  <span 
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: CLASS_COLORS[cls] || '#6b7280' }}
                  />
                  <span className="text-sm text-gray-700">{cls}</span>
                  <span 
                    className="text-sm font-bold"
                    style={{ color: CLASS_COLORS[cls] || '#6b7280' }}
                  >
                    {count}
                  </span>
                </div>
              ))}
              {/* Nếu không có nhãn nào */}
              {Object.keys(classCounts).length === 0 && (
                <span className="text-sm text-gray-400">Không có nhãn nào</span>
              )}
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== MAIN RESULTS TABLE COMPONENT ====================
interface ResultsTableProps {
  onViewDetail?: (result: SavedResult) => void;
}

export default function ResultsTable({ onViewDetail }: ResultsTableProps) {
  const [results, setResults] = useState<SavedResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pass' | 'fail'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [popupResult, setPopupResult] = useState<SavedResult | null>(null);
  const [jsonPopupResult, setJsonPopupResult] = useState<SavedResult | null>(null);

  // Fetch results
  const fetchResults = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/save-result');
      if (response.ok) {
        const data: ResultFile = await response.json();
        setResults(data.results || []);
      } else {
        throw new Error('Failed to fetch results');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
  }, []);

  // Filter and search
  const filteredResults = results.filter(r => {
    const matchesSearch = r.imageName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || r.uatStatus === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Pagination
  const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
  const paginatedResults = filteredResults.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Selection handlers
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

  // Delete selected
  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Bạn có chắc muốn xóa ${selectedIds.size} kết quả đã chọn?`)) return;
    alert('Chức năng xóa từng item đang được phát triển');
  };

  // Export to JSON - chỉ export những kết quả đã chọn
  const exportJSON = () => {
    if (selectedIds.size === 0) {
      alert('Vui lòng chọn ít nhất 1 kết quả để export!');
      return;
    }

    const selectedResults = results.filter(r => selectedIds.has(r.id));
    
    // Loại bỏ imageData khi export để giảm dung lượng file
    const exportData = selectedResults.map(r => ({
      ...r,
      imageData: undefined // Không export base64 image
    }));
    
    const dataStr = JSON.stringify({ 
      results: exportData,
      exportedAt: new Date().toISOString(),
      totalExported: exportData.length
    }, null, 2);
    
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `uat_results_${selectedResults.length}_items_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Stats
  const stats = {
    total: results.length,
    pass: results.filter(r => r.uatStatus === 'pass').length,
    fail: results.filter(r => r.uatStatus === 'fail').length,
    totalDetections: results.reduce((sum, r) => sum + r.detections.length, 0)
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Đang tải dữ liệu...</span>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800">Results Saved</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchResults}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={exportJSON}
                disabled={selectedIds.size === 0}
                className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                  selectedIds.size > 0
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                <Download className="w-4 h-4" />
                Export JSON {selectedIds.size > 0 && `(${selectedIds.size})`}
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
              <div className="text-xs text-gray-500">Total results</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3 border border-green-100">
              <div className="text-2xl font-bold text-green-600">{stats.pass}</div>
              <div className="text-xs text-green-600">Pass</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3 border border-red-100">
              <div className="text-2xl font-bold text-red-600">{stats.fail}</div>
              <div className="text-xs text-red-600">Fail</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
              <div className="text-2xl font-bold text-blue-600">{stats.totalDetections}</div>
              <div className="text-xs text-blue-600">Detections</div>
            </div>
          </div>

          {/* Search and Filter */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by image name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  filterStatus === 'all' 
                    ? 'bg-white text-gray-800 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterStatus('pass')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
                  filterStatus === 'pass' 
                    ? 'bg-white text-green-600 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <CheckCircle className="w-3 h-3" /> Pass
              </button>
              <button
                onClick={() => setFilterStatus('fail')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${
                  filterStatus === 'fail' 
                    ? 'bg-white text-red-600 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <XCircle className="w-3 h-3" /> Fail
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === paginatedResults.length && paginatedResults.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Completed
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <Grid3X3 className="w-4 h-4 mx-auto text-blue-500"/>
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <Ban className="w-4 h-4 mx-auto text-red-500"/>
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 mx-auto text-purple-500"/>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Image
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedResults.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center text-gray-400">
                      <AlertCircle className="w-12 h-12 mb-3" />
                      <p className="text-sm font-medium">Không có kết quả nào</p>
                      <p className="text-xs mt-1">Hãy thực hiện detection và lưu kết quả</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedResults.map((result, index) => {
                  const classCounts = countByClass(result.detections);
                  const rowIndex = (currentPage - 1) * itemsPerPage + index + 1;
                  
                  return (
                    <tr 
                      key={result.id} 
                      className={`hover:bg-gray-50 transition-colors ${
                        selectedIds.has(result.id) ? 'bg-blue-50' : ''
                      }`}
                    >
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(result.id)}
                          onChange={() => toggleSelect(result.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm font-medium text-gray-900">{rowIndex}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-gray-600">{formatDate(result.timestamp)}</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex items-center justify-center min-w-[32px] h-8 bg-blue-100 text-blue-700 text-sm font-bold rounded-full px-2">
                          {result.detections.length}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-sm text-gray-600">
                          {result.uatStatus === 'fail' ? 1 : 0}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-sm text-gray-600">
                          {result.uatStatus === 'pass' ? 1 : 0}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {result.uatStatus === 'pass' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                            <Check className="w-3 h-3" />
                            Pass
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                            <X className="w-3 h-3" />
                            Fail
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          {/* Thumbnail - Click to open popup */}
                          <div 
                            className="w-16 h-16 bg-gray-100 rounded-lg border border-gray-200 overflow-hidden cursor-pointer hover:border-blue-400 hover:shadow-md transition-all"
                            onClick={() => setPopupResult(result)}
                          >
                            {result.imageData ? (
                              <img 
                                src={result.imageData} 
                                alt={result.imageName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="w-8 h-8 text-gray-300" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p 
                              className="text-sm font-medium text-gray-900 truncate max-w-[200px] cursor-pointer hover:text-blue-600" 
                              title={result.imageName}
                              onClick={() => setPopupResult(result)}
                            >
                              {result.imageName}
                            </p>
                            <p className="text-xs text-gray-500">
                              {result.imageSize.width} × {result.imageSize.height} px
                            </p>
                            {/* Class counts */}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Object.entries(classCounts).slice(0, 3).map(([cls, count]) => (
                                <span 
                                  key={cls}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded"
                                  style={{ 
                                    backgroundColor: CLASS_COLORS[cls] + '20',
                                    color: CLASS_COLORS[cls]
                                  }}
                                >
                                  <span 
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ backgroundColor: CLASS_COLORS[cls] }}
                                  />
                                  {count}
                                </span>
                              ))}
                              {Object.keys(classCounts).length > 3 && (
                                <span className="text-xs text-gray-400">
                                  +{Object.keys(classCounts).length - 3}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setPopupResult(result)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Xem chi tiết"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setJsonPopupResult(result)}
                            className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                            title="Xem JSON"
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Hiển thị {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredResults.length)} của {filteredResults.length} kết quả
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
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
                    className={`w-8 h-8 text-sm font-medium rounded-lg transition-colors ${
                      currentPage === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Selected Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-4 z-40">
            <span className="text-sm">
              Đã chọn <strong>{selectedIds.size}</strong> kết quả
            </span>
            <div className="w-px h-6 bg-gray-700" />
            <button
              onClick={deleteSelected}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-500 hover:bg-red-600 rounded-lg text-sm font-medium transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Xóa
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
            >
              Bỏ chọn
            </button>
          </div>
        )}
      </div>

      {/* Annotation Popup */}
      {popupResult && (
        <AnnotationPopup 
          result={popupResult} 
          onClose={() => setPopupResult(null)} 
        />
      )}

      {/* JSON Popup */}
      {jsonPopupResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setJsonPopupResult(null)}>
          <div 
            className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Code className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">JSON Data</h3>
                  <p className="text-sm text-gray-500">{jsonPopupResult.imageName}</p>
                </div>
              </div>
              <button
                onClick={() => setJsonPopupResult(null)}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* JSON Content */}
            <div className="flex-1 overflow-auto p-4 bg-gray-900">
              <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap">
                {JSON.stringify(
                  {
                    id: jsonPopupResult.id,
                    imageName: jsonPopupResult.imageName,
                    imageSize: jsonPopupResult.imageSize,
                    detections: jsonPopupResult.detections,
                    uatStatus: jsonPopupResult.uatStatus,
                    uatNote: jsonPopupResult.uatNote,
                    timestamp: jsonPopupResult.timestamp
                  }, 
                  null, 
                  2
                )}
              </pre>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between bg-gray-50">
              <div className="text-sm text-gray-500">
                {jsonPopupResult.detections.length} detections • {jsonPopupResult.uatStatus === 'pass' ? '✓ Pass' : '✗ Fail'}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const dataStr = JSON.stringify({
                      id: jsonPopupResult.id,
                      imageName: jsonPopupResult.imageName,
                      imageSize: jsonPopupResult.imageSize,
                      detections: jsonPopupResult.detections,
                      uatStatus: jsonPopupResult.uatStatus,
                      uatNote: jsonPopupResult.uatNote,
                      timestamp: jsonPopupResult.timestamp
                    }, null, 2);
                    navigator.clipboard.writeText(dataStr);
                    alert('Đã copy JSON vào clipboard!');
                  }}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Code className="w-4 h-4" />
                  Copy JSON
                </button>
                <button
                  onClick={() => {
                    const dataStr = JSON.stringify({
                      id: jsonPopupResult.id,
                      imageName: jsonPopupResult.imageName,
                      imageSize: jsonPopupResult.imageSize,
                      detections: jsonPopupResult.detections,
                      uatStatus: jsonPopupResult.uatStatus,
                      uatNote: jsonPopupResult.uatNote,
                      timestamp: jsonPopupResult.timestamp
                    }, null, 2);
                    const blob = new Blob([dataStr], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `${jsonPopupResult.imageName.split('.')[0]}_data.json`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                  }}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download JSON
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}