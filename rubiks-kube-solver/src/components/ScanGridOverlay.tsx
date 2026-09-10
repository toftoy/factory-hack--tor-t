import { useCallback, useEffect, useRef, useState } from 'react';
import type { GridQuad, Point } from '../cube/cornerDetection';

interface Props {
  quad: GridQuad;
  onChange: (quad: GridQuad) => void;
  canvasWidth: number;
  canvasHeight: number;
}

type DragMode = 'move' | 0 | 1 | 2 | 3;

/** Radius the corner handles should occupy *on screen*, in CSS pixels -
 * a comfortably tappable touch target regardless of how large the photo
 * behind them is. */
const HANDLE_SCREEN_RADIUS_PX = 18;

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Converts a pointer event's client (CSS pixel) coordinates into the
 * SVG's own user space - i.e. the image-pixel space the viewBox and the
 * quad coordinates live in. Without this, drag deltas measured in CSS
 * pixels get applied to image-pixel coordinates, so a handle lags the
 * finger by exactly the viewBox-to-screen scale factor. */
function screenToSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const transformed = pt.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}

export function ScanGridOverlay({ quad, onChange, canvasWidth, canvasHeight }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ mode: DragMode; start: Point; startQuad: GridQuad } | null>(null);
  // Screen pixels per viewBox unit. Measured from the live CTM so handle
  // sizes stay constant on screen no matter the photo's resolution.
  const [screenScale, setScreenScale] = useState(1);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const ctm = svg.getScreenCTM();
      // `a` is the x scale factor of the screen CTM; preserveAspectRatio's
      // default ("xMidYMid meet") yields a uniform scale + translate, so
      // this single number describes both axes.
      if (ctm && ctm.a > 0) setScreenScale((current) => (current === ctm.a ? current : ctm.a));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [canvasWidth, canvasHeight]);

  const onPointerDown = useCallback(
    (mode: DragMode) => (event: React.PointerEvent) => {
      event.stopPropagation();
      const svg = svgRef.current;
      if (!svg) return;
      dragRef.current = {
        mode,
        start: screenToSvgPoint(svg, event.clientX, event.clientY),
        startQuad: quad,
      };
      (event.target as Element).setPointerCapture(event.pointerId);
    },
    [quad]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      const svg = svgRef.current;
      if (!drag || !svg) return;
      const current = screenToSvgPoint(svg, event.clientX, event.clientY);
      const dx = current.x - drag.start.x;
      const dy = current.y - drag.start.y;
      if (drag.mode === 'move') {
        onChange(drag.startQuad.map((p) => ({ x: p.x + dx, y: p.y + dy })) as GridQuad);
      } else {
        const cornerIdx = drag.mode;
        onChange(
          drag.startQuad.map((p, i) => (i === cornerIdx ? { x: p.x + dx, y: p.y + dy } : p)) as GridQuad
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
  const handleRadius = HANDLE_SCREEN_RADIUS_PX / screenScale;
  const internalLines = [1 / 3, 2 / 3].flatMap((t) => {
    const vTop = quadPoint(t, 0);
    const vBottom = quadPoint(t, 1);
    const hLeft = quadPoint(0, t);
    const hRight = quadPoint(1, t);
    return [
      <line
        key={`v${t}`}
        x1={vTop.x}
        y1={vTop.y}
        x2={vBottom.x}
        y2={vBottom.y}
        vectorEffect="non-scaling-stroke"
      />,
      <line
        key={`h${t}`}
        x1={hLeft.x}
        y1={hLeft.y}
        x2={hRight.x}
        y2={hRight.y}
        vectorEffect="non-scaling-stroke"
      />,
    ];
  });

  return (
    <svg
      ref={svgRef}
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
        vectorEffect="non-scaling-stroke"
        onPointerDown={onPointerDown('move')}
        style={{ cursor: 'move' }}
      />
      <g stroke="#4f7cff" strokeWidth={1.5} opacity={0.8} fill="none">
        {internalLines}
      </g>
      <g>
        {quad.map((corner, i) => (
          <circle
            key={i}
            cx={corner.x}
            cy={corner.y}
            r={handleRadius}
            fill="#4f7cff"
            stroke="white"
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
            onPointerDown={onPointerDown(i as 0 | 1 | 2 | 3)}
            style={{ cursor: 'grab' }}
          />
        ))}
      </g>
    </svg>
  );
}
