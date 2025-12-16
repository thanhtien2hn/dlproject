'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Upload, Download, Save, Loader2, AlertCircle, 
  ScanText, CheckCircle, XCircle, AlertTriangle,
  BarChart2, RefreshCw, UploadCloud, Trash2, FileJson, List,
  ExternalLink, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2
} from 'lucide-react';

interface Detection {
  class_id: number;
  class_name: string;
  confidence: number;
  bbox: number[];
  page?: number;
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

interface PDFPageImage {
  pageNumber: number;
  imageUrl: string;
  width: number;
  height: number;
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

// THAY ĐỔI: Tăng giới hạn file size từ 20MB lên 100MB
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_FILE_SIZE_TEXT = '100MB'; // Text hiển thị

const getClassColor = (className: string): string => {
  return CLASS_COLORS[className] || '#6b7280';
};

let idCounter = 0;
const generateId = () => {
  idCounter += 1;
  return `box_${idCounter}`;
};

function UATDashboard() {
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
  // const [backendUrl, setBackendUrl] = useState('http://localhost:8000');
  const [backendUrl, setBackendUrl] = useState('http://10.0.61.96:8007');
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [backendStatus, setBackendStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [uatStatus, setUatStatus] = useState<'pass' | 'fail'>('pass');
  const [uatNote, setUatNote] = useState('');
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [fileSize, setFileSize] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedResultsCount, setSavedResultsCount] = useState(0);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isPDF, setIsPDF] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfPages, setPdfPages] = useState<PDFPageImage[]>([]);
  const [isConvertingPDF, setIsConvertingPDF] = useState(false);
  const [pdfJsLoaded, setPdfJsLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load PDF.js
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    script.onload = () => {
      if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
        (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        setPdfJsLoaded(true);
        console.log('PDF.js loaded successfully');
      }
    };
    script.onerror = () => {
      console.error('Failed to load PDF.js');
      setError('Không thể load PDF.js library');
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  // Keyboard shortcuts for zoom
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          handleZoomIn();
        } else if (e.key === '-') {
          e.preventDefault();
          handleZoomOut();
        } else if (e.key === '0') {
          e.preventDefault();
          handleResetZoom();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoom]);

  useEffect(() => {
    checkBackendStatus();
    fetchSavedResultsCount();
    const interval = setInterval(checkBackendStatus, 30000);
    return () => clearInterval(interval);
  }, [backendUrl]);

  const drawCanvas = useCallback(() => {
    if (isPDF) {
      const currentPageData = pdfPages.find(p => p.pageNumber === currentPage);
      if (!currentPageData) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const scaleX = img.width / currentPageData.width;
        const scaleY = img.height / currentPageData.height;

        const pageBoxes = boxes.filter(b => b.page === currentPage);
        pageBoxes.forEach((box) => {
          drawBox(ctx, box, box.id === selectedBoxId, scaleX, scaleY);
        });
      };
      img.src = currentPageData.imageUrl;

    } else {
      const canvas = canvasRef.current;
      const image = imageRef.current;
      if (!canvas || !image || !currentImage || !imageLoaded) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

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
    }
  }, [boxes, currentImage, selectedBoxId, imageNaturalSize, imageLoaded, isPDF, pdfPages, currentPage]);

  useEffect(() => {
    if (currentImage && (imageLoaded || (isPDF && pdfPages.length > 0))) {
      drawCanvas();
    }
  }, [drawCanvas, currentImage, imageLoaded, isPDF, pdfPages]);

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

  const convertPDFToImages = async (file: File): Promise<PDFPageImage[]> => {
    if (!pdfJsLoaded) {
      throw new Error('PDF.js chưa được load. Vui lòng đợi...');
    }

    setIsConvertingPDF(true);
    try {
      const pdfjsLib = (window as any).pdfjsLib;
      if (!pdfjsLib) {
        throw new Error('PDF.js không khả dụng');
      }

      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      
      console.log(`PDF loaded: ${pdf.numPages} pages`);
      
      const pages: PDFPageImage[] = [];
      
      for (let i = 1; i <= pdf.numPages; i++) {
        console.log(`Converting page ${i}/${pdf.numPages}...`);
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Cannot get canvas context');
        }
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };
        
        await page.render(renderContext).promise;
        
        const imageUrl = canvas.toDataURL('image/png');
        
        pages.push({
          pageNumber: i,
          imageUrl: imageUrl,
          width: viewport.width,
          height: viewport.height
        });
        
        console.log(`Page ${i} converted successfully`);
      }
      
      console.log(`All ${pages.length} pages converted`);
      return pages;
      
    } catch (err) {
      console.error('PDF conversion error:', err);
      throw err;
    } finally {
      setIsConvertingPDF(false);
    }
  };

  const processFile = useCallback(async (file: File) => {
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isPDFFile = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    
    if (!isImage && !isPDFFile) {
      setError('Vui lòng chọn file ảnh (jpg, png) hoặc PDF');
      return;
    }

    // THAY ĐỔI: Kiểm tra với giới hạn mới 100MB
    if (file.size > MAX_FILE_SIZE) {
      setError(`File quá lớn! Tối đa ${MAX_FILE_SIZE_TEXT}.`);
      return;
    }

    setImageLoaded(false);
    setCurrentImage(null);
    setBoxes([]);
    setError(null);
    setProcessingTime(null);
    setIsPDF(isPDFFile);
    setTotalPages(1);
    setCurrentPage(1);
    setPdfPages([]);
    setZoom(1);
    
    setCurrentImageFile(file);
    setImageName(file.name);
    setFileSize(formatFileSize(file.size));

    if (isPDFFile) {
      if (!pdfJsLoaded) {
        setError('Đang load PDF.js... Vui lòng đợi vài giây và thử lại.');
        return;
      }

      try {
        console.log('Starting PDF conversion...');
        const pages = await convertPDFToImages(file);
        console.log('PDF conversion completed:', pages.length, 'pages');
        
        setPdfPages(pages);
        setTotalPages(pages.length);
        setCurrentPage(1);
        
        if (pages.length > 0) {
          setCurrentImage(pages[0].imageUrl);
          setImageNaturalSize({ width: pages[0].width, height: pages[0].height });
          setImageLoaded(true);
        }
      } catch (err) {
        console.error('PDF processing error:', err);
        setError(`Không thể convert PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    } else {
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
    }
  }, [pdfJsLoaded]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    if (e.target) {
      e.target.value = '';
    }
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
      processFile(file);
    }
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

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

      const url = `${backendUrl}/detect?confidence=${confidenceThreshold}&iou=${iouThreshold}`;

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

      let allDetections: Detection[] = [];
      
      if (result.file_type === 'pdf' && result.pages) {
        setTotalPages(result.total_pages || 1);
        result.pages.forEach((page: any) => {
          if (page.detections && Array.isArray(page.detections)) {
            allDetections = allDetections.concat(page.detections);
          }
        });
        
        if (result.pages.length > 0 && result.pages[0]) {
          setImageNaturalSize({
            width: result.pages[0].image_width || 595,
            height: result.pages[0].image_height || 842
          });
        }
      } else if (result.detections && Array.isArray(result.detections)) {
        allDetections = result.detections;
        setTotalPages(1);
      } else {
        console.warn('Unexpected response format:', result);
        setError('Response format không đúng từ backend');
        return;
      }

      const detections: BoundingBox[] = allDetections.map((det: Detection) => ({
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

    ctx.fillStyle = box.color + '1A';
    ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);
    
    ctx.strokeStyle = box.color;
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);

    const labelText = `${box.class_name} ${box.confidence.toFixed(2)}`;
    ctx.font = 'bold 12px Arial';
    const textWidth = ctx.measureText(labelText).width;

    ctx.fillStyle = box.color;
    ctx.fillRect(scaledX, scaledY, textWidth + 6, 18);
    
    ctx.fillStyle = 'white';
    ctx.fillText(labelText, scaledX + 3, scaledY + 13);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const currentPageData = isPDF ? pdfPages.find(p => p.pageNumber === currentPage) : null;
    const refWidth = isPDF && currentPageData ? currentPageData.width : imageNaturalSize.width;
    const refHeight = isPDF && currentPageData ? currentPageData.height : imageNaturalSize.height;
    
    const scaleX = refWidth / canvas.width;
    const scaleY = refHeight / canvas.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const relevantBoxes = isPDF ? boxes.filter(b => b.page === currentPage) : boxes;
    
    const clickedBox = relevantBoxes.find((box) => {
      const [bx, by, bw, bh] = box.bbox;
      return x >= bx && x <= bx + bw && y >= by && y <= by + bh;
    });

    setSelectedBoxId(clickedBox ? clickedBox.id : null);
  };

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    setTimeout(() => {
      drawCanvas();
    }, 0);
  }, [drawCanvas]);

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
      const prevPage = pdfPages.find(p => p.pageNumber === currentPage - 1);
      if (prevPage) {
        setCurrentImage(prevPage.imageUrl);
        setImageNaturalSize({ width: prevPage.width, height: prevPage.height });
      }
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
      const nextPage = pdfPages.find(p => p.pageNumber === currentPage + 1);
      if (nextPage) {
        setCurrentImage(nextPage.imageUrl);
        setImageNaturalSize({ width: nextPage.width, height: nextPage.height });
      }
    }
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.25, 0.25));
  };

  const handleResetZoom = () => {
    setZoom(1);
  };

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
        imageData: isPDF ? pdfPages[0]?.imageUrl : currentImage,
        imageSize: { width: imageNaturalSize.width, height: imageNaturalSize.height },
        detections: boxes.map(b => ({
          class_id: b.class_id,
          class_name: b.class_name,
          confidence: b.confidence,
          bbox: b.bbox,
          page: b.page
        })),
        uatStatus,
        uatNote,
        isPDF,
        totalPages,
        pdfPages: isPDF ? pdfPages.map(p => ({ pageNumber: p.pageNumber, imageUrl: p.imageUrl })) : undefined
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
        bbox: b.bbox,
        page: b.page
      })),
      uatStatus,
      uatNote,
      isPDF,
      totalPages,
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
  const currentPageBoxes = isPDF ? boxes.filter(b => b.page === currentPage) : boxes;

  return (
    <div className="bg-gray-50 h-screen flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white p-2 rounded-lg">
            <ScanText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800">Dashboard</h1>
            <p className="text-xs text-gray-500">Document Layout Analysis System • Version 2.2 • Max {MAX_FILE_SIZE_TEXT}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a 
            href="/results"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer"
          >
            <FileJson className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-700">
              {savedResultsCount} Saved results
            </span>
            <ExternalLink className="w-3 h-3 text-blue-500" />
          </a>
          
          <a
            href="/results"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <List className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-700">List</span>
            <ExternalLink className="w-3 h-3 text-gray-500" />
          </a>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-y-auto shrink-0">
          <div className="p-5 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">1. Data Test</h3>

            <input 
              ref={fileInputRef}
              type="file" 
              accept="image/*,application/pdf"
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
                drag/drop image or PDF
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Max {MAX_FILE_SIZE_TEXT}
              </p>
            </div>

            {!pdfJsLoaded && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                ⏳ Đang load PDF.js...
              </div>
            )}

            {imageName && (
              <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded text-sm">
                <p className="text-green-700 truncate font-medium">✓ {imageName}</p>
                <p className="text-green-600 text-xs mt-1">
                  {imageNaturalSize.width} × {imageNaturalSize.height} px • {fileSize}
                  {isPDF && <span className="ml-2 bg-red-100 text-red-700 px-1.5 rounded text-xs font-medium">PDF ({totalPages} pages)</span>}
                </p>
              </div>
            )}
          </div>

          <div className="p-5 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">2. Configuration Model</h3>

            {/* <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Model Version</label>
              <select className="w-full border-gray-300 border rounded-md py-2 px-3 text-sm bg-white shadow-sm">
                <option>{modelInfo?.model_path || 'best.pt'} (Current)</option>
              </select>
            </div> */}

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
                '🔍 Detection'
              )}
            </button>
          </div>

          <div className="p-5 bg-blue-50 flex-1">
            <h3 className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-4">3. Evaluate</h3>

            <div className="flex gap-3 mb-4">
            </div>

            <div className="mb-4">
              <textarea 
                placeholder="Note (optional...)" 
                className="w-full border border-gray-300 rounded-md p-2 text-sm text-gray-900 h-20 resize-none focus:ring-blue-500 focus:border-blue-500"
                value={uatNote}
                onChange={(e) => setUatNote(e.target.value)}
              />
            </div>

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
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Save
                </>
              )}
            </button>

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

        <section className="flex-1 bg-gray-100 p-4 overflow-auto flex gap-4">
          <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden min-w-0">
            <div className="border-b border-gray-100 px-4 py-3 flex justify-between items-center shrink-0">
              <h2 className="text-sm font-semibold text-gray-700">Visual Preview</h2>
              <div className="flex gap-2 items-center">
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={handleZoomOut}
                    disabled={zoom <= 0.25}
                    className="p-1.5 hover:bg-white rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Zoom Out (Ctrl + -)"
                  >
                    <ZoomOut className="w-4 h-4 text-gray-600" />
                  </button>
                  <span className="text-xs font-medium text-gray-700 px-2 min-w-[3rem] text-center">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    onClick={handleZoomIn}
                    disabled={zoom >= 3}
                    className="p-1.5 hover:bg-white rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Zoom In (Ctrl + +)"
                  >
                    <ZoomIn className="w-4 h-4 text-gray-600" />
                  </button>
                  <button
                    onClick={handleResetZoom}
                    className="p-1.5 hover:bg-white rounded transition-colors ml-1"
                    title="Reset Zoom (Ctrl + 0)"
                  >
                    <Maximize2 className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
                {imageNaturalSize.width > 0 && (
                  <>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                      {imageNaturalSize.width} x {imageNaturalSize.height} px
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                      {fileSize}
                    </span>
                    {isPDF && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded font-medium">
                        PDF - Page {currentPage}/{totalPages}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 flex items-start justify-start bg-gray-50/50 overflow-auto relative min-h-0 p-0">
              {error && (
                <div className="absolute top-4 left-4 right-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start z-10">
                  <AlertCircle className="w-4 h-4 mr-2 text-red-500 flex-shrink-0 mt-0.5" />
                  <span className="text-red-700 text-sm">{error}</span>
                </div>
              )}

              {isConvertingPDF && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-600" />
                    <p className="text-gray-700 font-medium">Converting PDF to images...</p>
                    <p className="text-gray-500 text-sm mt-2">This may take a moment</p>
                  </div>
                </div>
              )}

              {currentImage ? (
                <div className="relative w-full h-full flex flex-col">
                  {isPDF && totalPages > 1 && (
                    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 bg-white rounded-lg shadow-lg border border-gray-200 px-4 py-2 flex items-center gap-3">
                      <button
                        onClick={goToPreviousPage}
                        disabled={currentPage === 1}
                        className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="w-5 h-5 text-gray-900" />
                      </button>
                      <span className="text-sm font-medium text-gray-900">
                        Page {currentPage} / {totalPages}
                      </span>
                      <button
                        onClick={goToNextPage}
                        disabled={currentPage === totalPages}
                        className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronRight className="w-5 h-5 text-gray-900" />
                      </button>
                    </div>
                  )}

                  <div className="flex-1 flex items-center justify-center p-4">
                    {!isPDF && (
                      <img
                        ref={imageRef}
                        src={currentImage}
                        alt="Document"
                        className="hidden"
                        onLoad={handleImageLoad}
                      />
                    )}
                    <canvas 
                      ref={canvasRef} 
                      onClick={handleCanvasClick} 
                      className="border border-gray-300 cursor-pointer max-w-full max-h-full"
                      style={{ 
                        display: 'block',
                        margin: 'auto',
                        transform: `scale(${zoom})`,
                        transformOrigin: 'center center',
                        transition: 'transform 0.2s ease-out'
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-center p-8">
                  <div>
                    <Upload className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <p className="text-gray-500 font-medium">Upload a photo or PDF to get started</p>
                    <p className="text-gray-400 text-sm mt-2">Supports: JPG, PNG, PDF (max {MAX_FILE_SIZE_TEXT})</p>
                  </div>
                </div>
              )}

              {lowConfidenceBoxes.length > 0 && (
                <div className="absolute bottom-4 right-4 bg-yellow-100 border border-yellow-300 text-yellow-800 px-3 py-2 rounded-lg shadow-md text-xs flex items-center gap-2 animate-pulse">
                  <AlertTriangle className="h-4 w-4" />
                  Phát hiện {lowConfidenceBoxes.length} object độ tin cậy thấp
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 px-4 py-2 bg-gray-50 rounded-b-xl flex gap-4 overflow-x-auto shrink-0">
              {Object.keys(CLASS_COLORS).map((cls) => (
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

          <div className="w-64 flex flex-col gap-4 shrink-0">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-blue-500" /> Statistical
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center p-2 bg-gray-50 rounded border border-gray-100">
                  <span className="text-xs text-gray-600">Total Objects</span>
                  <span className="text-sm font-bold text-gray-900">{boxes.length}</span>
                </div>
                {isPDF && (
                  <div className="flex justify-between items-center p-2 bg-purple-50 rounded border border-purple-100">
                    <span className="text-xs text-purple-700">Page {currentPage}</span>
                    <span className="text-sm font-bold text-purple-700">{currentPageBoxes.length} objs</span>
                  </div>
                )}
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
                {isPDF && totalPages > 1 && (
                  <div className="flex justify-between items-center p-2 bg-purple-50 rounded border border-purple-100">
                    <span className="text-xs text-purple-700">PDF Pages</span>
                    <span className="text-sm font-bold text-purple-700">{totalPages}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex-1 overflow-hidden flex flex-col min-h-0">
              <h3 className="text-sm font-bold text-gray-800 mb-3 shrink-0">
                Identification Details {isPDF && `(Page ${currentPage})`}
              </h3>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                {currentPageBoxes.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">
                    {boxes.length > 0 && isPDF ? 'No detections on this page' : 'No results yet'}
                  </p>
                ) : (
                  currentPageBoxes.map((box) => {
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
                          <div className="flex flex-col">
                            <span className={`text-xs font-medium ${isLowConfidence ? 'text-red-800' : 'text-gray-700'}`}>
                              {box.class_name}
                            </span>
                          </div>
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

export default function UATDashboardPage() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="bg-gray-50 h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  return <UATDashboard />;
}