export const LANGUAGES = ['hi-IN', 'en-IN'] as const;
export type Language = (typeof LANGUAGES)[number];
