import { useCallback, useRef } from 'react';
import type { GridBounds } from '../cube/gridSampler';

interface Props {
  bounds: GridBounds;
  onChange: (bounds: GridBounds) => void;
  canvasWidth: number;
  canvasHeight: number;
}

export function ScanGridOverlay({ bounds, onChange, canvasWidth, canvasHeight }: Props) {
  const dragRef = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; start: GridBounds } | null>(
    null
  );

  const onPointerDown = useCallback(
    (mode: 'move' | 'resize') => (event: React.PointerEvent) => {
      event.stopPropagation();
      dragRef.current = { mode, startX: event.clientX, startY: event.clientY, start: bounds };
      (event.target as Element).setPointerCapture(event.pointerId);
    },
    [bounds]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (drag.mode === 'move') {
        onChange({ ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy });
      } else {
        const size = Math.max(30, drag.start.size + (dx + dy) / 2);
        onChange({ ...drag.start, size });
      }
    },
    [onChange]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const cell = bounds.size / 3;
  const lines = [1, 2].flatMap((i) => [
    <line key={`v${i}`} x1={bounds.x + cell * i} y1={bounds.y} x2={bounds.x + cell * i} y2={bounds.y + bounds.size} />,
    <line key={`h${i}`} x1={bounds.x} y1={bounds.y + cell * i} x2={bounds.x + bounds.size} y2={bounds.y + cell * i} />,
  ]);

  return (
    <svg
      className="scan-grid-overlay"
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.size}
        height={bounds.size}
        fill="transparent"
        stroke="#4f7cff"
        strokeWidth={2}
        onPointerDown={onPointerDown('move')}
        style={{ cursor: 'move' }}
      />
      <g stroke="#4f7cff" strokeWidth={1} opacity={0.7}>
        {lines}
      </g>
      <rect
        x={bounds.x + bounds.size - 14}
        y={bounds.y + bounds.size - 14}
        width={14}
        height={14}
        fill="#4f7cff"
        onPointerDown={onPointerDown('resize')}
        style={{ cursor: 'nwse-resize' }}
      />
    </svg>
  );
}
