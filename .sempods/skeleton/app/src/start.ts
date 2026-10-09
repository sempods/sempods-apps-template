import type { Language } from '@sempods/app-sdk';

// Replace this with your app's own domain logic. Pure functions like this one
// are tested in src/start.test.ts without a browser or a Pod.
export function startMessage(language: Language): string {
  return language === 'de'
    ? 'Verbunden. Beschreibe deinem Assistenten, was diese App tun soll.'
    : 'Connected. Tell your assistant what this app should do.';
}
