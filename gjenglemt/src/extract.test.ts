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

  it('strips a +47 country code prefix', () => {
    expect(extractNameAndPhone('Ola Nordmann\n+47 99887766').phone).toBe('99887766');
  });

  it('picks the first non-phone line as the name guess', () => {
    expect(extractNameAndPhone('99887766\nPer Persem').name).toBe('Per Persem');
  });

  it('returns nulls when nothing matches', () => {
    expect(extractNameAndPhone('')).toEqual({ name: null, phone: null });
  });
});
