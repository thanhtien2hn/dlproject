// ConfigurableBoundingBox.tsx
// Component with options to control transparency and visibility

import React, { useState } from 'react';

interface Detection {
  class_name: string;
  confidence: number;
  bbox: [number, number, number, number];
}

interface Props {
  imageUrl: string;
  detections: Detection[];
  imageWidth: number;
  imageHeight: number;
}

type DisplayMode = 'border-only' | 'transparent' | 'semi-transparent';

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

export const ConfigurableBoundingBox: React.FC<Props> = ({
  imageUrl,
  detections,
  imageWidth,
  imageHeight,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [displaySize, setDisplaySize] = React.useState({ width: 0, height: 0 });
  const [mode, setMode] = useState<DisplayMode>('border-only'); // Default: border only
  const [showLabels, setShowLabels] = useState(true);
  const [borderWidth, setBorderWidth] = useState(3);

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

  const getBackgroundColor = (className: string): string => {
    const color = BORDER_COLORS[className] || '#ffffff';
    
    switch (mode) {
      case 'border-only':
        return 'transparent';  // No fill
      case 'transparent':
        return color.replace(')', ', 0.15)').replace('#', 'rgba(');  // Very transparent
      case 'semi-transparent':
        return color.replace(')', ', 0.3)').replace('#', 'rgba(');   // Semi-transparent
      default:
        return 'transparent';
    }
  };

  return (
    <div className="w-full">
      {/* Controls */}
      <div className="mb-4 p-4 bg-gray-100 rounded-lg space-y-3">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="font-semibold">Display Mode:</span>
          
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="mode"
              checked={mode === 'border-only'}
              onChange={() => setMode('border-only')}
              className="w-4 h-4"
            />
            <span>Border Only (Best for reading) ⭐</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="mode"
              checked={mode === 'transparent'}
              onChange={() => setMode('transparent')}
              className="w-4 h-4"
            />
            <span>Very Transparent</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="mode"
              checked={mode === 'semi-transparent'}
              onChange={() => setMode('semi-transparent')}
              className="w-4 h-4"
            />
            <span>Semi-Transparent</span>
          </label>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="w-4 h-4"
            />
            <span>Show Labels</span>
          </label>

          <div className="flex items-center gap-2">
            <span>Border Width:</span>
            <input
              type="range"
              min="1"
              max="5"
              value={borderWidth}
              onChange={(e) => setBorderWidth(Number(e.target.value))}
              className="w-32"
            />
            <span>{borderWidth}px</span>
          </div>
        </div>

        <div className="text-sm text-gray-600">
          ℹ️ Use "Border Only" mode to read document clearly
        </div>
      </div>

      {/* Image with bounding boxes */}
      <div ref={containerRef} className="relative w-full">
        <img
          src={imageUrl}
          alt="Document"
          className="w-full h-auto"
          style={{ display: 'block' }}
        />

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
            const borderColor = BORDER_COLORS[className] || '#ffffff';
            const backgroundColor = getBackgroundColor(className);

            return (
              <div
                key={index}
                className="absolute transition-all duration-200"
                style={{
                  left: `${x * scaleX}px`,
                  top: `${y * scaleY}px`,
                  width: `${width * scaleX}px`,
                  height: `${height * scaleY}px`,
                  backgroundColor,
                  border: `${borderWidth}px solid ${borderColor}`,
                  boxSizing: 'border-box',
                }}
              >
                {showLabels && (
                  <div
                    className="absolute left-0 px-2 py-1 text-xs font-semibold rounded shadow-lg"
                    style={{
                      top: '-28px',
                      backgroundColor: borderColor,
                      color: '#fff',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {className}: {(detection.confidence * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ConfigurableBoundingBox;