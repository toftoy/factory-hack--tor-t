import type { CubiePosition } from '../cube/facelets';

const SPACING = 1.02;
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
}

export function Cubie({ position, colors }: Props) {
  return (
    <mesh
      position={[position.x * SPACING, position.y * SPACING, position.z * SPACING]}
      castShadow
      receiveShadow
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
