import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { CUBIE_POSITIONS, getCubieFaceColors } from '../cube/facelets';
import type { Axis } from '../cube/moveEngine';
import type { CubeController } from '../hooks/useCubeController';
import { useCubeDrag } from '../hooks/useCubeDrag';
import { Cubie } from './Cubie';

interface Props {
  controller: CubeController;
  turnsPerSecond: number;
  onGrabbingChange: (grabbing: boolean) => void;
}

function positionKey(pos: { x: number; y: number; z: number }): string {
  return `${pos.x},${pos.y},${pos.z}`;
}

const MAX_LIVE_QUARTER_TURNS = 2;

export function RubiksCube({ controller, turnsPerSecond, onGrabbingChange }: Props) {
  const rotatingGroup = useRef<Group>(null);
  const drag = useCubeDrag(controller, onGrabbingChange);

  useFrame((_, delta) => {
    const group = rotatingGroup.current;
    const activeDrag = drag.dragRef.current;

    if (activeDrag?.locked) {
      if (group) {
        const clamped = Math.max(
          -MAX_LIVE_QUARTER_TURNS,
          Math.min(MAX_LIVE_QUARTER_TURNS, activeDrag.quarterTurns)
        );
        group.rotation.set(0, 0, 0);
        group.rotation[activeDrag.locked.referenceMove.axis] = activeDrag.locked.referenceMove.angle * clamped;
      }
      return;
    }

    const result = controller.tick(delta, turnsPerSecond);
    if (!group) return;
    if (result) {
      group.rotation.set(0, 0, 0);
      group.rotation[result.axis] = result.angle;
    } else {
      group.rotation.set(0, 0, 0);
    }
  });

  const movingLayer: { axis: Axis; layer: 1 | -1 } | null = controller.activeMove ?? drag.manualLayer;
  const staticCubies = CUBIE_POSITIONS.filter(
    (pos) => !movingLayer || pos[movingLayer.axis] !== movingLayer.layer
  );
  const movingCubies = movingLayer
    ? CUBIE_POSITIONS.filter((pos) => pos[movingLayer.axis] === movingLayer.layer)
    : [];

  const { facelets } = controller;

  return (
    <group>
      {staticCubies.map((pos) => (
        <Cubie
          key={positionKey(pos)}
          position={pos}
          colors={getCubieFaceColors(pos, facelets)}
          onGrabPointerDown={drag.onPointerDown(pos)}
          onGrabPointerMove={drag.onPointerMove}
          onGrabPointerUp={drag.onPointerUp}
        />
      ))}
      {movingLayer && (
        <group ref={rotatingGroup}>
          {movingCubies.map((pos) => (
            <Cubie
              key={positionKey(pos)}
              position={pos}
              colors={getCubieFaceColors(pos, facelets)}
              onGrabPointerDown={drag.onPointerDown(pos)}
              onGrabPointerMove={drag.onPointerMove}
              onGrabPointerUp={drag.onPointerUp}
            />
          ))}
        </group>
      )}
    </group>
  );
}
