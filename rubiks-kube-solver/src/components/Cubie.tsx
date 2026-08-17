import type { ThreeEvent } from '@react-three/fiber';
import type { CubiePosition } from '../cube/facelets';

export const CUBIE_SPACING = 1.02;
const SIZE = 0.94;

interface CubieColors {
  px: string;
  nx: string;
  py: string;
  ny: string;
  pz: string;
  nz: string;
}

interface Props {
  position: CubiePosition;
  colors: CubieColors;
  onGrabPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
  onGrabPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onGrabPointerUp?: (event: ThreeEvent<PointerEvent>) => void;
}

export function Cubie({ position, colors, onGrabPointerDown, onGrabPointerMove, onGrabPointerUp }: Props) {
  return (
    <mesh
      position={[position.x * CUBIE_SPACING, position.y * CUBIE_SPACING, position.z * CUBIE_SPACING]}
      castShadow
      receiveShadow
      onPointerDown={onGrabPointerDown}
      onPointerMove={onGrabPointerMove}
      onPointerUp={onGrabPointerUp}
      onPointerCancel={onGrabPointerUp}
    >
      <boxGeometry args={[SIZE, SIZE, SIZE]} />
      <meshStandardMaterial attach="material-0" color={colors.px} roughness={0.35} metalness={0.05} />
      <meshStandardMaterial attach="material-1" color={colors.nx} roughness={0.35} metalness={0.05} />
      <meshStandardMaterial attach="material-2" color={colors.py} roughness={0.35} metalness={0.05} />
      <meshStandardMaterial attach="material-3" color={colors.ny} roughness={0.35} metalness={0.05} />
      <meshStandardMaterial attach="material-4" color={colors.pz} roughness={0.35} metalness={0.05} />
      <meshStandardMaterial attach="material-5" color={colors.nz} roughness={0.35} metalness={0.05} />
    </mesh>
  );
}
