import { useCallback, useEffect, useRef, useState } from 'react';
import type { CubeScan } from '../hooks/useCubeScan';
import type { GridQuad } from '../cube/gridSampler';
import { detectGridQuad, isConfidentDetection } from '../cube/cornerDetection';
import { ScanGridOverlay } from './ScanGridOverlay';

/** Corner detection runs on a downscaled copy of the photo. The
 * algorithm's internal constants (line sample count, perpendicular
 * search offsets) are absolute pixel values that were tuned and verified
 * at roughly this scale, and running the gradient computation plus the
 * hill-climbing search on a full 12+ megapixel phone photo would also
 * stall the main thread for hundreds of milliseconds (much worse on
 * older phones) right after the camera returns. The detected quad is
 * scaled back up to full-resolution coordinates afterwards; colour
 * sampling still runs on the full-resolution canvas. */
const DETECTION_WORKING_SIZE = 600;

const STEP_TEXT = [
  'Legg kuben på bordet med hvit side opp. Ta bilde av siden som ser på deg.',
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
  const [quad, setQuad] = useState<GridQuad | null>(null);
  const [confidence, setConfidence] = useState(0);

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

    const scale = Math.min(1, DETECTION_WORKING_SIZE / Math.max(canvas.width, canvas.height));
    const workWidth = Math.max(1, Math.round(canvas.width * scale));
    const workHeight = Math.max(1, Math.round(canvas.height * scale));
    const workCanvas = document.createElement('canvas');
    workCanvas.width = workWidth;
    workCanvas.height = workHeight;
    const workCtx = workCanvas.getContext('2d')!;
    workCtx.drawImage(image, 0, 0, workWidth, workHeight);
    const workImageData = workCtx.getImageData(0, 0, workWidth, workHeight);

    const { quad: detectedSmall, confidence: detectedConfidence } = detectGridQuad(workImageData);
    // Back up into full-resolution image coordinates - the overlay's
    // viewBox and sampleGridColors both work in that space.
    const scaleX = workWidth / canvas.width;
    const scaleY = workHeight / canvas.height;
    const detected = detectedSmall.map((p) => ({ x: p.x / scaleX, y: p.y / scaleY })) as GridQuad;
    setQuad(detected);
    setConfidence(detectedConfidence);
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
    if (!canvasRef.current || !quad) return;
    const ctx = canvasRef.current.getContext('2d')!;
    if (isCapturingD) {
      scan.confirmD(ctx, quad);
    } else {
      scan.confirmStep(ctx, quad);
    }
    setQuad(null);
    setConfidence(0);
  }, [scan, quad, isCapturingD]);

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
      {quad && !isConfidentDetection(confidence) && (
        <p className="scan-hint">Fant ikke rutenettet automatisk - dra i hjørnene for å rette det opp.</p>
      )}

      <div className="scan-photo-area">
        {image ? (
          <div
            style={{
              position: 'relative',
              // This wrapper must end up exactly the same box as the
              // <canvas> it contains, because the grid overlay <svg> is
              // stretched across it with inset:0. Pinning width/height to
              // the image's intrinsic pixel size and letting max-width and
              // max-height clamp does NOT do that: the two clamps resolve
              // independently against the photo area, so the wrapper takes
              // the *container's* aspect ratio while the canvas (a replaced
              // element, which re-clamps both axes together) keeps the
              // *image's*. fit-content + an explicit aspect-ratio makes the
              // wrapper shrink-wrap the canvas and keeps both clamps
              // consistent. Verified in Chromium against portrait/landscape/
              // square/extreme images in both width-bound and height-bound
              // containers: canvas and svg rects agree to within 0.02px,
              // and images smaller than the container are still not
              // upscaled.
              width: 'fit-content',
              height: 'auto',
              aspectRatio: canvasRef.current
                ? `${canvasRef.current.width} / ${canvasRef.current.height}`
                : undefined,
              maxWidth: '100%',
              maxHeight: '100%',
            }}
          >
            <canvas ref={canvasRef} className="scan-canvas" />
            {quad && canvasRef.current && (
              <ScanGridOverlay
                quad={quad}
                onChange={setQuad}
                canvasWidth={canvasRef.current.width}
                canvasHeight={canvasRef.current.height}
              />
            )}
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
