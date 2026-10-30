// The router adapter chosen at build time (vite.config.ts).
declare module '@router' {
  export const router: import('./places.ts').RouterKit;
}
