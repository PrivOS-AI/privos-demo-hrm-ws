/**
 * Pure base64 <-> UTF-8 text helpers for the App Objects (CAS) demo tab —
 * kept separate from `app-objects-panel.tsx` so they are unit-testable
 * without a DOM.
 */
export function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToText(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
