export interface MessageFields {
  navn: string;
  sted: string;
}

export function renderMessage({ navn, sted }: MessageFields): string {
  const navnPart = navn.trim() || '(ukjent navn)';
  const stedPart = sted.trim() || '(ukjent sted)';
  return `Hei. Vi fant et gjenglemt plagg. Sted: ${stedPart}. Navn: ${navnPart}`;
}
