import Tesseract from 'tesseract.js';

export async function runOcr(imageFile: File): Promise<string> {
  const worker = await Tesseract.createWorker('nor');
  try {
    // The note is a single isolated label/note, not a structured multi-block
    // page — Tesseract's default automatic layout analysis (PSM.AUTO) tends
    // to misread surrounding background/noise as text blocks on this kind of
    // photo. SINGLE_BLOCK tells it to treat the whole image as one block of
    // text instead, which is the standard tuning for notes/receipts/labels.
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
    const {
      data: { text },
    } = await worker.recognize(imageFile);
    return text;
  } finally {
    await worker.terminate();
  }
}
