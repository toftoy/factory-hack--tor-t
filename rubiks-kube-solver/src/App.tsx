import { useCallback, useState } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { Scene } from './components/Scene';
import { ScanReview } from './components/ScanReview';
import { ScanWizard } from './components/ScanWizard';
import { SOLVED_STATE } from './cube/facelets';
import { generateScramble } from './cube/moveEngine';
import { useSolver } from './cube/useSolver';
import { useCubeController } from './hooks/useCubeController';
import { useCubeScan } from './hooks/useCubeScan';

export default function App() {
  const controller = useCubeController();
  const { status: solverStatus, solve } = useSolver();
  const scan = useCubeScan();
  const [speed, setSpeed] = useState(2.2);
  const [lastScramble, setLastScramble] = useState('');
  const [lastSolution, setLastSolution] = useState('');

  const handleScramble = useCallback(() => {
    const algorithm = generateScramble(20);
    setLastScramble(algorithm);
    setLastSolution('');
    controller.enqueue(algorithm);
  }, [controller]);

  const handleSolve = useCallback(async () => {
    if (controller.isAnimating) return;
    const solution = await solve(controller.facelets);
    setLastSolution(solution);
    controller.enqueue(solution);
  }, [controller, solve]);

  const handleReset = useCallback(() => {
    controller.reset();
    setLastScramble('');
    setLastSolution('');
  }, [controller]);

  const handleUseScan = useCallback(
    (facelets: string) => {
      controller.loadState(facelets);
      setLastScramble('');
      setLastSolution('');
      scan.finish();
    },
    [controller, scan]
  );

  const isSolved = controller.facelets === SOLVED_STATE;

  return (
    <div className="app">
      <div className="viewport">
        <Scene controller={controller} turnsPerSecond={speed} />
      </div>
      <ControlPanel
        onScramble={handleScramble}
        onSolve={handleSolve}
        onReset={handleReset}
        onScan={scan.start}
        isAnimating={controller.isAnimating}
        isSolved={isSolved}
        solverStatus={solverStatus}
        moveCount={controller.moveCount}
        speed={speed}
        onSpeedChange={setSpeed}
        lastScramble={lastScramble}
        lastSolution={lastSolution}
      />
      {(scan.phase.kind === 'capturing' || scan.phase.kind === 'capturingD') && (
        <ScanWizard scan={scan} onCancel={scan.cancel} />
      )}
      {scan.phase.kind === 'review' && (
        <ScanReview result={scan.phase.result} onUse={handleUseScan} onCancel={scan.cancel} />
      )}
    </div>
  );
}
