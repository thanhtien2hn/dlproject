'use client';

import React, { useState } from 'react';
import { ArrowLeft, ScanText } from 'lucide-react';
import Link from 'next/link';
import ResultsTable from './ResultsTable';

// Modal để xem chi tiết kết quả
interface DetailModalProps {
  result: {
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
  } | null;
  onClose: () => void;
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

function DetailModal({ result, onClose }: DetailModalProps) {
  if (!result) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{result.imageName}</h3>
            <p className="text-sm text-gray-500">
              {result.imageSize.width} × {result.imageSize.height} px • {new Date(result.timestamp).toLocaleString('vi-VN')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Status */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-600 mb-2">Trạng thái UAT</h4>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                result.uatStatus === 'pass' 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-red-100 text-red-700'
              }`}>
                {result.uatStatus === 'pass' ? '✓ PASS' : '✗ FAIL'}
              </span>
              {result.uatNote && (
                <span className="text-sm text-gray-600">"{result.uatNote}"</span>
              )}
            </div>
          </div>

          {/* Detections */}
          <div>
            <h4 className="text-sm font-semibold text-gray-600 mb-3">
              Chi tiết Detections ({result.detections.length})
            </h4>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {result.detections.map((det, idx) => (
                <div 
                  key={idx}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div className="flex items-center gap-3">
                    <span 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: CLASS_COLORS[det.class_name] || '#6b7280' }}
                    />
                    <span className="font-medium text-gray-800">{det.class_name}</span>
                    <span className="text-xs text-gray-500">
                      [{det.bbox.map(b => Math.round(b)).join(', ')}]
                    </span>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    det.confidence >= 0.7 
                      ? 'bg-green-100 text-green-700' 
                      : det.confidence >= 0.5 
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {(det.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Raw JSON */}
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-gray-600 mb-2">Raw JSON</h4>
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(result, null, 2));
              alert('Đã copy JSON!');
            }}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            Copy JSON
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  const [selectedResult, setSelectedResult] = useState<DetailModalProps['result']>(null);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              href="/"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 text-white p-2 rounded-lg">
                <ScanText className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-800">Results</h1>
                <p className="text-xs text-gray-500">Document Layout Analysis System</p>
              </div>
            </div>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            + New Detection
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        <ResultsTable onViewDetail={(result) => setSelectedResult(result)} />
      </main>

      {/* Detail Modal */}
      <DetailModal result={selectedResult} onClose={() => setSelectedResult(null)} />
    </div>
  );
}