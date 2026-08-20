'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { cn } from '../../lib/utils';

export type AnnotationTool = 'pen' | 'text' | 'eraser';

export interface AnnotationCanvasProps {
  imageWidth: number;
  imageHeight: number;
  className?: string;
}

interface Stroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

interface TextAnnotation {
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
}

const COLORS = ['#ffffff', '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7'];
const STROKE_WIDTHS = [2, 4, 6, 8];

export default function AnnotationCanvas({
  imageWidth,
  imageHeight,
  className,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<AnnotationTool>('pen');
  const [color, setColor] = useState('#ffffff');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [textInputPos, setTextInputPos] = useState<{ x: number; y: number } | null>(null);
  const [textInputValue, setTextInputValue] = useState('');

  const drawAll = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.clearRect(0, 0, imageWidth, imageHeight);
      for (const stroke of strokes) {
        if (stroke.points.length < 2) continue;
        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      }
      if (currentStroke && currentStroke.points.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = currentStroke.color;
        ctx.lineWidth = currentStroke.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(currentStroke.points[0].x, currentStroke.points[0].y);
        for (let i = 1; i < currentStroke.points.length; i++) {
          ctx.lineTo(currentStroke.points[i].x, currentStroke.points[i].y);
        }
        ctx.stroke();
      }
      for (const ta of textAnnotations) {
        ctx.fillStyle = ta.color;
        ctx.font = `${ta.fontSize}px sans-serif`;
        ctx.fillText(ta.text, ta.x, ta.y);
      }
    },
    [strokes, currentStroke, textAnnotations, imageWidth, imageHeight],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawAll(ctx);
  }, [drawAll]);

  const getCanvasPos = useCallback(
    (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = imageWidth / rect.width;
      const scaleY = imageHeight / rect.height;
      if ('touches' in e) {
        return {
          x: (e.touches[0].clientX - rect.left) * scaleX,
          y: (e.touches[0].clientY - rect.top) * scaleY,
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    [imageWidth, imageHeight],
  );

  const handlePointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (tool === 'text') {
        const pos = getCanvasPos(e);
        setTextInputPos(pos);
        setTextInputValue('');
        return;
      }
      if (tool === 'eraser') {
        const pos = getCanvasPos(e);
        setStrokes((prev) =>
          prev.filter((s) => {
            return !s.points.some((p) => Math.abs(p.x - pos.x) < 10 && Math.abs(p.y - pos.y) < 10);
          }),
        );
        setTextAnnotations((prev) =>
          prev.filter((ta) => Math.abs(ta.x - pos.x) > 15 || Math.abs(ta.y - pos.y) > 15),
        );
        return;
      }
      setIsDrawing(true);
      const pos = getCanvasPos(e);
      setCurrentStroke({ points: [pos], color, width: strokeWidth });
    },
    [tool, color, strokeWidth, getCanvasPos],
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing || !currentStroke) return;
      const pos = getCanvasPos(e);
      setCurrentStroke((prev) => {
        if (!prev) return prev;
        return { ...prev, points: [...prev.points, pos] };
      });
    },
    [isDrawing, currentStroke, getCanvasPos],
  );

  const handlePointerUp = useCallback(() => {
    if (isDrawing && currentStroke) {
      setStrokes((prev) => [...prev, currentStroke]);
      setCurrentStroke(null);
      setIsDrawing(false);
    }
  }, [isDrawing, currentStroke]);

  const handleTextSubmit = useCallback(() => {
    if (textInputPos && textInputValue.trim()) {
      setTextAnnotations((prev) => [
        ...prev,
        { ...textInputPos, text: textInputValue.trim(), color, fontSize: 16 },
      ]);
    }
    setTextInputPos(null);
    setTextInputValue('');
  }, [textInputPos, textInputValue, color]);

  const clearAll = useCallback(() => {
    setStrokes([]);
    setTextAnnotations([]);
    setCurrentStroke(null);
    setIsDrawing(false);
    setTextInputPos(null);
  }, []);

  const saveAsPng = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const composite = document.createElement('canvas');
    composite.width = imageWidth;
    composite.height = imageHeight;
    const ctx = composite.getContext('2d');
    if (!ctx) return;
    const img = canvas.parentElement?.querySelector('img');
    if (img) {
      ctx.drawImage(img, 0, 0, imageWidth, imageHeight);
    }
    const overlayCtx = canvas.getContext('2d');
    if (overlayCtx) {
      ctx.drawImage(canvas, 0, 0);
    }
    const link = document.createElement('a');
    link.download = 'annotated-evidence.png';
    link.href = composite.toDataURL('image/png');
    link.click();
  }, [imageWidth, imageHeight]);

  return (
    <div className={cn('relative', className)}>
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2">
        <div className="flex items-center gap-1">
          {(['pen', 'text', 'eraser'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTool(t)}
              aria-pressed={tool === t}
              aria-label={`${t} tool`}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                tool === t
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
              )}
            >
              {t === 'pen' ? 'Pen' : t === 'text' ? 'Text' : 'Eraser'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1" aria-label="Stroke color">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              aria-pressed={color === c}
              className={cn(
                'h-5 w-5 rounded-full border transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                color === c ? 'scale-125 border-white' : 'border-transparent',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <div className="flex items-center gap-1">
          {STROKE_WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setStrokeWidth(w)}
              aria-pressed={strokeWidth === w}
              aria-label={`Stroke width ${w}`}
              className={cn(
                'flex items-center justify-center rounded-md px-2 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                strokeWidth === w ? 'bg-indigo-600' : 'bg-gray-700 hover:bg-gray-600',
              )}
            >
              <span className="rounded-full bg-gray-200" style={{ width: w + 2, height: w + 2 }} />
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={clearAll}
            className="rounded-md bg-gray-700 px-2.5 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={saveAsPng}
            className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            Save as PNG
          </button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-gray-700 bg-gray-900">
        <canvas
          ref={canvasRef}
          width={imageWidth}
          height={imageHeight}
          className="absolute inset-0 z-10"
          style={{
            width: '100%',
            height: 'auto',
            touchAction: tool === 'eraser' ? 'auto' : 'none',
          }}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        />

        {textInputPos && (
          <div
            className="absolute z-20"
            style={{
              left: (textInputPos.x / imageWidth) * 100 + '%',
              top: (textInputPos.y / imageHeight) * 100 + '%',
            }}
          >
            <input
              type="text"
              value={textInputValue}
              onChange={(e) => setTextInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTextSubmit();
                if (e.key === 'Escape') setTextInputPos(null);
              }}
              onBlur={handleTextSubmit}
              autoFocus
              className="w-40 rounded border border-indigo-500 bg-gray-900 px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Type text..."
            />
          </div>
        )}
      </div>
    </div>
  );
}
