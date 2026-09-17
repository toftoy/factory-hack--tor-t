/**
 * Build an `sms:` link that opens the phone's Messages app directly in a
 * conversation with `phone`, with `body` pre-filled.
 *
 * This is the primary send path, not a fallback: the Web Share API
 * (`navigator.share`) has no way to address a specific recipient — it can hand
 * off text and files to whatever app the user picks from a share sheet, but
 * the user still has to find and select the right contact themselves. An
 * `sms:` link is the only web-reachable way to get straight to the right
 * conversation, at the cost of not being able to attach the photos
 * automatically — the caller shows those as a manual follow-up step instead.
 */
export function buildSmsLink(phone: string, body: string, userAgent: string): string {
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const separator = isIOS ? '&' : '?';
  const sanitizedPhone = phone.replace(/[^\d+]/g, '');
  return `sms:${sanitizedPhone}${separator}body=${encodeURIComponent(body)}`;
}
