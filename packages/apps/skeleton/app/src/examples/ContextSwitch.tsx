// Use in place of the header h1 for an app working in one of several lists.
// The SDK owns grouping, spacing, the "Read only" mark, selection and
// recovery. Supply title, icon, label ("List") and texts: the app's word in
// each message that would say "context", such as shareContexts ("Share
// lists …", only on a Pod that shares no readable list), contextsLoading
// ("Loading lists …") and contextsEmpty, in the app's language from
// src/texts.ts. With a single Pod the trigger shows no Pod line. It only
// selects: keep AppAccess for sign-in, changing what is shared and managing
// Pods; mount outside TargetScreen.
export { ContextSwitch } from '@sempods/app-ui';
export type { ContextSwitchProps } from '@sempods/app-ui';
