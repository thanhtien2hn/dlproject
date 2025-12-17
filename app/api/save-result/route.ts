// File: app/api/save-result/route.ts
// API Route để lưu kết quả detection vào file result.json

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// ✅ Thay đổi đường dẫn lưu file vào /home/administrator/
const RESULT_FILE = '/home/administrator/result.json';

interface DetectionResult {
  id: string;
  imageName: string;
  imageData: string; // base64 image data
  imageSize: { width: number; height: number };
  detections: {
    class_id: number;
    class_name: string;
    confidence: number;
    bbox: number[];
    page?: number; // Thêm support cho PDF
  }[];
  uatStatus: 'pass' | 'fail';
  uatNote: string;
  isPDF?: boolean; // Thêm flag PDF
  totalPages?: number; // Thêm số trang
  pdfPages?: any[]; // Thêm thông tin các trang PDF
  timestamp: string;
}

interface ResultFile {
  results: DetectionResult[];
  lastUpdated: string;
}

// Helper function để đọc file an toàn
function readResultFile(): ResultFile {
  const emptyData: ResultFile = { results: [], lastUpdated: '' };
  
  try {
    // ✅ Đảm bảo thư mục /home/administrator/ tồn tại
    const dir = path.dirname(RESULT_FILE);
    if (!fs.existsSync(dir)) {
      console.log(`Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Kiểm tra file có tồn tại không
    if (!fs.existsSync(RESULT_FILE)) {
      // Tạo file mới với data rỗng
      console.log(`Creating new file: ${RESULT_FILE}`);
      fs.writeFileSync(RESULT_FILE, JSON.stringify(emptyData, null, 2), 'utf-8');
      return emptyData;
    }
    
    // Đọc nội dung file
    const content = fs.readFileSync(RESULT_FILE, 'utf-8').trim();
    
    // Nếu file rỗng, return data rỗng
    if (!content || content === '') {
      fs.writeFileSync(RESULT_FILE, JSON.stringify(emptyData, null, 2), 'utf-8');
      return emptyData;
    }
    
    // Parse JSON
    const data = JSON.parse(content) as ResultFile;
    
    // Validate structure
    if (!data.results || !Array.isArray(data.results)) {
      return { results: [], lastUpdated: data.lastUpdated || '' };
    }
    
    return data;
  } catch (error) {
    console.error('Error reading result file, creating new one:', error);
    // Nếu có lỗi, tạo file mới
    try {
      fs.writeFileSync(RESULT_FILE, JSON.stringify(emptyData, null, 2), 'utf-8');
    } catch (writeError) {
      console.error('Cannot write to file:', writeError);
      throw new Error(`Cannot access ${RESULT_FILE}. Check permissions.`);
    }
    return emptyData;
  }
}

// GET - Đọc tất cả kết quả
export async function GET() {
  try {
    const data = readResultFile();
    return NextResponse.json(data);
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json({ 
      results: [], 
      lastUpdated: null,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// POST - Thêm kết quả mới (nối tiếp vào file)
export async function POST(request: NextRequest) {
  try {
    const newResult: DetectionResult = await request.json();
    
    // Đọc file hiện tại
    const existingData = readResultFile();
    
    // ===== KIỂM TRA TRÙNG TÊN FILE =====
    const isDuplicate = existingData.results.some(
      (result) => result.imageName.toLowerCase() === newResult.imageName.toLowerCase()
    );
    
    if (isDuplicate) {
      return NextResponse.json({ 
        success: false,
        error: 'duplicate',
        message: `Ảnh "${newResult.imageName}" đã được lưu trước đó!`
      }, { status: 409 }); // 409 Conflict
    }
    // ===================================
    
    // Tạo ID unique cho kết quả
    newResult.id = `result_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    newResult.timestamp = new Date().toISOString();
    
    // Thêm kết quả mới vào mảng
    existingData.results.push(newResult);
    existingData.lastUpdated = new Date().toISOString();
    
    // Ghi lại file vào /home/administrator/result.json
    fs.writeFileSync(RESULT_FILE, JSON.stringify(existingData, null, 2), 'utf-8');
    
    console.log(`✅ Saved result to: ${RESULT_FILE}`);
    console.log(`📊 Total results: ${existingData.results.length}`);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Result saved successfully',
      totalResults: existingData.results.length,
      savedResult: newResult,
      filePath: RESULT_FILE // Trả về đường dẫn file để debug
    });
  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json({ 
      error: 'Failed to save result',
      details: error instanceof Error ? error.message : 'Unknown error',
      filePath: RESULT_FILE
    }, { status: 500 });
  }
}

// DELETE - Xóa tất cả kết quả (reset file)
export async function DELETE() {
  try {
    const emptyData: ResultFile = { results: [], lastUpdated: new Date().toISOString() };
    fs.writeFileSync(RESULT_FILE, JSON.stringify(emptyData, null, 2), 'utf-8');
    
    console.log(`🗑️ Cleared all results in: ${RESULT_FILE}`);
    
    return NextResponse.json({ 
      success: true, 
      message: 'All results cleared',
      filePath: RESULT_FILE
    });
  } catch (error) {
    console.error('DELETE Error:', error);
    return NextResponse.json({ 
      error: 'Failed to clear results',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}