import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useCallback, useRef, useState } from 'react';
import { Vector3 } from 'three';
import { CUBIE_SPACING } from '../components/Cubie';
import { moveFromQuarterTurns, resolveGrabMove } from '../cube/dragResolver';
import { FACE_LAYOUT, type CubiePosition, type Vec3 } from '../cube/facelets';
import type { Axis, FaceLetter, Move } from '../cube/moveEngine';
import type { CubeController } from './useCubeController';

const NORMAL_TO_FACE: Record<string, FaceLetter> = {
  '1,0,0': 'R',
  '-1,0,0': 'L',
  '0,1,0': 'U',
  '0,-1,0': 'D',
  '0,0,1': 'F',
  '0,0,-1': 'B',
};

function normalToFaceLetter(n: { x: number; y: number; z: number }): FaceLetter | null {
  const key = `${Math.round(n.x)},${Math.round(n.y)},${Math.round(n.z)}`;
  return NORMAL_TO_FACE[key] ?? null;
}

// Pixels of drag needed to complete one quarter turn, and the dead zone before
// a drag commits to an axis (so a stray tap doesn't turn anything).
const PIXELS_PER_QUARTER_TURN = 90;
const LOCK_THRESHOLD_PX = 6;

interface ScreenVec {
  x: number;
  y: number;
}

interface DragState {
  cubiePos: CubiePosition;
  hitFace: FaceLetter;
  startX: number;
  startY: number;
  screenU: ScreenVec;
  screenV: ScreenVec;
  locked: { screenAxis: ScreenVec; referenceMove: Move } | null;
  quarterTurns: number;
}

export interface ManualLayer {
  axis: Axis;
  layer: 1 | -1;
}

export interface CubeDrag {
  dragRef: React.MutableRefObject<DragState | null>;
  manualLayer: ManualLayer | null;
  onPointerDown: (pos: CubiePosition) => (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (event: ThreeEvent<PointerEvent>) => void;
}

/**
 * Lets the player grab a sticker and drag it to turn that layer, instead of
 * only rotating the camera. Reuses resolveGrabMove/moveFromQuarterTurns (unit
 * tested) for the move math; this hook is the imperative glue: raycasting,
 * screen-space projection of the grabbed face's two turn directions, and the
 * live-follow-then-snap gesture itself.
 */
export function useCubeDrag(controller: CubeController, onGrabbingChange: (grabbing: boolean) => void): CubeDrag {
  const { camera, size } = useThree();
  const dragRef = useRef<DragState | null>(null);
  const [manualLayer, setManualLayer] = useState<ManualLayer | null>(null);

  const screenDirection = useCallback(
    (worldPoint: Vector3, dir: Vec3): ScreenVec => {
      const project = (p: Vector3): ScreenVec => {
        const ndc = p.clone().project(camera);
        return { x: (ndc.x * 0.5 + 0.5) * size.width, y: (-ndc.y * 0.5 + 0.5) * size.height };
      };
      const a = project(worldPoint);
      const b = project(worldPoint.clone().add(new Vector3(dir[0], dir[1], dir[2]).multiplyScalar(0.2)));
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    },
    [camera, size]
  );

  const endDrag = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    onGrabbingChange(false);
    setManualLayer(null);
    if (drag?.locked) {
      const move = moveFromQuarterTurns(drag.locked.referenceMove, drag.quarterTurns);
      if (move) controller.commitMove(move);
    }
  }, [controller, onGrabbingChange]);

  const onPointerDown = useCallback(
    (pos: CubiePosition) => (event: ThreeEvent<PointerEvent>) => {
      if (controller.isAnimating || dragRef.current) return;
      const normal = event.face?.normal;
      const hitFace = normal && normalToFaceLetter(normal);
      if (!hitFace) return;
      event.stopPropagation();

      const worldPos = new Vector3(
        pos.x * CUBIE_SPACING,
        pos.y * CUBIE_SPACING,
        pos.z * CUBIE_SPACING
      );
      const layout = FACE_LAYOUT[hitFace];

      dragRef.current = {
        cubiePos: pos,
        hitFace,
        startX: event.clientX,
        startY: event.clientY,
        screenU: screenDirection(worldPos, layout.u),
        screenV: screenDirection(worldPos, layout.v),
        locked: null,
        quarterTurns: 0,
      };
      onGrabbingChange(true);
      (event.target as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(
        event.pointerId
      );
    },
    [controller.isAnimating, onGrabbingChange, screenDirection]
  );

  const onPointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;

      if (!drag.locked) {
        if (Math.hypot(dx, dy) < LOCK_THRESHOLD_PX) return;
        const alongU = dx * drag.screenU.x + dy * drag.screenU.y;
        const alongV = dx * drag.screenV.x + dy * drag.screenV.y;
        const useU = Math.abs(alongU) >= Math.abs(alongV);
        const sign: 1 | -1 = (useU ? alongU : alongV) >= 0 ? 1 : -1;
        const referenceMove = resolveGrabMove(drag.cubiePos, drag.hitFace, useU ? 'u' : 'v', sign);
        if (!referenceMove) {
          endDrag();
          return;
        }
        // Signed so that continuing to drag in the SAME direction as this initial
        // lock-crossing keeps producing referenceMove un-inverted (quarterTurns
        // growing positive). Storing the raw unsigned screenU/screenV here would
        // make quarterTurns' sign always equal `sign`, and since moveFromQuarterTurns
        // inverts on a negative quarterTurns, that double-negates: resolveGrabMove(sign)
        // inverted back to resolveGrabMove(+1) regardless of `sign` - i.e. a whole
        // straight drag could only ever commit each face's single fixed modifier
        // (always U'/R'/F', never plain; always L/D/B, never their primes),
        // regardless of which way the user actually dragged.
        const rawAxis = useU ? drag.screenU : drag.screenV;
        drag.locked = { screenAxis: { x: rawAxis.x * sign, y: rawAxis.y * sign }, referenceMove };
        setManualLayer({ axis: referenceMove.axis, layer: referenceMove.layer });
      }

      const { locked } = drag;
      if (!locked) return;
      drag.quarterTurns = (dx * locked.screenAxis.x + dy * locked.screenAxis.y) / PIXELS_PER_QUARTER_TURN;
    },
    [endDrag]
  );

  return { dragRef, manualLayer, onPointerDown, onPointerMove, onPointerUp: endDrag };
}
