import { useEffect, useState } from 'react';
import { TRACKS } from '../cube/algorithms';
import { SOLVED_PAUSE_MS, type AlgorithmTraining } from '../hooks/useAlgorithmTraining';

interface Props {
  training: AlgorithmTraining;
  onExit: () => void;
  onResetCamera: () => void;
}

// How long a tap-to-arm confirm button stays armed before reverting on its
// own, if the second (confirming) tap never comes.
const CONFIRM_ARM_MS = 3000;

function formatTime(ms: number): string {
  return (ms / 1000).toFixed(2) + 's';
}

const CONFETTI_COLORS = ['#ffb703', '#06d6a0', '#ff5470', '#9670ff', '#4cc9f0'];

function Confetti() {
  return (
    <div className="training-confetti" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className="training-confetti-piece"
          style={{
            left: `${(i * 8.3) % 100}%`,
            animationDelay: `${(i % 4) * 0.12}s`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          }}
        />
      ))}
    </div>
  );
}

export function TrainingWizard({ training, onExit, onResetCamera }: Props) {
  const { phase, track, progress, lastResult, giveUp, skip, resetTrack } = training;

  // Resetting progress is destructive (wipes earned stars), so it needs a
  // real confirmation - but window.confirm() doesn't reliably work inside a
  // sandboxed iframe (e.g. the Claude Artifact viewer), so this is a
  // same-page tap-to-arm pattern instead: first tap arms it (and shows what
  // a second tap will do), second tap within CONFIRM_ARM_MS actually resets.
  const [resetArmed, setResetArmed] = useState(false);
  useEffect(() => {
    if (!resetArmed) return;
    const timer = setTimeout(() => setResetArmed(false), CONFIRM_ARM_MS);
    return () => clearTimeout(timer);
  }, [resetArmed]);

  const handleResetTap = () => {
    if (resetArmed) {
      setResetArmed(false);
      resetTrack();
    } else {
      setResetArmed(true);
    }
  };

  // The celebration has its own fixed duration, independent of the phase
  // machine - the next case's setup animation can be near-instant (a
  // single-move notation case, say), which would otherwise cut "Riktig!"
  // off before a kid has any chance to see it.
  const [celebrating, setCelebrating] = useState(false);
  useEffect(() => {
    if (!lastResult) return;
    setCelebrating(true);
    const timer = setTimeout(() => setCelebrating(false), SOLVED_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [lastResult]);

  if (phase.kind === 'idle' || !track || !progress) return null;

  if (phase.kind === 'track-complete') {
    return (
      <div className="training-hud">
        <Confetti />
        <div className="training-complete-card">
          <div className="training-complete-emoji">🏆</div>
          <div className="training-complete-title">Sporet er fullført!</div>
          <div className="training-complete-subtitle">Du klarte alle {TRACKS[track].length} casene. Kjempebra jobbet!</div>
          <div className="training-complete-actions">
            <button onClick={resetTrack} className="training-skip-btn">
              🔄 Prøv igjen
            </button>
            <button onClick={onExit} className="training-exit training-complete-exit">
              ✕ Avslutt
            </button>
          </div>
        </div>
      </div>
    );
  }

  const algCase = phase.algCase;
  const stats = progress.stats[algCase.id];
  const caseCount = TRACKS[track].length;
  const caseNumber = progress.currentIndex + 1;
  const showCelebration = celebrating && Boolean(lastResult);

  return (
    <div className="training-hud">
      {showCelebration && <Confetti />}

      <div className="training-header">
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
        <span className="training-case-name">
          {algCase.name} <span className="training-case-number">({caseNumber}/{caseCount})</span>
        </span>
        <button onClick={onResetCamera} className="training-reset" aria-label="Nullstill kameravisning">
          🧭
        </button>
        <button onClick={onExit} className="training-exit">
          ✕
        </button>
      </div>

      <div className="training-bottom-stack">
        <div className={'training-move-card' + (showCelebration ? ' training-move-card-celebrate' : '')}>
          {showCelebration && lastResult ? (
            <>
              <div className="training-move-label">Riktig! ⭐</div>
              <div className="training-move-time">{formatTime(lastResult.timeMs)}</div>
            </>
          ) : (
            <>
              <div className="training-move-label">Gjør dette trekket</div>
              <div className="training-move-chip">{algCase.solutionMoves}</div>
              <div className="training-move-desc">{algCase.description}</div>
              {phase.kind === 'ready' && (
                <div className="training-status">Klar? Gjør et trekk for å starte! ⏱️</div>
              )}
              {phase.kind === 'timing' && <div className="training-status">Tar tid… ⏱️</div>}
              {phase.kind === 'demonstrating' && <div className="training-status">Se her! 👀</div>}
            </>
          )}
        </div>

        <div className="training-footer">
          <span className="training-streak-stars">
            {'⭐'.repeat(stats?.streak ?? 0)}
            {'☆'.repeat(3 - (stats?.streak ?? 0))}
          </span>
          <div className="training-actions">
            <button
              className="training-help-btn"
              onClick={giveUp}
              disabled={phase.kind === 'setting-up' || phase.kind === 'solved' || phase.kind === 'demonstrating'}
            >
              💡 Vis meg
            </button>
            <button
              className="training-skip-btn"
              onClick={skip}
              disabled={phase.kind === 'solved' || phase.kind === 'demonstrating'}
            >
              Hopp over
            </button>
            <button
              className={'training-reset-progress-btn' + (resetArmed ? ' training-reset-progress-armed' : '')}
              onClick={handleResetTap}
              disabled={phase.kind === 'demonstrating'}
            >
              {resetArmed ? 'Sikker? 🗑️' : '🗑️ Nullstill'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
