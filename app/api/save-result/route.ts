// File: app/api/save-result/route.ts
// API Route để lưu kết quả detection vào file result.json

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// ✅ Đường dẫn ưu tiên, có fallback
const PREFERRED_PATH = '/home/administrator/result.json';
const FALLBACK_PATH = path.join(process.cwd(), 'result.json');

let RESULT_FILE = PREFERRED_PATH;

interface DetectionResult {
  id: string;
  imageName: string;
  imageData: string;
  imageSize: { width: number; height: number };
  detections: {
    class_id: number;
    class_name: string;
    confidence: number;
    bbox: number[];
    page?: number;
  }[];
  uatStatus: 'pass' | 'fail';
  uatNote: string;
  isPDF?: boolean;
  totalPages?: number;
  pdfPages?: any[];
  timestamp: string;
}

interface ResultFile {
  results: DetectionResult[];
  lastUpdated: string;
}

// Helper: Kiểm tra xem có thể ghi vào đường dẫn không
function canWriteToPath(filePath: string): boolean {
  try {
    const dir = path.dirname(filePath);
    
    // Tạo thư mục nếu chưa tồn tại
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Test write
    const testFile = path.join(dir, '.write_test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    
    return true;
  } catch (error) {
    console.error(`Cannot write to ${filePath}:`, error);
    return false;
  }
}

// Helper: Chọn đường dẫn phù hợp
function selectResultFilePath(): string {
  // Thử đường dẫn ưu tiên trước
  if (canWriteToPath(PREFERRED_PATH)) {
    console.log(`✅ Using preferred path: ${PREFERRED_PATH}`);
    return PREFERRED_PATH;
  }
  
  // Fallback về thư mục project
  console.warn(`⚠️ Cannot write to ${PREFERRED_PATH}, using fallback: ${FALLBACK_PATH}`);
  return FALLBACK_PATH;
}

// Initialize path
RESULT_FILE = selectResultFilePath();

// Helper function để đọc file an toàn
function readResultFile(): ResultFile {
  const emptyData: ResultFile = { results: [], lastUpdated: '' };
  
  try {
    // Đảm bảo thư mục tồn tại
    const dir = path.dirname(RESULT_FILE);
    if (!fs.existsSync(dir)) {
      console.log(`Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Kiểm tra file có tồn tại không
    if (!fs.existsSync(RESULT_FILE)) {
      console.log(`Creating new file: ${RESULT_FILE}`);
      fs.writeFileSync(RESULT_FILE, JSON.stringify(emptyData, null, 2), 'utf-8');
      return emptyData;
    }
    
    // Đọc nội dung file
    const content = fs.readFileSync(RESULT_FILE, 'utf-8').trim();
    
    // Nếu file rỗng
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
    console.error('Error reading result file:', error);
    
    // Thử fallback nếu đang dùng preferred path
    if (RESULT_FILE === PREFERRED_PATH) {
      console.log('Trying fallback path...');
      RESULT_FILE = FALLBACK_PATH;
      
      try {
        const dir = path.dirname(RESULT_FILE);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(RESULT_FILE, JSON.stringify(emptyData, null, 2), 'utf-8');
        return emptyData;
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        throw new Error('Cannot create result file in any location');
      }
    }
    
    throw error;
  }
}

// GET - Đọc tất cả kết quả
export async function GET() {
  try {
    const data = readResultFile();
    return NextResponse.json({
      ...data,
      filePath: RESULT_FILE // Debug info
    });
  } catch (error) {
    console.error('GET Error:', error);
    return NextResponse.json({ 
      results: [], 
      lastUpdated: null,
      error: error instanceof Error ? error.message : 'Unknown error',
      filePath: RESULT_FILE
    }, { status: 500 });
  }
}

// POST - Thêm kết quả mới
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let newResult: DetectionResult;
    
    try {
      newResult = await request.json();
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      return NextResponse.json({ 
        success: false,
        error: 'invalid_json',
        message: 'Request body is not valid JSON',
        details: parseError instanceof Error ? parseError.message : 'Unknown error'
      }, { status: 400 });
    }
    
    // Validate required fields
    if (!newResult.imageName) {
      return NextResponse.json({ 
        success: false,
        error: 'validation_error',
        message: 'imageName is required'
      }, { status: 400 });
    }
    
    // Đọc file hiện tại
    let existingData: ResultFile;
    try {
      existingData = readResultFile();
    } catch (readError) {
      console.error('Read Error:', readError);
      return NextResponse.json({ 
        success: false,
        error: 'file_read_error',
        message: 'Cannot read result file',
        details: readError instanceof Error ? readError.message : 'Unknown error',
        filePath: RESULT_FILE
      }, { status: 500 });
    }
    
    // Kiểm tra trùng lặp
    const isDuplicate = existingData.results.some(
      (result) => result.imageName.toLowerCase() === newResult.imageName.toLowerCase()
    );
    
    if (isDuplicate) {
      return NextResponse.json({ 
        success: false,
        error: 'duplicate',
        message: `Ảnh "${newResult.imageName}" đã được lưu trước đó!`
      }, { status: 409 });
    }
    
    // Tạo ID và timestamp
    newResult.id = `result_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    newResult.timestamp = new Date().toISOString();
    
    // Thêm kết quả mới
    existingData.results.push(newResult);
    existingData.lastUpdated = new Date().toISOString();
    
    // Ghi file
    try {
      fs.writeFileSync(RESULT_FILE, JSON.stringify(existingData, null, 2), 'utf-8');
      console.log(`✅ Saved result to: ${RESULT_FILE}`);
      console.log(`📊 Total results: ${existingData.results.length}`);
    } catch (writeError) {
      console.error('Write Error:', writeError);
      
      // Thử fallback
      if (RESULT_FILE === PREFERRED_PATH) {
        console.log('Trying fallback path for writing...');
        RESULT_FILE = FALLBACK_PATH;
        
        try {
          fs.writeFileSync(RESULT_FILE, JSON.stringify(existingData, null, 2), 'utf-8');
          console.log(`✅ Saved to fallback: ${RESULT_FILE}`);
        } catch (fallbackWriteError) {
          return NextResponse.json({ 
            success: false,
            error: 'file_write_error',
            message: 'Cannot write to any location',
            details: fallbackWriteError instanceof Error ? fallbackWriteError.message : 'Unknown error',
            attemptedPaths: [PREFERRED_PATH, FALLBACK_PATH]
          }, { status: 500 });
        }
      } else {
        return NextResponse.json({ 
          success: false,
          error: 'file_write_error',
          message: 'Cannot write to file',
          details: writeError instanceof Error ? writeError.message : 'Unknown error',
          filePath: RESULT_FILE
        }, { status: 500 });
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Result saved successfully',
      totalResults: existingData.results.length,
      savedResult: {
        id: newResult.id,
        imageName: newResult.imageName,
        timestamp: newResult.timestamp
      },
      filePath: RESULT_FILE
    });
    
  } catch (error) {
    console.error('POST Error:', error);
    return NextResponse.json({ 
      success: false,
      error: 'internal_server_error',
      message: 'Failed to save result',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}

// DELETE - Xóa tất cả kết quả
export async function DELETE() {
  try {
    const emptyData: ResultFile = { 
      results: [], 
      lastUpdated: new Date().toISOString() 
    };
    
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
      success: false,
      error: 'delete_error',
      message: 'Failed to clear results',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}