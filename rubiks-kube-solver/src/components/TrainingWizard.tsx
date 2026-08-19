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
          <span className="training-case-name">Sporet er fullført! 🎉</span>
          <button onClick={onExit} className="training-exit">
            ✕ Avslutt
          </button>
        </div>
      </div>
    );
  }

  const algCase = phase.algCase;
  const stats = progress.stats[algCase.id];
  const caseCount = TRACKS[track].length;
  const caseNumber = progress.currentIndex + 1;

  return (
    <div className="training-hud">
      <div className="training-header">
        <div className="training-case-info">
          <div className="training-progress-dots">
            {Array.from({ length: caseCount }, (_, i) => (
              <span
                key={i}
                className={
                  'training-dot' +
                  (i < progress.currentIndex ? ' training-dot-done' : '') +
                  (i === progress.currentIndex ? ' training-dot-current' : '')
                }
              />
            ))}
          </div>
          <span className="training-case-name">{algCase.name}</span>
          <span className="training-case-number">
            Case {caseNumber}/{caseCount}
          </span>
        </div>
        <button onClick={onExit} className="training-exit">
          ✕ Avslutt
        </button>
      </div>

      <div className="training-move-card">
        <div className="training-move-label">Gjør dette trekket</div>
        <div className="training-move-chip">{algCase.solutionMoves}</div>
        <div className="training-move-desc">{algCase.description}</div>
        {phase.kind === 'ready' && (
          <div className="training-status">Klar? Gjør et trekk for å starte! ⏱️</div>
        )}
        {phase.kind === 'timing' && <div className="training-status">Tar tid… ⏱️</div>}
        {phase.kind === 'demonstrating' && <div className="training-status">Se her! 👀</div>}
        {lastResult && phase.kind === 'setting-up' && (
          <div className="training-status training-status-success">
            Riktig! ⭐ {formatTime(lastResult.timeMs)}
          </div>
        )}
      </div>

      <div className="training-footer">
        <div className="training-streak">
          <span className="training-streak-stars">
            {'⭐'.repeat(stats?.streak ?? 0)}
            {'☆'.repeat(3 - (stats?.streak ?? 0))}
          </span>
          {stats?.bestTimeMs != null && <span className="training-best-time">Beste: {formatTime(stats.bestTimeMs)}</span>}
        </div>
        <div className="training-actions">
          <button
            className="training-help-btn"
            onClick={giveUp}
            disabled={phase.kind === 'setting-up' || phase.kind === 'demonstrating'}
          >
            💡 Vis meg
          </button>
          <button className="training-skip-btn" onClick={skip} disabled={phase.kind === 'demonstrating'}>
            Hopp over
          </button>
        </div>
      </div>
    </div>
  );
}
