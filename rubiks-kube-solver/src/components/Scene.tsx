import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { useEffect, useState } from 'react';
import { PerspectiveCamera as ThreePerspectiveCamera } from 'three';
import type { CubeController } from '../hooks/useCubeController';
import { RubiksCube } from './RubiksCube';

interface Props {
  controller: CubeController;
  turnsPerSecond: number;
}

const BASE_VERTICAL_FOV = 40;
// Guarantee at least this much horizontal FOV regardless of container shape,
// so the cube never gets cropped left/right on a tall, narrow viewport (e.g.
// the training HUD's full-height mobile view) - fov alone is vertical, and a
// fixed vertical fov crops harder and harder as the container gets taller.
const MIN_HORIZONTAL_FOV_DEG = 36;

function ResponsiveCamera() {
  const { camera, size } = useThree();

  useEffect(() => {
    if (!(camera instanceof ThreePerspectiveCamera)) return;
    const aspect = size.width / size.height;
    const minHorizontalFovRad = (MIN_HORIZONTAL_FOV_DEG * Math.PI) / 180;
    const neededVerticalFovRad = 2 * Math.atan(Math.tan(minHorizontalFovRad / 2) / aspect);
    const neededVerticalFovDeg = (neededVerticalFovRad * 180) / Math.PI;
    camera.fov = Math.max(BASE_VERTICAL_FOV, neededVerticalFovDeg);
    camera.updateProjectionMatrix();
  }, [camera, size]);

  return null;
}

export function Scene({ controller, turnsPerSecond }: Props) {
  const [orbitEnabled, setOrbitEnabled] = useState(true);

  return (
    <Canvas shadows camera={{ position: [4.5, 4, 5.5], fov: BASE_VERTICAL_FOV }}>
      <ResponsiveCamera />
      <color attach="background" args={['#0b0b10']} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[5, 8, 5]} intensity={1.3} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-6, -3, -4]} intensity={0.25} />
      <RubiksCube
        controller={controller}
        turnsPerSecond={turnsPerSecond}
        onGrabbingChange={(grabbing) => setOrbitEnabled(!grabbing)}
      />
      <ContactShadows position={[0, -1.8, 0]} opacity={0.5} scale={10} blur={2.5} far={4} />
      <OrbitControls enabled={orbitEnabled} enablePan={false} minDistance={5} maxDistance={14} />
    </Canvas>
  );
}
