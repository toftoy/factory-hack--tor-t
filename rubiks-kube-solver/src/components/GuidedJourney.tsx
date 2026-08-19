import { useEffect, useState } from 'react';
import { GUIDED_STAGES } from '../cube/guidedJourney';
import { SOLVED_PAUSE_MS } from '../hooks/useAlgorithmTraining';
import type { GuidedJourney as GuidedJourneyState } from '../hooks/useGuidedJourney';

interface Props {
  journey: GuidedJourneyState;
  onExit: () => void;
  onResetCamera: () => void;
}

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

export function GuidedJourney({ journey, onExit, onResetCamera }: Props) {
  const { phase, stageIndex, lastResult, giveUp, skip, resetJourney } = journey;

  const [resetArmed, setResetArmed] = useState(false);
  useEffect(() => {
    if (!resetArmed) return;
    const timer = setTimeout(() => setResetArmed(false), CONFIRM_ARM_MS);
    return () => clearTimeout(timer);
  }, [resetArmed]);

  const handleResetTap = () => {
    if (resetArmed) {
      setResetArmed(false);
      resetJourney();
    } else {
      setResetArmed(true);
    }
  };

  const [celebrating, setCelebrating] = useState(false);
  useEffect(() => {
    if (!lastResult) return;
    setCelebrating(true);
    const timer = setTimeout(() => setCelebrating(false), SOLVED_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [lastResult]);

  if (phase.kind === 'idle') return null;

  if (phase.kind === 'journey-complete') {
    return (
      <div className="training-hud">
        <Confetti />
        <div className="training-complete-card">
          <div className="training-complete-emoji">🏆</div>
          <div className="training-complete-title">Du løste kuben fra bunnen av!</div>
          <div className="training-complete-subtitle">Alle {GUIDED_STAGES.length} stegene er unnagjort. Kjempebra jobbet!</div>
          <div className="training-complete-actions">
            <button onClick={resetJourney} className="training-skip-btn">
              🔄 Løs en ny kube
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
  const stage = GUIDED_STAGES[stageIndex];
  const showCelebration = celebrating && Boolean(lastResult);

  return (
    <div className="training-hud">
      {showCelebration && <Confetti />}

      <div className="training-header">
        <div className="journey-stage-icons">
          {GUIDED_STAGES.map((s, i) => (
            <span
              key={s.id}
              className={
                'journey-stage-icon' +
                (i < stageIndex ? ' journey-stage-icon-done' : '') +
                (i === stageIndex ? ' journey-stage-icon-current' : '')
              }
              title={s.title}
            >
              {s.icon}
            </span>
          ))}
        </div>
        <span className="training-case-name">
          {stage.title} <span className="training-case-number">({stageIndex + 1}/{GUIDED_STAGES.length})</span>
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
          <span className="training-case-number">Steg {stageIndex + 1} av {GUIDED_STAGES.length}</span>
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
              {resetArmed ? 'Sikker? 🗑️' : '🗑️ Start på nytt'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
