export function buildSmsLink(phone: string, body: string, userAgent: string): string {
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const separator = isIOS ? '&' : '?';
  return `sms:${phone}${separator}body=${encodeURIComponent(body)}`;
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
    await navigator.share(shareData);
    return { shared: true };
  }
  return { shared: false, fallbackSmsLink: buildSmsLink(phone, text, navigator.userAgent) };
}
