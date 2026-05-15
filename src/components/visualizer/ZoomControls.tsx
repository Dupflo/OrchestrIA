"use client";

interface Props {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomHome: () => void;
}

export default function ZoomControls({ onZoomIn, onZoomOut, onZoomHome }: Props) {
  return (
    <div className="zoom">
      <button onClick={onZoomIn}>+</button>
      <button onClick={onZoomOut}>−</button>
      <button onClick={onZoomHome} style={{ fontSize: 11 }}>⊙</button>
    </div>
  );
}
