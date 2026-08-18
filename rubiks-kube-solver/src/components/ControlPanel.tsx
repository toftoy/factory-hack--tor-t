import type { SolverStatus } from '../cube/useSolver';
import type { TrainingTrack } from '../cube/algorithms';

interface Props {
  onScramble: () => void;
  onSolve: () => void;
  onReset: () => void;
  onScan: () => void;
  onTrain: (track: TrainingTrack) => void;
  isAnimating: boolean;
  isScanning: boolean;
  isTraining: boolean;
  isSolved: boolean;
  solverStatus: SolverStatus;
  moveCount: number;
  speed: number;
  onSpeedChange: (value: number) => void;
  lastScramble: string;
  lastSolution: string;
}

export function ControlPanel({
  onScramble,
  onSolve,
  onReset,
  onScan,
  onTrain,
  isAnimating,
  isScanning,
  isTraining,
  isSolved,
  solverStatus,
  moveCount,
  speed,
  onSpeedChange,
  lastScramble,
  lastSolution,
}: Props) {
  const otherFeatureActive = isScanning || isTraining;
  const solveDisabled = isAnimating || otherFeatureActive || solverStatus !== 'ready' || isSolved;
  const solveLabel =
    solverStatus === 'initializing'
      ? 'Initialiserer løser…'
      : solverStatus === 'solving'
        ? 'Løser…'
        : 'Løs';

  return (
    <aside className="panel">
      <div>
        <h1>Rubik's kube solver</h1>
        <p className="subtitle">3D Rubik's kube med Kociemba-basert løser</p>
        <p className="hint">Dra i en rute for å vri det laget selv. Dra utenfor kuben for å rotere kameraet.</p>
      </div>

      <div className="button-row">
        <button onClick={onScramble} disabled={isAnimating || otherFeatureActive}>
          Bland
        </button>
        <button onClick={onSolve} disabled={solveDisabled}>
          {solveLabel}
        </button>
        <button onClick={onReset} disabled={isAnimating || otherFeatureActive}>
          Nullstill
        </button>
        <button onClick={onScan} disabled={isAnimating || isTraining}>
          Skann
        </button>
      </div>

      <div className="button-row">
        <button onClick={() => onTrain('beginner')} disabled={isAnimating || isScanning}>
          Tren: Nybegynner
        </button>
        <button onClick={() => onTrain('oll-pll-2look')} disabled={isAnimating || isScanning}>
          Tren: 2-look OLL/PLL
        </button>
      </div>

      <label className="speed-control">
        <span>
          Hastighet <span className="speed-value">{speed.toFixed(1)}×</span>
        </span>
        <input
          type="range"
          min={0.5}
          max={5}
          step={0.1}
          value={speed}
          onChange={(event) => onSpeedChange(Number(event.target.value))}
        />
      </label>

      <div className="status-row">
        <span className={`badge ${isSolved ? 'badge-solved' : ''}`}>
          {isSolved ? 'Løst' : 'Ikke løst'}
        </span>
        <span className="move-count">{moveCount} trekk</span>
      </div>

      {lastScramble && (
        <div className="log">
          <h2>Blanding</h2>
          <p>{lastScramble}</p>
        </div>
      )}

      {lastSolution && (
        <div className="log">
          <h2>Løsning ({lastSolution.trim().split(/\s+/).length} trekk)</h2>
          <p>{lastSolution}</p>
        </div>
      )}
    </aside>
  );
}
