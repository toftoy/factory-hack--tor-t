import { describe, it, expect } from 'vitest';
import { extractNameAndPhone } from './extract';

describe('extractNameAndPhone', () => {
  it('extracts a plain 8-digit number and the name on the other line', () => {
    expect(extractNameAndPhone('Per Persem\n99887766')).toEqual({
      name: 'Per Persem',
      phone: '99887766',
    });
  });

  it('extracts a number written with spaces', () => {
    expect(extractNameAndPhone('Kari Nordmann\n99 88 77 66').phone).toBe('99887766');
  });

  it('extracts a number written with dots or dashes', () => {
    expect(extractNameAndPhone('Kari Nordmann\n99-88-77-66').phone).toBe('99887766');
    expect(extractNameAndPhone('Kari Nordmann\n99.88.77.66').phone).toBe('99887766');
  });

  it('strips a +47 country code prefix', () => {
    expect(extractNameAndPhone('Ola Nordmann\n+47 99887766').phone).toBe('99887766');
    expect(extractNameAndPhone('Ola Nordmann\n0047 99887766').phone).toBe('99887766');
  });

  it('keeps a bare 8-digit number that happens to start with 47', () => {
    // 47xxxxxx is a normal Norwegian mobile number, not a country code.
    expect(extractNameAndPhone('Anne/Nils Toftøy\n47239791').phone).toBe('47239791');
  });

  it('takes the name from the line below when the number comes first', () => {
    expect(extractNameAndPhone('99887766\nPer Persem').name).toBe('Per Persem');
  });

  it('returns nulls when nothing matches', () => {
    expect(extractNameAndPhone('')).toEqual({ name: null, phone: null });
  });

  it('joins a two-line name printed above the number', () => {
    expect(extractNameAndPhone('Anne/Nils\nToftøy\n47239791')).toEqual({
      name: 'Anne/Nils Toftøy',
      phone: '47239791',
    });
  });

  it('splits name and number when they share one recognised line', () => {
    expect(extractNameAndPhone('Anne/Nils Toftøy 47239791')).toEqual({
      name: 'Anne/Nils Toftøy',
      phone: '47239791',
    });
  });

  // The OCR pass runs in sparse-text mode over a whole photo, so background
  // texture shows up as short garbage "words" around the real label text.
  const SPARSE_NOISE = [
    'gå',
    'LA',
    'NN',
    'bo',
    '"SE',
    'pe',
    'Anne/Nils',
    'Toftøy',
    '47239791',
    'gh',
    'Ber',
    '; hd',
    'vi',
  ].join('\n');

  it('anchors the name on the phone line instead of taking the first line', () => {
    expect(extractNameAndPhone(SPARSE_NOISE)).toEqual({
      name: 'Anne/Nils Toftøy',
      phone: '47239791',
    });
  });

  it('ignores lowercase noise fragments as name candidates', () => {
    expect(extractNameAndPhone('pass\nhihi\nPer Persem\n99887766').name).toBe('Per Persem');
  });

  it('skips a stray noise line between the name and the number', () => {
    expect(extractNameAndPhone('Per Persem\n~\n99887766').name).toBe('Per Persem');
  });

  it('joins a two-line name split by a speckle line', () => {
    // Tesseract regularly reads a stray mark between the two printed name lines.
    expect(extractNameAndPhone('Ida Marie\noe\nHauge\n91234567')).toEqual({
      name: 'Ida Marie Hauge',
      phone: '91234567',
    });
    expect(extractNameAndPhone('Emil/Sofie\n.\nBjørkhaug\n47058812').name).toBe(
      'Emil/Sofie Bjørkhaug'
    );
  });

  it('strips leading and trailing OCR speckle from the name', () => {
    expect(extractNameAndPhone('! Anne/Nils |\nToftøy\n47239791').name).toBe(
      'Anne/Nils Toftøy'
    );
  });

  it('prefers a number starting 2-9 over an implausible digit run', () => {
    // A date-like run is 8 digits too, but Norwegian numbers never start with 0 or 1.
    expect(extractNameAndPhone('01012024\nPer Persem\n99887766').phone).toBe('99887766');
  });

  it('recovers digits Tesseract read as lookalike letters', () => {
    expect(extractNameAndPhone('Per Persem\n998877G6').phone).toBe('99887766');
    expect(extractNameAndPhone('Per Persem\n9988O766').phone).toBe('99880766');
  });

  it('does not turn an ordinary word into a phone number', () => {
    expect(extractNameAndPhone('Ostebolle\nSolsikke').phone).toBeNull();
  });

  it('still guesses a name when no number is recognised', () => {
    expect(extractNameAndPhone('gå\nKari Nordmann\nx')).toEqual({
      name: 'Kari Nordmann',
      phone: null,
    });
  });
});
