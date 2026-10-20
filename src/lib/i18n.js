import EN from './en.js';

// UI language. French strings are the keys: t('Enregistrer') is the French text, or its
// entry in en.js when the language is English (falling back to French when missing).
// Like the units in format.js, App sets it before rendering and remounts the tree on change.
let lang = 'fr';
export const LANGS = ['fr', 'en'];
export const setLang = (l) => { lang = LANGS.includes(l) ? l : 'fr'; };
export const getLang = () => lang;
/** Locale for Intl / toLocale* calls and speech. */
export const locale = () => (lang === 'en' ? 'en-GB' : 'fr-FR');

/** Device language: French for any fr-* locale, English otherwise. */
export const deviceLang = (languages = globalThis.navigator?.languages ?? []) =>
  /^fr\b/i.test(languages[0] ?? 'fr') ? 'fr' : 'en';

/**
 * Translate a French string; {name} placeholders are filled from vars. A "|context" suffix
 * tells apart identical French strings that translate differently ('Vélo|matériel' -> Bike);
 * it is dropped from the French text.
 */
export function t(fr, vars) {
  const s = (lang === 'en' && EN[fr]) || fr.split('|')[0];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
}

/** t() with the French singular/plural pair picked by n: French 0 and 1 are singular, English only 1. */
export function tn(n, one, many, vars) {
  const plural = lang === 'en' ? Math.abs(n) !== 1 : Math.abs(n) >= 2;
  return t(plural ? many : one, { n, ...vars });
}
