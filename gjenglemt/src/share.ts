export function buildSmsLink(phone: string, body: string, userAgent: string): string {
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const separator = isIOS ? '&' : '?';
  const sanitizedPhone = phone.replace(/[^\d+]/g, '');
  return `sms:${sanitizedPhone}${separator}body=${encodeURIComponent(body)}`;
}

export interface ShareResult {
  shared: boolean;
  fallbackSmsLink?: string;
}

export async function shareOrFallback(
  files: File[],
  text: string,
  phone: string
): Promise<ShareResult> {
  const shareData = { files, text };
  if (
    typeof navigator.canShare === 'function' &&
    typeof navigator.share === 'function' &&
    navigator.canShare(shareData)
  ) {
    try {
      await navigator.share(shareData);
      return { shared: true };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { shared: true };
      }
      // any other error: fall through to the sms: fallback below
    }
  }
  return { shared: false, fallbackSmsLink: buildSmsLink(phone, text, navigator.userAgent) };
}
