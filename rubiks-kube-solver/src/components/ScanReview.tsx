import { useState } from 'react';
import { FACE_ORDER, STICKER_COLORS } from '../cube/facelets';
import { validateScan } from '../cube/scanValidation';
import type { AssembleResult } from '../cube/scanAssembly';
import type { FaceLetter } from '../cube/moveEngine';

const COLOR_CYCLE: FaceLetter[] = ['U', 'R', 'F', 'D', 'L', 'B'];

interface Props {
  result: AssembleResult;
  onUse: (facelets: string) => void;
  onCancel: () => void;
}

export function ScanReview({ result, onUse, onCancel }: Props) {
  const [facelets, setFacelets] = useState(() =>
    result.ok ? result.facelets : 'U'.repeat(54)
  );

  const validation = validateScan(facelets);

  const cycleCell = (index: number) => {
    const current = facelets[index] as FaceLetter;
    const next = COLOR_CYCLE[(COLOR_CYCLE.indexOf(current) + 1) % COLOR_CYCLE.length];
    setFacelets(facelets.slice(0, index) + next + facelets.slice(index + 1));
  };

  return (
    <div className="scan-overlay">
      <div className="scan-header">
        <span>Kontroller skanningen</span>
        <button onClick={onCancel} className="scan-close">
          Avbryt
        </button>
      </div>

      {!result.ok && (
        <p className="scan-instruction">
          Fargene stemmer ikke med en ekte kube — sjekk rutene under og rett opp.
        </p>
      )}
      {result.ok && !validation.valid && (
        <p className="scan-instruction">En rettelse gjorde kuben ugyldig — juster igjen.</p>
      )}

      <div className="scan-review-grid">
        {FACE_ORDER.map((face, faceIndex) => (
          <div className="scan-review-face" key={face}>
            {Array.from({ length: 9 }, (_, cell) => {
              const index = faceIndex * 9 + cell;
              const color = facelets[index] as FaceLetter;
              return (
                <button
                  key={cell}
                  className="scan-review-cell"
                  style={{ background: STICKER_COLORS[color] }}
                  onClick={() => cycleCell(index)}
                  aria-label={`${face} rute ${cell + 1}: ${color}`}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="scan-actions">
        <button onClick={() => onUse(facelets)} disabled={!validation.valid}>
          Bruk denne kuben
        </button>
      </div>
    </div>
  );
}
