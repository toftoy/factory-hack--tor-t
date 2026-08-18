import { TRACKS } from '../cube/algorithms';
import type { AlgorithmTraining } from '../hooks/useAlgorithmTraining';

interface Props {
  training: AlgorithmTraining;
  onExit: () => void;
}

function formatTime(ms: number): string {
  return (ms / 1000).toFixed(2) + 's';
}

export function TrainingWizard({ training, onExit }: Props) {
  const { phase, track, progress, lastResult, giveUp, skip } = training;

  if (phase.kind === 'idle' || !track || !progress) return null;

  if (phase.kind === 'track-complete') {
    return (
      <div className="training-hud">
        <div className="training-header">
          <span>Sporet er fullført! 🎉</span>
          <button onClick={onExit} className="scan-close">
            Avslutt
          </button>
        </div>
      </div>
    );
  }

  const algCase = phase.algCase;
  const stats = progress.stats[algCase.id];
  const caseNumber = progress.currentIndex + 1;

  return (
    <div className="training-hud">
      <div className="training-header">
        <div className="training-case-info">
          <span className="training-case-number">
            Case {caseNumber}/{TRACKS[track].length}
          </span>
          <span className="training-case-name">{algCase.name}</span>
        </div>
        <button onClick={onExit} className="scan-close">
          Avslutt
        </button>
      </div>

      <p className="training-description">{algCase.description}</p>
      <p className="training-hint">{algCase.solutionMoves}</p>

      {phase.kind === 'timing' && <p className="training-timing">Tar tid…</p>}
      {phase.kind === 'demonstrating' && <p className="training-timing">Viser løsning…</p>}
      {lastResult && phase.kind === 'setting-up' && (
        <p className="training-last-result">Riktig! {formatTime(lastResult.timeMs)}</p>
      )}

      <div className="training-footer">
        <div className="training-stats">
          <span>Streak: {stats?.streak ?? 0}/3</span>
          {stats?.bestTimeMs != null && <span>Beste: {formatTime(stats.bestTimeMs)}</span>}
        </div>
        <div className="training-actions">
          <button onClick={giveUp} disabled={phase.kind === 'setting-up' || phase.kind === 'demonstrating'}>
            Vis løsning
          </button>
          <button onClick={skip} disabled={phase.kind === 'demonstrating'}>
            Hopp over
          </button>
        </div>
      </div>
    </div>
  );
}
