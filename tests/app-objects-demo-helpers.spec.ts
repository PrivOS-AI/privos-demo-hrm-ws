import { describe, expect, it } from 'vitest';
import { textToBase64, base64ToText } from '../src/ui/app-objects-demo-helpers';

describe('textToBase64 / base64ToText', () => {
  it('round-trips plain ASCII text', () => {
    const text = 'Hello from the App Objects demo.';
    expect(base64ToText(textToBase64(text))).toBe(text);
  });

  it('round-trips multi-byte UTF-8 text', () => {
    const text = 'Xin chào — sha256 digest verified end to end.';
    expect(base64ToText(textToBase64(text))).toBe(text);
  });

  it('produces standard base64 decodable independently', () => {
    expect(textToBase64('hi')).toBe('aGk=');
  });
});
