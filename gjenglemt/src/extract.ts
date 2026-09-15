const PHONE_PATTERN = /(?:\+47[\s]?)?(?:\d[\s]?){8}/g;

function normalizePhone(match: string): string {
  const digits = match.replace(/\D/g, '');
  const local = digits.length > 8 && digits.startsWith('47') ? digits.slice(2) : digits;
  return local;
}

export interface ExtractedContact {
  name: string | null;
  phone: string | null;
}

export function extractNameAndPhone(ocrText: string): ExtractedContact {
  const lines = ocrText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let phone: string | null = null;
  let phoneLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const matches = lines[i].match(PHONE_PATTERN);
    if (!matches) continue;
    const digitsOnly = matches.map(normalizePhone).find((digits) => digits.length === 8);
    if (digitsOnly) {
      phone = digitsOnly;
      phoneLineIndex = i;
      break;
    }
  }

  const name = lines.find((_, i) => i !== phoneLineIndex) ?? null;

  return { name, phone };
}
