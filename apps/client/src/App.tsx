import './styles/index.css';
import { useEffect, useRef, useState } from 'react';

// Import everything we just built!
import { shapeStore } from './state/ShapeStore';
import { Renderer } from './canvas/Renderer';
import { Camera } from './canvas/Camera';
import { Toolbar } from './ui/Toolbar';
import { PropertyPanel } from './ui/PropertyPanel';
import { RectTool } from './tools/RectTool';
import { EllipseTool } from './tools/EllipseTool';
import { LineTool } from './tools/LineTool';
import { PathTool } from './tools/PathTool';
import { TextTool } from './tools/TextTool';
import { SelectTool } from './tools/SelectTool';
import type { Tool, ToolState } from './tools/Tool';
import type { Shape } from '@concord/shared';
import { ConnectionStatus } from './state/ConnectionStatus';
import { wsClient } from './net/WebSocketClient';
import './state/Reconciler';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeTool, setActiveTool] = useState<string>('rect');
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const toolRef = useRef<Tool | null>(null);
  const cameraRef = useRef(new Camera());
  const rendererRef = useRef<Renderer | null>(null);

  useEffect(() => {
    const unsubscribe = shapeStore.subscribe(() => {
      setShapes(shapeStore.getShape());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (!rendererRef.current) {
      rendererRef.current = new Renderer(canvasRef.current, cameraRef.current);
      rendererRef.current.start();
    }
    return () => {
      rendererRef.current?.stop();
      rendererRef.current = null;
    }
  }, []);
  useEffect(() => {
    wsClient.connect('default-room');
  }, []);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.updateShapes(shapes, selectedShapeIds);
    }
  }, [shapes, selectedShapeIds]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case 'delete':
        case 'backspace':
          selectedShapeIds.forEach(id => shapeStore.remove(id));
          setSelectedShapeIds([]);
          break;
        case 'v': setActiveTool('select'); setSelectedShapeIds([]); break;
        case 'r': setActiveTool('rect'); setSelectedShapeIds([]); break;
        case 'e': setActiveTool('ellipse'); setSelectedShapeIds([]); break;
        case 'l': setActiveTool('line'); setSelectedShapeIds([]); break;
        case 'p': setActiveTool('path'); setSelectedShapeIds([]); break;
        case 't': setActiveTool('text'); setSelectedShapeIds([]); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedShapeIds]);

  useEffect(() => {
    const onCreateShape = (shape: Partial<Shape> & { id: string }) => shapeStore.add(shape as Shape);
    const onUpdateShape = (id: string, updates: Partial<Shape>) => shapeStore.update(id, updates);
    const onDeleteShape = (id: string) => shapeStore.remove(id);

    // Callbacks for SelectTool
    const onSelect = (ids: string[]) => setSelectedShapeIds(ids);

    // Clear selection when switching to any drawing tool
    if (activeTool !== 'select') {
      setSelectedShapeIds([]);
    }

    switch (activeTool) {
      case 'rect':
        toolRef.current = new RectTool(onCreateShape, onUpdateShape);
        break;
      case 'ellipse':
        toolRef.current = new EllipseTool(onCreateShape, onUpdateShape);
        break;
      case 'line':
        toolRef.current = new LineTool(onCreateShape, onUpdateShape);
        break;
      case 'path':
        toolRef.current = new PathTool(onCreateShape, onUpdateShape);
        break;
      case 'text':
        toolRef.current = new TextTool(onCreateShape, onUpdateShape);
        break;
      case 'select':
        toolRef.current = new SelectTool(onSelect, onCreateShape, onUpdateShape, onDeleteShape);
        break;
      default:
        toolRef.current = null;
    }
  }, [activeTool])
  // --- MOUSE EVENT HANDLERS ---

  // We construct the `ToolState` the tools need on every click
  const getToolState = (): ToolState => ({
    camera: cameraRef.current,
    shapes: shapes,
    selectedShapeIds: selectedShapeIds
  });

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    toolRef.current?.onPointerDown(e.nativeEvent, getToolState())
  }

  const onPointerMove = (e: React.PointerEvent) => {
    toolRef.current?.onPointerMove(e.nativeEvent, getToolState())
  }

  const onPointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    toolRef.current?.onPointerUp(e.nativeEvent, getToolState())
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* The Toolbar */}
      <Toolbar activeTool={activeTool} setActiveTool={setActiveTool} />

      {/* Connection Status */}
      <ConnectionStatus />

      {/* The Property Panel */}
      {selectedShapeIds.length === 1 && (
        <PropertyPanel
          selectedShape={shapes.find(s => s.id === selectedShapeIds[0]) || null}
          updateShape={(id, updates) => shapeStore.update(id, updates)}
          deleteShape={(id) => { shapeStore.remove(id); setSelectedShapeIds([]); }}
        />
      )}

      {/* The Canvas */}
      <canvas
        ref={canvasRef}
        id="concord-canvas"
        style={{ display: 'block', width: '100%', height: '100%', cursor: toolRef.current?.cursor || 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />

    </div>
  )
}

export default App;
