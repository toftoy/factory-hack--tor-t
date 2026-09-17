import { describe, it, expect } from 'vitest';
import { buildSmsLink } from './share';

describe('buildSmsLink', () => {
  it('uses & as separator on iOS', () => {
    const link = buildSmsLink(
      '99887766',
      'Hei',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
    );
    expect(link).toBe('sms:99887766&body=Hei');
  });

  it('uses ? as separator on Android', () => {
    const link = buildSmsLink('99887766', 'Hei', 'Mozilla/5.0 (Linux; Android 14)');
    expect(link).toBe('sms:99887766?body=Hei');
  });

  it('URL-encodes the message body', () => {
    const link = buildSmsLink('99887766', 'Hei. Sted: Oslo.', 'Android');
    expect(link).toContain(encodeURIComponent('Hei. Sted: Oslo.'));
  });

  it('strips spaces and other non-digit characters (except a leading +) from the phone number', () => {
    const link = buildSmsLink('99 88 77 66', 'Hei', 'Android');
    expect(link.startsWith('sms:99887766?body=')).toBe(true);
  });
});
