import { useCallback, useEffect, useRef, useState } from 'react';
import type { CubeScan } from '../hooks/useCubeScan';
import type { GridBounds } from '../cube/gridSampler';
import { ScanGridOverlay } from './ScanGridOverlay';

const STEP_TEXT = [
  'Ta bilde av siden som ser på deg.',
  'Snu en gang til høyre. Ta bilde.',
  'Snu en gang til høyre. Ta bilde.',
  'Snu en gang til høyre. Ta bilde.',
  'Se rett ned ovenfra. Ta bilde av toppen.',
];

const D_STEP_TEXT =
  'Vi klarte ikke å bestemme bunnen ut ifra de andre bildene. Snu kuben og ta ett bilde til av undersiden.';

interface Props {
  scan: CubeScan;
  onCancel: () => void;
}

export function ScanWizard({ scan, onCancel }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bounds, setBounds] = useState<GridBounds | null>(null);

  const phase = scan.phase;
  const isCapturingD = phase.kind === 'capturingD';
  const image = phase.kind === 'capturing' ? phase.image : phase.kind === 'capturingD' ? phase.image : null;

  useEffect(() => {
    if (!image || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const size = Math.min(image.naturalWidth, image.naturalHeight) * 0.7;
    setBounds({
      x: (image.naturalWidth - size) / 2,
      y: (image.naturalHeight - size) / 2,
      size,
    });
  }, [image]);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        if (isCapturingD) {
          scan.setDImage(img);
        } else {
          scan.setStepImage(img);
        }
        URL.revokeObjectURL(url);
      };
      img.src = url;
    },
    [scan, isCapturingD]
  );

  const handleConfirm = useCallback(() => {
    if (!canvasRef.current || !bounds) return;
    const ctx = canvasRef.current.getContext('2d')!;
    if (isCapturingD) {
      scan.confirmD(ctx, bounds);
    } else {
      scan.confirmStep(ctx, bounds);
    }
    setBounds(null);
  }, [scan, bounds, isCapturingD]);

  if (phase.kind !== 'capturing' && phase.kind !== 'capturingD') return null;

  return (
    <div className="scan-overlay">
      <div className="scan-header">
        <span>{phase.kind === 'capturing' ? `Steg ${scan.stepNumber}/${scan.totalSteps}` : 'Ekstra bilde'}</span>
        <button onClick={onCancel} className="scan-close">
          Avbryt
        </button>
      </div>

      <p className="scan-instruction">{phase.kind === 'capturing' ? STEP_TEXT[phase.stepIndex] : D_STEP_TEXT}</p>

      <div className="scan-photo-area">
        {image ? (
          <div
            style={{
              position: 'relative',
              width: canvasRef.current?.width,
              height: canvasRef.current?.height,
              maxWidth: '100%',
              maxHeight: '100%',
            }}
          >
            <canvas ref={canvasRef} className="scan-canvas" />
            {bounds && <ScanGridOverlay bounds={bounds} onChange={setBounds} />}
          </div>
        ) : (
          <div className="scan-placeholder">Ingen bilde ennå</div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="scan-file-input"
      />

      <div className="scan-actions">
        <button onClick={() => fileInputRef.current?.click()}>{image ? 'Ta nytt bilde' : 'Ta bilde'}</button>
        {image && <button onClick={handleConfirm}>Bekreft</button>}
      </div>
    </div>
  );
}
