import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildSmsLink, shareOrFallback } from './share';

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
});

describe('shareOrFallback', () => {
  afterEach(() => {
    delete (navigator as unknown as Record<string, unknown>).canShare;
    delete (navigator as unknown as Record<string, unknown>).share;
  });

  it('calls navigator.share when file sharing is supported', async () => {
    const canShare = vi.fn().mockReturnValue(true);
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'canShare', { value: canShare, configurable: true });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });

    const file = new File([''], 'note.jpg', { type: 'image/jpeg' });
    const result = await shareOrFallback([file], 'Hei', '99887766');

    expect(share).toHaveBeenCalledWith({ files: [file], text: 'Hei' });
    expect(result).toEqual({ shared: true });
  });

  it('falls back to an sms: link when sharing is unsupported', async () => {
    const file = new File([''], 'note.jpg', { type: 'image/jpeg' });
    const result = await shareOrFallback([file], 'Hei', '99887766');

    expect(result.shared).toBe(false);
    expect(result.fallbackSmsLink).toContain('sms:99887766');
  });
});
