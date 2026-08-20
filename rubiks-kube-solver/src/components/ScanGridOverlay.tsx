import { useCallback, useRef } from 'react';
import type { GridQuad, Point } from '../cube/cornerDetection';

interface Props {
  quad: GridQuad;
  onChange: (quad: GridQuad) => void;
  canvasWidth: number;
  canvasHeight: number;
}

type DragMode = 'move' | 0 | 1 | 2 | 3;

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function ScanGridOverlay({ quad, onChange, canvasWidth, canvasHeight }: Props) {
  const dragRef = useRef<{ mode: DragMode; startX: number; startY: number; start: GridQuad } | null>(null);

  const onPointerDown = useCallback(
    (mode: DragMode) => (event: React.PointerEvent) => {
      event.stopPropagation();
      dragRef.current = { mode, startX: event.clientX, startY: event.clientY, start: quad };
      (event.target as Element).setPointerCapture(event.pointerId);
    },
    [quad]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (drag.mode === 'move') {
        onChange(drag.start.map((p) => ({ x: p.x + dx, y: p.y + dy })) as GridQuad);
      } else {
        const cornerIdx = drag.mode;
        onChange(
          drag.start.map((p, i) => (i === cornerIdx ? { x: p.x + dx, y: p.y + dy } : p)) as GridQuad
        );
      }
    },
    [onChange]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const [tl, tr, br, bl] = quad;
  const quadPoint = (u: number, v: number) => lerp(lerp(tl, tr, u), lerp(bl, br, u), v);
  const outline = `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;
  const internalLines = [1 / 3, 2 / 3].flatMap((t) => {
    const vTop = quadPoint(t, 0);
    const vBottom = quadPoint(t, 1);
    const hLeft = quadPoint(0, t);
    const hRight = quadPoint(1, t);
    return [
      <line key={`v${t}`} x1={vTop.x} y1={vTop.y} x2={vBottom.x} y2={vBottom.y} />,
      <line key={`h${t}`} x1={hLeft.x} y1={hLeft.y} x2={hRight.x} y2={hRight.y} />,
    ];
  });

  return (
    <svg
      className="scan-grid-overlay"
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <polygon
        points={outline}
        fill="transparent"
        stroke="#4f7cff"
        strokeWidth={3}
        onPointerDown={onPointerDown('move')}
        style={{ cursor: 'move' }}
      />
      <g stroke="#4f7cff" strokeWidth={1.5} opacity={0.8}>
        {internalLines}
      </g>
      <g>
        {quad.map((corner, i) => (
          <circle
            key={i}
            cx={corner.x}
            cy={corner.y}
            r={16}
            fill="#4f7cff"
            stroke="white"
            strokeWidth={3}
            onPointerDown={onPointerDown(i as 0 | 1 | 2 | 3)}
            style={{ cursor: 'grab' }}
          />
        ))}
      </g>
    </svg>
  );
}
