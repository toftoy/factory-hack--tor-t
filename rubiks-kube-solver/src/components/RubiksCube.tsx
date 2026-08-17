import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { CUBIE_POSITIONS, getCubieFaceColors } from '../cube/facelets';
import type { CubeController } from '../hooks/useCubeController';
import { Cubie } from './Cubie';

interface Props {
  controller: CubeController;
  turnsPerSecond: number;
}

function positionKey(pos: { x: number; y: number; z: number }): string {
  return `${pos.x},${pos.y},${pos.z}`;
}

export function RubiksCube({ controller, turnsPerSecond }: Props) {
  const rotatingGroup = useRef<Group>(null);

  useFrame((_, delta) => {
    const result = controller.tick(delta, turnsPerSecond);
    const group = rotatingGroup.current;
    if (!group) return;
    if (result) {
      group.rotation.set(0, 0, 0);
      group.rotation[result.axis] = result.angle;
    } else {
      group.rotation.set(0, 0, 0);
    }
  });

  const { activeMove, facelets } = controller;
  const staticCubies = CUBIE_POSITIONS.filter(
    (pos) => !activeMove || pos[activeMove.axis] !== activeMove.layer
  );
  const movingCubies = activeMove
    ? CUBIE_POSITIONS.filter((pos) => pos[activeMove.axis] === activeMove.layer)
    : [];

  return (
    <group>
      {staticCubies.map((pos) => (
        <Cubie key={positionKey(pos)} position={pos} colors={getCubieFaceColors(pos, facelets)} />
      ))}
      {activeMove && (
        <group ref={rotatingGroup}>
          {movingCubies.map((pos) => (
            <Cubie key={positionKey(pos)} position={pos} colors={getCubieFaceColors(pos, facelets)} />
          ))}
        </group>
      )}
    </group>
  );
}
