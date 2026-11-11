import { describe, expect, it } from 'vitest';
import { app } from './sempods.generated.ts';
import { chosenLocale, texts, uiLocale } from './texts.ts';

describe('texts', () => {
  it('has every text in every language', () => {
    const keys = Object.keys(texts.en);
    for (const catalogue of [texts.en, texts.de]) {
      expect(Object.keys(catalogue)).toEqual(keys);
      for (const text of Object.values(catalogue)) expect(text).not.toBe('');
    }
  });

  it('takes the language from the browser unless one is configured', () => {
    expect(uiLocale('auto', ['de-AT', 'en'])).toEqual({
      locale: 'de-AT',
      language: 'de',
    });
    // An unsupported language keeps its regional formats with English texts.
    expect(uiLocale('auto', ['fr-FR'])).toEqual({
      locale: 'fr-FR',
      language: 'en',
    });
    expect(uiLocale('de', ['en-US']).language).toBe('de');
    // The generated configuration imports without a browser.
    expect(['en', 'de']).toContain(uiLocale(app.language, []).language);
  });

  it('keeps the browser region for a chosen language that matches it', () => {
    expect(chosenLocale('en', ['de-DE', 'en-GB'])).toEqual({
      locale: 'en-GB',
      language: 'en',
    });
    expect(chosenLocale('de', ['en-US', 'de-AT'])).toEqual({
      locale: 'de-AT',
      language: 'de',
    });
    // No match, or no valid tag: the language's default formats.
    expect(chosenLocale('de', ['en-GB', 'not a tag'])).toEqual({
      locale: 'de',
      language: 'de',
    });
  });
});
