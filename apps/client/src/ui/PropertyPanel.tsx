import type { Shape } from "@concord/shared";
import { Trash2 } from "lucide-react";
import '../styles/index.css';

interface PropertyPanelProps {
    selectedShape: Shape | null;
    updateShape: (id: string, updates: Partial<Shape>) => void;
    deleteShape: (id: string) => void;
}

export function PropertyPanel({ selectedShape, updateShape, deleteShape }: PropertyPanelProps) {
    if (!selectedShape) return null;

    const inputStyle = { background: 'transparent', color: '#37352f', border: '1px solid #555', padding: '4px', borderRadius: '4px', width: '100%', boxSizing: 'border-box' as const };

    return (
        <div className="property-panel">
            <h3 className="panel-title">Properties</h3>

            <div className="panel-section">
                <label>Geometry</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', fontSize: 10, color: '#a3a3a3' }}>X
                        <input type="number" value={Math.round(selectedShape.x)} onChange={(e) => updateShape(selectedShape.id, { x: Number(e.target.value) })} style={inputStyle} />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', fontSize: 10, color: '#a3a3a3' }}>Y
                        <input type="number" value={Math.round(selectedShape.y)} onChange={(e) => updateShape(selectedShape.id, { y: Number(e.target.value) })} style={inputStyle} />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', fontSize: 10, color: '#a3a3a3' }}>W
                        <input type="number" value={Math.round(selectedShape.w)} onChange={(e) => updateShape(selectedShape.id, { w: Number(e.target.value) })} style={inputStyle} />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', fontSize: 10, color: '#a3a3a3' }}>H
                        <input type="number" value={Math.round(selectedShape.h)} onChange={(e) => updateShape(selectedShape.id, { h: Number(e.target.value) })} style={inputStyle} />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', fontSize: 10, color: '#a3a3a3', gridColumn: 'span 2' }}>Rotation (deg)
                        <input type="number" value={Math.round((selectedShape.rotation || 0) * (180 / Math.PI))} onChange={(e) => updateShape(selectedShape.id, { rotation: Number(e.target.value) * (Math.PI / 180) })} style={inputStyle} />
                    </label>
                </div>
            </div>

            <div className="panel-section">
                <label>Stroke</label>
                <div className="color-grid">
                    <div className="custom-color-picker">
                        <input
                            type="color"
                            value={selectedShape.stroke !== 'transparent' ? selectedShape.stroke : '#ffffff'}
                            onChange={(e) => updateShape(selectedShape.id, { stroke: e.target.value })}
                            title="Custom Color"
                        />
                    </div>
                    <input type="text" value={selectedShape.stroke} onChange={(e) => updateShape(selectedShape.id, { stroke: e.target.value })} />
                </div>
            </div>

            <div className="panel-section">
                <label>Fill</label>
                <div className="color-grid">
                    <div className="custom-color-picker">
                        <input
                            type="color"
                            value={selectedShape.fill !== 'transparent' ? selectedShape.fill : '#ffffff'}
                            onChange={(e) => updateShape(selectedShape.id, { fill: e.target.value })}
                            title="Custom Color"
                        />
                    </div>
                    <input type="text" value={selectedShape.fill} onChange={(e) => updateShape(selectedShape.id, { fill: e.target.value })} />
                </div>
            </div>

            <button className="delete-btn" onClick={() => deleteShape(selectedShape.id)}>
                <Trash2 size={16} /> Delete
            </button>
        </div>
    );
}
