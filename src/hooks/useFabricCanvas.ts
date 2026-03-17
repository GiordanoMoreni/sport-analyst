// src/hooks/useFabricCanvas.ts

import { useEffect, useRef, useCallback, useState } from 'react';
import { fabric } from 'fabric';
import { ToolType } from '../types';

interface UseFabricCanvasOptions {
  width: number;
  height: number;
  currentTool: ToolType;
  currentColor: string;
  strokeWidth: number;
  onObjectAdded?: (fabricJson: string, annotationId: string) => void;
  onObjectsDeleted?: (annotationIds: string[]) => void;
}

export function useFabricCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  options: UseFabricCanvasOptions
) {
  const DEBUG = true;
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const isDrawingRef = useRef(false);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const currentShapeRef = useRef<fabric.Object | null>(null);
  const [objectCount, setObjectCount] = useState(0);
  const annotationSeqRef = useRef(0);

  const { width, height, currentTool, currentColor, strokeWidth, onObjectAdded, onObjectsDeleted } = options;

  const nextAnnotationId = useCallback(() => {
    annotationSeqRef.current += 1;
    return `ann_${Date.now()}_${annotationSeqRef.current}`;
  }, []);

  // Initialize fabric canvas
  useEffect(() => {
    if (fabricRef.current || !canvasRef.current) return;
    const canvas = new fabric.Canvas(canvasRef.current, {
      selection: currentTool === 'select',
      isDrawingMode: false,
      renderOnAddRemove: true,
    });
    fabricRef.current = canvas;
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.debug('[fabric] init', {
        width: canvas.getWidth(),
        height: canvas.getHeight(),
      });
    }
    return () => {
      canvas.dispose();
      fabricRef.current = null;
    };
  }, [canvasRef, width, height]);

  // Update canvas size
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !width || !height) return;
    canvas.setWidth(width);
    canvas.setHeight(height);
    canvas.calcOffset();
    canvas.renderAll();
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.debug('[fabric] resize', { width, height });
    }
  }, [width, height]);

  // Switch tools
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    canvas.isDrawingMode = currentTool === 'freehand';
    canvas.selection = currentTool === 'select';

    if (currentTool === 'freehand') {
      canvas.freeDrawingBrush.color = currentColor;
      canvas.freeDrawingBrush.width = strokeWidth;
    }

    canvas.forEachObject(obj => {
      obj.selectable = currentTool === 'select';
      obj.evented = currentTool === 'select';
    });

    canvas.renderAll();
  }, [currentTool, currentColor, strokeWidth]);

  // Add arrow helper
  const addArrow = useCallback(
    (x1: number, y1: number, x2: number, y2: number, color: string, sw: number) => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = 18;
      const arrowPoints = [
        { x: x2 - headLen * Math.cos(angle - Math.PI / 6), y: y2 - headLen * Math.sin(angle - Math.PI / 6) },
        { x: x2, y: y2 },
        { x: x2 - headLen * Math.cos(angle + Math.PI / 6), y: y2 - headLen * Math.sin(angle + Math.PI / 6) },
      ];

      const line = new fabric.Line([x1, y1, x2, y2], {
        stroke: color,
        strokeWidth: sw,
        selectable: currentTool === 'select',
        evented: currentTool === 'select',
        strokeLineCap: 'round',
      });

      const arrowHead = new fabric.Polyline(arrowPoints, {
        fill: color,
        stroke: color,
        strokeWidth: 1,
        selectable: currentTool === 'select',
        evented: currentTool === 'select',
      });

      const group = new fabric.Group([line, arrowHead], {
        selectable: currentTool === 'select',
        evented: currentTool === 'select',
      });

      const annotationId = nextAnnotationId();
      (group as any).set({ annotationId });
      canvas.add(group);
      canvas.renderAll();
      onObjectAdded?.(JSON.stringify(group.toJSON(['annotationId'])), annotationId);
      setObjectCount(c => c + 1);
    },
    [currentTool, onObjectAdded, nextAnnotationId]
  );

  // Mouse event handlers for shape drawing
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const isSelectMode = currentTool === 'select';

    const handleMouseDown = (opt: fabric.IEvent<Event>) => {
      if (DEBUG) {
        // eslint-disable-next-line no-console
        console.debug('[fabric] mouse:down', { tool: currentTool });
      }
      if (currentTool === 'select' || currentTool === 'freehand') return;
      const pointer = canvas.getPointer(opt.e);
      isDrawingRef.current = true;
      startPointRef.current = { x: pointer.x, y: pointer.y };

      if (currentTool === 'text') {
        const annotationId = nextAnnotationId();
        const text = new fabric.IText('Testo', {
          left: pointer.x,
          top: pointer.y,
          fontSize: 20,
          fill: currentColor,
          fontFamily: 'Inter, sans-serif',
          fontWeight: 'bold',
          selectable: true,
          evented: true,
        });
        (text as any).set({ annotationId });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        canvas.renderAll();
        onObjectAdded?.(JSON.stringify(text.toJSON(['annotationId'])), annotationId);
        setObjectCount(c => c + 1);
        isDrawingRef.current = false;
        return;
      }

      if (currentTool === 'spotlight') {
        const annotationId = nextAnnotationId();
        const overlay = new fabric.Rect({
          left: pointer.x - 80,
          top: pointer.y - 60,
          width: 160,
          height: 120,
          fill: 'transparent',
          stroke: '#FFD700',
          strokeWidth: 3,
          strokeDashArray: [6, 4],
          rx: 8,
          ry: 8,
          selectable: true,
          evented: true,
          shadow: new fabric.Shadow({
            color: 'rgba(255, 215, 0, 0.4)',
            blur: 20,
            offsetX: 0,
            offsetY: 0,
          }),
        });
        (overlay as any).set({ annotationId });
        canvas.add(overlay);
        canvas.renderAll();
        onObjectAdded?.(JSON.stringify(overlay.toJSON(['annotationId'])), annotationId);
        setObjectCount(c => c + 1);
        isDrawingRef.current = false;
        return;
      }
    };

    const handleMouseMove = (opt: fabric.IEvent<Event>) => {
      if (!isDrawingRef.current || !startPointRef.current) return;
      if (currentTool === 'select' || currentTool === 'freehand' || currentTool === 'text') return;

      const pointer = canvas.getPointer(opt.e);
      const { x: x1, y: y1 } = startPointRef.current;
      const x2 = pointer.x;
      const y2 = pointer.y;

      // Remove temp shape
      if (currentShapeRef.current) {
        canvas.remove(currentShapeRef.current);
      }

      let shape: fabric.Object | null = null;

      if (currentTool === 'arrow') {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = 18;
        const line = new fabric.Line([x1, y1, x2, y2], {
          stroke: currentColor, strokeWidth, strokeLineCap: 'round',
          selectable: false, evented: false,
        });
        const arrowHead = new fabric.Polyline([
          { x: x2 - headLen * Math.cos(angle - Math.PI / 6), y: y2 - headLen * Math.sin(angle - Math.PI / 6) },
          { x: x2, y: y2 },
          { x: x2 - headLen * Math.cos(angle + Math.PI / 6), y: y2 - headLen * Math.sin(angle + Math.PI / 6) },
        ], { fill: currentColor, stroke: currentColor, selectable: false, evented: false });
        shape = new fabric.Group([line, arrowHead], { selectable: false, evented: false });
      } else if (currentTool === 'circle') {
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;
        shape = new fabric.Ellipse({
          left: Math.min(x1, x2),
          top: Math.min(y1, y2),
          rx, ry,
          stroke: currentColor,
          strokeWidth,
          fill: 'transparent',
          selectable: false, evented: false,
        });
      } else if (currentTool === 'rectangle') {
        shape = new fabric.Rect({
          left: Math.min(x1, x2),
          top: Math.min(y1, y2),
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
          stroke: currentColor,
          strokeWidth,
          fill: 'transparent',
          rx: 4, ry: 4,
          selectable: false, evented: false,
        });
      }

      if (shape) {
        currentShapeRef.current = shape;
        canvas.add(shape);
        canvas.renderAll();
      }
    };

    const handleMouseUp = (opt: fabric.IEvent<Event>) => {
      if (!isDrawingRef.current || !startPointRef.current) return;
      if (currentTool === 'select' || currentTool === 'freehand') return;

      const pointer = canvas.getPointer(opt.e);
      const { x: x1, y: y1 } = startPointRef.current;
      isDrawingRef.current = false;

      // Remove temp shape
      if (currentShapeRef.current) {
        canvas.remove(currentShapeRef.current);
        currentShapeRef.current = null;
      }

      // Only save if there's actual movement
      const dist = Math.hypot(pointer.x - x1, pointer.y - y1);
      if (dist < 5) return;

      const x2 = pointer.x;
      const y2 = pointer.y;

      if (currentTool === 'arrow') {
        addArrow(x1, y1, x2, y2, currentColor, strokeWidth);
      } else if (currentTool === 'circle') {
        const annotationId = nextAnnotationId();
        const shape = new fabric.Ellipse({
          left: Math.min(x1, x2),
          top: Math.min(y1, y2),
          rx: Math.abs(x2 - x1) / 2,
          ry: Math.abs(y2 - y1) / 2,
          stroke: currentColor, strokeWidth,
          fill: 'transparent',
          selectable: isSelectMode, evented: isSelectMode,
        });
        (shape as any).set({ annotationId });
        canvas.add(shape);
        canvas.renderAll();
        onObjectAdded?.(JSON.stringify(shape.toJSON(['annotationId'])), annotationId);
        setObjectCount(c => c + 1);
      } else if (currentTool === 'rectangle') {
        const annotationId = nextAnnotationId();
        const shape = new fabric.Rect({
          left: Math.min(x1, x2),
          top: Math.min(y1, y2),
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
          stroke: currentColor, strokeWidth,
          fill: 'transparent',
          rx: 4, ry: 4,
          selectable: isSelectMode, evented: isSelectMode,
        });
        (shape as any).set({ annotationId });
        canvas.add(shape);
        canvas.renderAll();
        onObjectAdded?.(JSON.stringify(shape.toJSON(['annotationId'])), annotationId);
        setObjectCount(c => c + 1);
      }

      startPointRef.current = null;
    };

    // Freehand path added
    const handlePathCreated = (opt: any) => {
      const annotationId = nextAnnotationId();
      if (opt?.path) {
        (opt.path as any).set({ annotationId });
      }
      onObjectAdded?.(JSON.stringify(opt.path.toJSON(['annotationId'])), annotationId);
      setObjectCount(c => c + 1);
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);
    canvas.on('path:created', handlePathCreated);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
      canvas.off('path:created', handlePathCreated);
    };
  }, [currentTool, currentColor, strokeWidth, addArrow, onObjectAdded]);

  const clearCanvas = useCallback(() => {
    fabricRef.current?.clear();
    fabricRef.current?.renderAll();
    setObjectCount(0);
  }, []);

  const deleteSelected = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObjects();
    const annotationIds = active
      .map(obj => (obj as any).annotationId as string | undefined)
      .filter((id): id is string => !!id);
    active.forEach(obj => canvas.remove(obj));
    canvas.discardActiveObject();
    canvas.renderAll();
    setObjectCount(c => Math.max(0, c - active.length));
    if (annotationIds.length) {
      onObjectsDeleted?.(annotationIds);
    }
  }, [onObjectsDeleted]);

  const deleteByAnnotationId = useCallback((annotationId: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const toRemove = canvas.getObjects().filter(obj => (obj as any).annotationId === annotationId);
    toRemove.forEach(obj => canvas.remove(obj));
    if (toRemove.length) {
      canvas.renderAll();
      setObjectCount(c => Math.max(0, c - toRemove.length));
    }
  }, []);

  const updateVisibilityByTime = useCallback(
    (annotations: { id: string; timestamp: number; duration: number }[], currentTime: number) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const FADE_WINDOW = 0.75;
      const activeMap = new Map<string, number>();
      annotations.forEach(a => {
        const end = a.timestamp + (a.duration || 0);
        if (currentTime >= a.timestamp && currentTime <= end) {
          const remaining = Math.max(0, end - currentTime);
          const opacity = a.duration > 0 ? Math.min(1, remaining / FADE_WINDOW) : 1;
          activeMap.set(a.id, opacity);
        }
      });
      let changed = false;
      canvas.getObjects().forEach(obj => {
        const id = (obj as any).annotationId as string | undefined;
        if (!id) return;
        const shouldBeVisible = activeMap.has(id);
        const targetOpacity = shouldBeVisible ? activeMap.get(id)! : 0;
        if (obj.visible !== shouldBeVisible) {
          obj.visible = shouldBeVisible;
          changed = true;
        }
        if (obj.opacity !== targetOpacity) {
          obj.opacity = targetOpacity;
          changed = true;
        }
      });
      if (changed) {
        canvas.renderAll();
      }
    },
    []
  );

  const getCanvasJSON = useCallback((): string => {
    return JSON.stringify(fabricRef.current?.toJSON() || {});
  }, []);

  const loadFromJSON = useCallback((json: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    try {
      canvas.loadFromJSON(JSON.parse(json), () => {
        canvas.forEachObject(obj => {
          obj.selectable = currentTool === 'select';
          obj.evented = currentTool === 'select';
        });
        canvas.renderAll();
      });
    } catch {}
  }, [currentTool]);

  const getCanvasElement = useCallback((): HTMLCanvasElement | null => {
    return fabricRef.current?.getElement() || null;
  }, []);

  return {
    fabricCanvas: fabricRef.current,
    clearCanvas,
    deleteSelected,
    deleteByAnnotationId,
    updateVisibilityByTime,
    getCanvasJSON,
    loadFromJSON,
    getCanvasElement,
    objectCount,
  };
}
