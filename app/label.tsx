'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { 
  Upload, Download, Save, Loader2, AlertCircle, 
  ScanText, CheckCircle, XCircle, AlertTriangle,
  BarChart2, RefreshCw, UploadCloud, Trash2, FileJson, List
} from 'lucide-react';

interface Detection {
  class_id: number;
  class_name: string;
  confidence: number;
  bbox: number[]; // [x, y, width, height]
}

interface BoundingBox extends Detection {
  id: string;
  color: string;
}

interface LabeledImage {
  imageUrl: string;
  imageName: string;
  boxes: BoundingBox[];
  imageWidth: number;
  imageHeight: number;
  timestamp: string;
}

interface ModelInfo {
  model_loaded: boolean;
  model_path: string;
  model_type: string;
  num_classes: number;
  class_names: string[];
}

interface SavedResult {
  id: string;
  imageName: string;
  imageSize: { width: number; height: number };
  detections: {
    class_id: number;
    class_name: string;
    confidence: number;
    bbox: number[];
  }[];
  uatStatus: 'pass' | 'fail';
  uatNote: string;
  timestamp: string;
}

// Fixed class colors matching the HTML design
const CLASS_COLORS: { [key: string]: string } = {
  'Text': '#a855f7',      // purple-500
  'Title': '#22c55e',     // green-500
  'Section header': '#ef4444', // red-500
  'Picture': '#f97316',   // orange-500
  'Table': '#eab308',     // yellow-500
  'Signature': '#ec4899', // pink-500
  'Logo': '#92400e',      // amber-800
};

const getClassColor = (className: string): string => {
  return CLASS_COLORS[className] || '#6b7280';
};

// Generate unique ID
let idCounter = 0;
const generateId = () => {
  idCounter += 1;
  return `box_${idCounter}`;
};

function UATDashboard() {
  // State
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [currentImageFile, setCurrentImageFile] = useState<File | null>(null);
  const [imageName, setImageName] = useState<string>('');
  const [boxes, setBoxes] = useState<BoundingBox[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [labeledImages, setLabeledImages] = useState<LabeledImage[]>([]);
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });
  const [isDetecting, setIsDetecting] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.25);
  const [iouThreshold, setIouThreshold] = useState(0.45);
  const [error, setError] = useState<string | null>(null);
  const [backendUrl, setBackendUrl] = useState('http://localhost:8000');
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [backendStatus, setBackendStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [uatStatus, setUatStatus] = useState<'pass' | 'fail'>('pass');
  const [uatNote, setUatNote] = useState('');
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [fileSize, setFileSize] = useState<string>('');
  const [sessionId] = useState(() => Math.floor(Math.random() * 1000));
  
  // New state for saved results
  const [isSaving, setIsSaving] = useState(false);
  const [savedResultsCount, setSavedResultsCount] = useState(0);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // State để track image đã load chưa
  const [imageLoaded, setImageLoaded] = useState(false);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkBackendStatus();
    fetchSavedResultsCount();
    const interval = setInterval(checkBackendStatus, 30000);
    return () => clearInterval(interval);
  }, [backendUrl]);

  // Sử dụng useCallback để đảm bảo drawCanvas được gọi đúng cách
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !currentImage || !imageLoaded) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Đảm bảo image đã load xong
    if (image.naturalWidth === 0 || image.naturalHeight === 0) return;

    canvas.width = image.width;
    canvas.height = image.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const scaleX = image.width / imageNaturalSize.width;
    const scaleY = image.height / imageNaturalSize.height;

    boxes.forEach((box) => {
      drawBox(ctx, box, box.id === selectedBoxId, scaleX, scaleY);
    });
  }, [boxes, currentImage, selectedBoxId, imageNaturalSize, imageLoaded]);

  useEffect(() => {
    if (currentImage && imageLoaded) {
      drawCanvas();
    }
  }, [drawCanvas, currentImage, imageLoaded]);

  // Clear save message after 3 seconds
  useEffect(() => {
    if (saveMessage) {
      const timer = setTimeout(() => setSaveMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [saveMessage]);

  const checkBackendStatus = async () => {
    setBackendStatus('checking');
    try {
      const response = await fetch(`${backendUrl}/`);
      if (response.ok) {
        setBackendStatus('connected');
        fetchModelInfo();
      } else {
        setBackendStatus('disconnected');
      }
    } catch {
      setBackendStatus('disconnected');
    }
  };

  const fetchModelInfo = async () => {
    try {
      const response = await fetch(`${backendUrl}/model/info`);
      if (response.ok) {
        const data: ModelInfo = await response.json();
        setModelInfo(data);
      }
    } catch (err) {
      console.error('Failed to fetch model info:', err);
    }
  };

  // Fetch saved results count from file
  const fetchSavedResultsCount = async () => {
    try {
      const response = await fetch('/api/save-result');
      if (response.ok) {
        const data = await response.json();
        setSavedResultsCount(data.results?.length || 0);
      }
    } catch (err) {
      console.error('Failed to fetch saved results:', err);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Hàm xử lý file riêng biệt - FIX: Tách logic xử lý file ra
  const processFile = useCallback((file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Vui lòng chọn file ảnh (jpg, png, etc)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File quá lớn! Tối đa 10MB.');
      return;
    }

    // Reset states trước khi load ảnh mới
    setImageLoaded(false);
    setCurrentImage(null);
    setBoxes([]);
    setError(null);
    setProcessingTime(null);
    
    setCurrentImageFile(file);
    setImageName(file.name);
    setFileSize(formatFileSize(file.size));

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (!result) {
        setError('Không thể đọc file');
        return;
      }
      
      const img = new Image();
      img.onload = () => {
        setImageNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
        setCurrentImage(result);
        // Đặt timeout nhỏ để đảm bảo state đã update
        setTimeout(() => {
          setImageLoaded(true);
        }, 50);
      };
      img.onerror = () => {
        setError('Không thể load ảnh. File có thể bị lỗi.');
      };
      img.src = result;
    };
    reader.onerror = () => {
      setError('Lỗi khi đọc file');
    };
    reader.readAsDataURL(file);
  }, []);

  // FIX: Sửa lại handleImageUpload
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    // Reset input để có thể upload lại cùng file
    if (e.target) {
      e.target.value = '';
    }
  }, [processFile]);

  // FIX: Sửa lại handleDrop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      processFile(file);
    }
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // FIX: Click handler riêng cho drop zone
  const handleDropZoneClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const detectObjects = async () => {
    if (!currentImageFile) {
      setError('Vui lòng upload ảnh trước!');
      return;
    }

    if (backendStatus !== 'connected') {
      setError('Backend không kết nối! Vui lòng kiểm tra server đang chạy.');
      return;
    }

    setIsDetecting(true);
    setError(null);
    const startTime = Date.now();

    try {
      const formData = new FormData();
      formData.append('file', currentImageFile, currentImageFile.name);

      const url = `${backendUrl}/detect?mode=ocr&confidence=${confidenceThreshold}`;
      

      const detectResponse = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (!detectResponse.ok) {
        const errorText = await detectResponse.text();
        let errorMessage = 'Detection failed';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const result = await detectResponse.json();
      const endTime = Date.now();
      setProcessingTime((endTime - startTime) / 1000);

      const detections: BoundingBox[] = result.detections.map((det: Detection) => ({
        ...det,
        id: generateId(),
        color: getClassColor(det.class_name),
      }));

      setBoxes(detections);
      
      if (detections.length === 0) {
        setError('Không phát hiện được object nào. Thử giảm confidence threshold.');
      }
    } catch (err) {
      console.error('Detection error:', err);
      console.error('MFK:', err);
      setError(`Lỗi khi phát hiện: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsDetecting(false);
    }
  };

  const drawBox = (
    ctx: CanvasRenderingContext2D, 
    box: BoundingBox, 
    isSelected: boolean,
    scaleX: number,
    scaleY: number
  ) => {
    const [x, y, width, height] = box.bbox;
    
    const scaledX = x * scaleX;
    const scaledY = y * scaleY;
    const scaledWidth = width * scaleX;
    const scaledHeight = height * scaleY;

    // Draw semi-transparent fill
    ctx.fillStyle = box.color + '1A'; // 10% opacity
    ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);
    
    // Draw border
    ctx.strokeStyle = box.color;
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);

    // Draw label
    const labelText = `${box.class_name} ${box.confidence.toFixed(2)}`;
    ctx.font = 'bold 12px Arial';
    const textWidth = ctx.measureText(labelText).width;

    // Label background
    ctx.fillStyle = box.color;
    ctx.fillRect(scaledX, scaledY, textWidth + 6, 18);
    
    // Label text
    ctx.fillStyle = 'white';
    ctx.fillText(labelText, scaledX + 3, scaledY + 13);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = imageNaturalSize.width / canvas.width;
    const scaleY = imageNaturalSize.height / canvas.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const clickedBox = boxes.find((box) => {
      const [bx, by, bw, bh] = box.bbox;
      return x >= bx && x <= bx + bw && y >= by && y <= by + bh;
    });

    setSelectedBoxId(clickedBox ? clickedBox.id : null);
  };

  // Handle image load event
  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    // Gọi drawCanvas sau khi image đã load
    setTimeout(() => {
      drawCanvas();
    }, 0);
  }, [drawCanvas]);

  // NEW: Save annotation to file via API
  const saveAnnotation = async () => {
    if (!currentImage || boxes.length === 0) {
      setSaveMessage({ type: 'error', text: 'Không có dữ liệu để lưu!' });
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const resultData = {
        imageName,
        imageData: currentImage, // Lưu base64 image data
        imageSize: { width: imageNaturalSize.width, height: imageNaturalSize.height },
        detections: boxes.map(b => ({
          class_id: b.class_id,
          class_name: b.class_name,
          confidence: b.confidence,
          bbox: b.bbox
        })),
        uatStatus,
        uatNote,
      };

      const response = await fetch('/api/save-result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(resultData),
      });

      const result = await response.json();

      if (response.ok) {
        setSaveMessage({ 
          type: 'success', 
          text: `Đã lưu thành công! (Tổng: ${result.totalResults} kết quả)` 
        });
        setSavedResultsCount(result.totalResults);
        
        // Also save to local state
        const annotation: LabeledImage = {
          imageUrl: currentImage,
          imageName: imageName,
          boxes: boxes,
          imageWidth: imageNaturalSize.width,
          imageHeight: imageNaturalSize.height,
          timestamp: new Date().toISOString(),
        };
        setLabeledImages([...labeledImages, annotation]);
      } else if (response.status === 409 && result.error === 'duplicate') {
        // Xử lý lỗi trùng tên file
        setSaveMessage({ 
          type: 'error', 
          text: result.message || `Ảnh "${imageName}" đã được lưu trước đó!`
        });
      } else {
        throw new Error(result.error || 'Failed to save');
      }
    } catch (err) {
      console.error('Save error:', err);
      setSaveMessage({ 
        type: 'error', 
        text: `Lỗi khi lưu: ${err instanceof Error ? err.message : 'Unknown error'}` 
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Clear all saved results
  const clearAllResults = async () => {
    if (!confirm('Bạn có chắc muốn xóa tất cả kết quả đã lưu?')) return;

    try {
      const response = await fetch('/api/save-result', {
        method: 'DELETE',
      });

      if (response.ok) {
        setSavedResultsCount(0);
        setSaveMessage({ type: 'success', text: 'Đã xóa tất cả kết quả!' });
      }
    } catch (err) {
      console.error('Clear error:', err);
      setSaveMessage({ type: 'error', text: 'Lỗi khi xóa kết quả!' });
    }
  };

  const exportJSON = () => {
    if (boxes.length === 0) {
      alert('Chưa có dữ liệu để xuất!');
      return;
    }

    const exportData = {
      imageName,
      imageSize: { width: imageNaturalSize.width, height: imageNaturalSize.height },
      detections: boxes.map(b => ({
        class_id: b.class_id,
        class_name: b.class_name,
        confidence: b.confidence,
        bbox: b.bbox
      })),
      uatStatus,
      uatNote,
      timestamp: new Date().toISOString()
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${imageName.split('.')[0]}_result.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const avgConfidence = boxes.length > 0 
    ? (boxes.reduce((sum, b) => sum + b.confidence, 0) / boxes.length).toFixed(2)
    : '0.00';

  const lowConfidenceBoxes = boxes.filter(b => b.confidence < 0.5);

  const legendClasses = ['Text', 'Title', 'Section header', 'Picture', 'Table', 'Signature', 'Logo'];

  return (
    <div className="bg-gray-50 h-screen flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white p-2 rounded-lg">
            <ScanText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800">Dashboard</h1>
            <p className="text-xs text-gray-500">Document Layout Analysis System • Version 2.1</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Saved Results Counter - Clickable */}
          <Link 
            href="/results"
            className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer"
          >
            <FileJson className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-700">
              {savedResultsCount} Saved results
            </span>
          </Link>
          {/* View Results Button */}
          <Link
            href="/results"
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <List className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-700">List</span>
          </Link>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex overflow-hidden">
        {/* LEFT SIDEBAR */}
        <aside className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-y-auto shrink-0">
          {/* 1. Data Source */}
          <div className="p-5 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">1. Data Test</h3>

            {/* FIX: Tách input ra khỏi drop zone để tránh conflict */}
            <input 
              ref={fileInputRef}
              type="file" 
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            
            <div 
              className="relative border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 transition-colors cursor-pointer bg-gray-50"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={handleDropZoneClick}
            >
              <UploadCloud className="mx-auto h-6 w-6 text-gray-400 mb-1" />
              <p className="text-xs text-gray-500">
                drag/ drop image or click
              </p>
            </div>

            {imageName && (
              <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded text-sm">
                <p className="text-green-700 truncate font-medium">✓ {imageName}</p>
                <p className="text-green-600 text-xs mt-1">
                  {imageNaturalSize.width} × {imageNaturalSize.height} px • {fileSize}
                </p>
              </div>
            )}
          </div>

          {/* 2. Model Config */}
          <div className="p-5 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">2. Configuration Model</h3>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Model Version</label>
              <select className="w-full border-gray-300 border rounded-md py-2 px-3 text-sm bg-white shadow-sm">
                <option>{modelInfo?.model_path || 'v2_best.pt'} (Current)</option>
                <option>v1_prod.pt (Baseline)</option>
              </select>
            </div>

            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-600">Confidence Threshold</label>
                <span className="text-xs font-bold text-blue-600">{confidenceThreshold.toFixed(2)}</span>
              </div>
              <input 
                type="range" 
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" 
                min="0" 
                max="1" 
                step="0.05" 
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
              />
            </div>

            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-600">IoU Threshold</label>
                <span className="text-xs font-bold text-blue-600">{iouThreshold.toFixed(2)}</span>
              </div>
              <input 
                type="range" 
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" 
                min="0" 
                max="1" 
                step="0.05" 
                value={iouThreshold}
                onChange={(e) => setIouThreshold(parseFloat(e.target.value))}
              />
            </div>

            {/* Backend Status */}
            <div className={`p-2 rounded border text-xs ${
              backendStatus === 'connected' 
                ? 'bg-green-50 border-green-200 text-green-700' 
                : backendStatus === 'disconnected'
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-yellow-50 border-yellow-200 text-yellow-700'
            }`}>
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {backendStatus === 'connected' ? '✓ Backend Connected' : 
                   backendStatus === 'disconnected' ? '✗ Backend Offline' : 
                   '⟳ Checking...'}
                </span>
                <button onClick={checkBackendStatus} className="hover:opacity-70">
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Detect Button */}
            <button
              onClick={detectObjects}
              disabled={!currentImageFile || backendStatus !== 'connected' || isDetecting}
              className={`w-full mt-4 py-2.5 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
                !currentImageFile || backendStatus !== 'connected' || isDetecting
                  ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
              }`}
            >
              {isDetecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                '🔍Detection'
              )}
            </button>
          </div>

          {/* 3. UAT Feedback */}
          <div className="p-5 bg-blue-50 flex-1">
            <h3 className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-4">3. Evaluate</h3>

            <div className="flex gap-3 mb-4">
              <label className="flex-1 cursor-pointer">
                <input 
                  type="radio" 
                  name="status" 
                  className="peer sr-only" 
                  checked={uatStatus === 'pass'}
                  onChange={() => setUatStatus('pass')}
                />
                
              </label>
              <label className="flex-1 cursor-pointer">
                <input 
                  type="radio" 
                  name="status" 
                  className="peer sr-only"
                  checked={uatStatus === 'fail'}
                  onChange={() => setUatStatus('fail')}
                />
                
              </label>
            </div>

            <div className="mb-4">
              <textarea 
                placeholder="Note (optional...)" 
                className="w-full border border-gray-300 rounded-md p-2 text-sm h-20 resize-none focus:ring-blue-500 focus:border-blue-500"
                value={uatNote}
                onChange={(e) => setUatNote(e.target.value)}
              />
            </div>

            {/* Save Message */}
            {saveMessage && (
              <div className={`mb-3 p-2 rounded text-xs flex items-center gap-2 ${
                saveMessage.type === 'success' 
                  ? 'bg-green-100 text-green-700 border border-green-200' 
                  : 'bg-red-100 text-red-700 border border-red-200'
              }`}>
                {saveMessage.type === 'success' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                {saveMessage.text}
              </div>
            )}

            <button 
              onClick={saveAnnotation}
              disabled={boxes.length === 0 || isSaving}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Save
                </>
              )}
            </button>

            {/* Clear All Button */}
            {savedResultsCount > 0 && (
              <button 
                onClick={clearAllResults}
                className="w-full mt-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 font-medium py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2 text-sm"
              >
                <Trash2 className="w-3 h-3" /> Delete all ({savedResultsCount})
              </button>
            )}
          </div>
        </aside>

        {/* RIGHT AREA */}
        <section className="flex-1 bg-gray-100 p-4 overflow-auto flex gap-4">
          {/* Image Preview Panel - TĂNG KÍCH THƯỚC */}
          <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden min-w-0">
            <div className="border-b border-gray-100 px-4 py-3 flex justify-between items-center shrink-0">
              <h2 className="text-sm font-semibold text-gray-700">Visual Preview</h2>
              <div className="flex gap-2">
                {imageNaturalSize.width > 0 && (
                  <>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                      {imageNaturalSize.width} x {imageNaturalSize.height} px
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                      {fileSize}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* FIX: Tăng kích thước vùng hiển thị ảnh */}
            <div className="flex-1 p-4 flex items-center justify-center bg-gray-50/50 overflow-auto relative min-h-0">
              {error && (
                <div className="absolute top-4 left-4 right-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start z-10">
                  <AlertCircle className="w-4 h-4 mr-2 text-red-500 flex-shrink-0 mt-0.5" />
                  <span className="text-red-700 text-sm">{error}</span>
                </div>
              )}

              {currentImage ? (
                <div className="relative shadow-lg w-full h-full flex items-center justify-center">
                  <img
                    ref={imageRef}
                    src={currentImage}
                    alt="Document"
                    className="hidden"
                    onLoad={handleImageLoad}
                  />
                  <canvas 
                    ref={canvasRef} 
                    onClick={handleCanvasClick} 
                    className="object-contain rounded border border-gray-300 cursor-pointer"
                    style={{ 
                      maxWidth: '100%', 
                      maxHeight: 'calc(100vh - 200px)',  // Tăng từ 350px xuống 200px
                      width: 'auto',
                      height: 'auto'
                    }}
                  />
                </div>
              ) : (
                <div className="text-center p-8">
                  <Upload className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500 font-medium">Upload a photo to get started</p>
                </div>
              )}

              {/* Low confidence warning */}
              {lowConfidenceBoxes.length > 0 && (
                <div className="absolute bottom-4 right-4 bg-yellow-100 border border-yellow-300 text-yellow-800 px-3 py-2 rounded-lg shadow-md text-xs flex items-center gap-2 animate-pulse">
                  <AlertTriangle className="h-4 w-4" />
                  Phát hiện {lowConfidenceBoxes.length} object độ tin cậy thấp (&lt;0.5)
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="border-t border-gray-100 px-4 py-2 bg-gray-50 rounded-b-xl flex gap-4 overflow-x-auto shrink-0">
              {legendClasses.map((cls) => (
                <div key={cls} className="flex items-center text-xs text-gray-600 whitespace-nowrap">
                  <span 
                    className="w-3 h-3 inline-block rounded-sm mr-1.5" 
                    style={{ backgroundColor: CLASS_COLORS[cls] }}
                  />
                  {cls}
                </div>
              ))}
            </div>
          </div>

          {/* Analysis Detail Panel - THU NHỎ */}
          <div className="w-64 flex flex-col gap-4 shrink-0">
            {/* Summary Card */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-blue-500" /> Statistical
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded border border-gray-100">
                  <span className="text-xs text-gray-600">Total Objects</span>
                  <span className="text-sm font-bold text-gray-900">{boxes.length}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-green-50 rounded border border-green-100">
                  <span className="text-xs text-green-700">Avg reliability</span>
                  <span className="text-sm font-bold text-green-700">{avgConfidence}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-blue-50 rounded border border-blue-100">
                  <span className="text-xs text-blue-700">Process time</span>
                  <span className="text-sm font-bold text-blue-700">
                    {processingTime ? `${processingTime.toFixed(1)}s` : '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Object List */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex-1 overflow-hidden flex flex-col min-h-0">
              <h3 className="text-sm font-bold text-gray-800 mb-3 shrink-0">Identification Details</h3>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                {boxes.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No results yet</p>
                ) : (
                  boxes.map((box) => {
                    const isLowConfidence = box.confidence < 0.5;
                    return (
                      <div 
                        key={box.id}
                        onClick={() => setSelectedBoxId(box.id === selectedBoxId ? null : box.id)}
                        className={`p-2 rounded border transition-colors flex justify-between items-center cursor-pointer ${
                          isLowConfidence 
                            ? 'border-red-200 bg-red-50 hover:bg-red-100' 
                            : box.id === selectedBoxId
                            ? 'border-blue-300 bg-blue-50'
                            : 'border-gray-100 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-2 h-2 rounded-full shrink-0" 
                            style={{ backgroundColor: box.color }}
                          />
                          <span className={`text-xs font-medium ${isLowConfidence ? 'text-red-800' : 'text-gray-700'}`}>
                            {box.class_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {isLowConfidence && <AlertCircle className="h-3 w-3 text-red-500" />}
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            isLowConfidence 
                              ? 'text-red-600 bg-white border border-red-200' 
                              : 'text-green-600 bg-green-50'
                          }`}>
                            {box.confidence.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 text-center shrink-0">
                <button 
                  onClick={exportJSON}
                  disabled={boxes.length === 0}
                  className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400 font-medium flex items-center justify-center gap-1 w-full"
                >
                  <Download className="w-3 h-3" /> Export JSON
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

// Export with client-side only rendering
export default function UATDashboardPage() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="bg-gray-50 h-screen flex items-center justifhttp://localhost:8000/detecty-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  return <UATDashboard />;
}