import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import type { CubeController } from '../hooks/useCubeController';
import { RubiksCube } from './RubiksCube';

interface Props {
  controller: CubeController;
  turnsPerSecond: number;
}

export function Scene({ controller, turnsPerSecond }: Props) {
  return (
    <Canvas shadows camera={{ position: [4.5, 4, 5.5], fov: 40 }}>
      <color attach="background" args={['#0b0b10']} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[5, 8, 5]} intensity={1.3} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-6, -3, -4]} intensity={0.25} />
      <RubiksCube controller={controller} turnsPerSecond={turnsPerSecond} />
      <ContactShadows position={[0, -1.8, 0]} opacity={0.5} scale={10} blur={2.5} far={4} />
      <OrbitControls enablePan={false} minDistance={5} maxDistance={14} />
    </Canvas>
  );
}
