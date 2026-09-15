import { describe, it, expect } from 'vitest';
import { renderMessage } from './template';

describe('renderMessage', () => {
  it('fills in navn and sted', () => {
    expect(renderMessage({ navn: 'Per Persem', sted: 'Storgata 1, Oslo' })).toBe(
      'Hei. Vi fant et gjenglemt plagg. Sted: Storgata 1, Oslo. Navn: Per Persem'
    );
  });

  it('falls back to placeholders when fields are blank', () => {
    expect(renderMessage({ navn: '', sted: '' })).toBe(
      'Hei. Vi fant et gjenglemt plagg. Sted: (ukjent sted). Navn: (ukjent navn)'
    );
  });

  it('trims whitespace-only fields to the placeholder', () => {
    expect(renderMessage({ navn: '   ', sted: '  ' })).toBe(
      'Hei. Vi fant et gjenglemt plagg. Sted: (ukjent sted). Navn: (ukjent navn)'
    );
  });
});
