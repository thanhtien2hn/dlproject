// TransparentBoundingBox.tsx
// Component to draw transparent bounding boxes that don't block document text

import React from 'react';

interface Detection {
  class_name: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
}

interface Props {
  imageUrl: string;
  detections: Detection[];
  imageWidth: number;
  imageHeight: number;
}

// Colors for different classes (transparent versions)
const CLASS_COLORS: { [key: string]: string } = {
  'Caption': 'rgba(255, 99, 132, 0.3)',      // Red transparent
  'Footnote': 'rgba(54, 162, 235, 0.3)',     // Blue transparent
  'Formula': 'rgba(255, 206, 86, 0.3)',      // Yellow transparent
  'List-item': 'rgba(75, 192, 192, 0.3)',    // Teal transparent
  'Page-footer': 'rgba(153, 102, 255, 0.3)', // Purple transparent
  'Page-header': 'rgba(255, 159, 64, 0.3)',  // Orange transparent
  'Picture': 'rgba(255, 99, 255, 0.3)',      // Pink transparent
  'Section-header': 'rgba(0, 255, 0, 0.3)',  // Green transparent
  'Table': 'rgba(255, 0, 0, 0.3)',           // Bright red transparent
  'Text': 'rgba(100, 200, 255, 0.3)',        // Light blue transparent
  'Title': 'rgba(255, 215, 0, 0.3)',         // Gold transparent
};

// Border colors (solid, more visible)
const BORDER_COLORS: { [key: string]: string } = {
  'Caption': '#ff6384',
  'Footnote': '#36a2eb',
  'Formula': '#ffce56',
  'List-item': '#4bc0c0',
  'Page-footer': '#9966ff',
  'Page-header': '#ff9f40',
  'Picture': '#ff63ff',
  'Section-header': '#00ff00',
  'Table': '#ff0000',
  'Text': '#64c8ff',
  'Title': '#ffd700',
};

export const TransparentBoundingBox: React.FC<Props> = ({
  imageUrl,
  detections,
  imageWidth,
  imageHeight,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [displaySize, setDisplaySize] = React.useState({ width: 0, height: 0 });

  React.useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { width } = containerRef.current.getBoundingClientRect();
        const aspectRatio = imageHeight / imageWidth;
        setDisplaySize({
          width,
          height: width * aspectRatio,
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [imageWidth, imageHeight]);

  const scaleX = displaySize.width / imageWidth;
  const scaleY = displaySize.height / imageHeight;

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Original image */}
      <img
        src={imageUrl}
        alt="Document"
        className="w-full h-auto"
        style={{ display: 'block' }}
      />

      {/* Overlay with bounding boxes */}
      <div
        className="absolute top-0 left-0 pointer-events-none"
        style={{
          width: displaySize.width,
          height: displaySize.height,
        }}
      >
        {detections.map((detection, index) => {
          const [x, y, width, height] = detection.bbox;
          const className = detection.class_name;
          
          const fillColor = CLASS_COLORS[className] || 'rgba(255, 255, 255, 0.2)';
          const borderColor = BORDER_COLORS[className] || '#ffffff';

          return (
            <div
              key={index}
              className="absolute"
              style={{
                left: `${x * scaleX}px`,
                top: `${y * scaleY}px`,
                width: `${width * scaleX}px`,
                height: `${height * scaleY}px`,
                backgroundColor: fillColor,  // TRANSPARENT FILL ✅
                border: `2px solid ${borderColor}`,  // SOLID BORDER ✅
                boxSizing: 'border-box',
              }}
            >
              {/* Label */}
              <div
                className="absolute -top-6 left-0 px-2 py-1 text-xs font-medium rounded"
                style={{
                  backgroundColor: borderColor,
                  color: '#fff',
                  whiteSpace: 'nowrap',
                }}
              >
                {className}: {(detection.confidence * 100).toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TransparentBoundingBox;