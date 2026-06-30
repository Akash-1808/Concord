import { MousePointer2, Square, Circle, Minus, PenTool, Type } from 'lucide-react';
import '../styles/index.css';

interface ToolbarProps {
    activeTool: string;
    setActiveTool: (tool: string) => void;
}

export function Toolbar({ activeTool, setActiveTool }: ToolbarProps) {
    const tools = [
        { id: 'select', icon: <MousePointer2 size={15} />, label: 'Select (V)' },
        { id: 'rect', icon: <Square size={15} />, label: 'Rectangle (R)' },
        { id: 'ellipse', icon: <Circle size={15} />, label: 'Ellipse (E)' },
        { id: 'line', icon: <Minus size={15} />, label: 'Line (L)' },
        { id: 'path', icon: <PenTool size={15} />, label: 'Draw (P)' },
        { id: 'text', icon: <Type size={15} />, label: 'Text (T)' },
    ];

    return (
        <div className="toolbar">
            {tools.map(tool => (
                <button
                    key={tool.id}
                    className={`toolbar-btn ${activeTool === tool.id ? 'active' : ''}`}
                    onClick={() => setActiveTool(tool.id)}
                    title={tool.label}
                >
                    {tool.icon}
                </button>
            ))}
        </div>
    );
}
