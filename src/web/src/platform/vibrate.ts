/** Bare vibrate for the family viewer (no Platform adapter there); device APIs live under platform/ (M2 AC 37). */
export function vibrate(pattern: number[]): void {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}
