import Tesseract from 'tesseract.js';

export async function runOcr(imageFile: File): Promise<string> {
  const {
    data: { text },
  } = await Tesseract.recognize(imageFile, 'nor');
  return text;
}
