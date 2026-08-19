import { useState } from 'react';
import type { SolverStatus } from '../cube/useSolver';
import type { TrainingTrack } from '../cube/algorithms';

interface Props {
  onScramble: () => void;
  onSolve: () => void;
  onReset: () => void;
  onScan: () => void;
  onTrain: (track: TrainingTrack) => void;
  onStartJourney: () => void;
  isAnimating: boolean;
  isScanning: boolean;
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
  onStartJourney,
  isAnimating,
  isScanning,
  isSolved,
  solverStatus,
  moveCount,
  speed,
  onSpeedChange,
  lastScramble,
  lastSolution,
}: Props) {
  const solveDisabled = isAnimating || isScanning || solverStatus !== 'ready' || isSolved;
  const solveLabel =
    solverStatus === 'initializing'
      ? 'Initialiserer løser…'
      : solverStatus === 'solving'
        ? 'Løser…'
        : 'Løs';

  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <aside className="panel">
      <div>
        <h1>Rubik's kube solver</h1>
        <p className="hint">Trykk under for å lære å løse kuben fra bunnen av, steg for steg.</p>
      </div>

      <button className="journey-cta" onClick={onStartJourney} disabled={isAnimating || isScanning}>
        🧩 Lær å løse kuben
      </button>

      <button
        type="button"
        className="advanced-toggle"
        onClick={() => setShowAdvanced((v) => !v)}
        aria-expanded={showAdvanced}
      >
        {showAdvanced ? '▾ Skjul verktøy for viderekomne' : '▸ Verktøy for viderekomne'}
      </button>

      {showAdvanced && (
        <div className="advanced-section">
          <p className="subtitle">3D Rubik's kube med Kociemba-basert løser</p>
          <p className="hint">Dra i en rute for å vri det laget selv. Dra utenfor kuben for å rotere kameraet.</p>

          <div className="button-row">
            <button onClick={onScramble} disabled={isAnimating || isScanning}>
              Bland
            </button>
            <button onClick={onSolve} disabled={solveDisabled}>
              {solveLabel}
            </button>
            <button onClick={onReset} disabled={isAnimating || isScanning}>
              Nullstill
            </button>
            <button onClick={onScan} disabled={isAnimating}>
              Skann
            </button>
          </div>

          <div className="button-row">
            <button className="train-button" onClick={() => onTrain('notation')} disabled={isAnimating || isScanning}>
              Tren: Notasjon
            </button>
            <button className="train-button" onClick={() => onTrain('beginner')} disabled={isAnimating || isScanning}>
              Tren: Nybegynner
            </button>
            <button
              className="train-button"
              onClick={() => onTrain('oll-pll-2look')}
              disabled={isAnimating || isScanning}
            >
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
            <span className={`badge ${isSolved ? 'badge-solved' : ''}`}>{isSolved ? 'Løst' : 'Ikke løst'}</span>
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
        </div>
      )}
    </aside>
  );
}
