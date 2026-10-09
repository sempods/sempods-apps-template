import { describe, expect, it } from 'vitest';
import { app } from './sempods.generated.ts';
import { startMessage } from './start.ts';

describe('startMessage', () => {
  it('speaks the app language', () => {
    expect(startMessage('de')).toMatch(/^Verbunden\./);
    expect(startMessage('en')).toMatch(/^Connected\./);
  });

  it('has a text for the configured language', () => {
    // The generated configuration imports without a browser.
    expect(startMessage(app.language)).not.toBe('');
  });
});
