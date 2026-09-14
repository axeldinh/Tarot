import { createContext, useContext } from 'react';
import { fr, type Dict } from './fr.ts';
import { en } from './en.ts';

export type Lang = 'fr' | 'en';

export const DICTS: Record<Lang, Dict> = { fr, en };

/** French by default, as the spec asks. */
export const DEFAULT_LANG: Lang = 'fr';

export interface I18n {
  lang: Lang;
  t: Dict;
  setLang(lang: Lang): void;
}

export const I18nContext = createContext<I18n>({
  lang: DEFAULT_LANG,
  t: fr,
  setLang: () => {},
});

export function useI18n(): I18n {
  return useContext(I18nContext);
}

export type { Dict };
export { fr, en };
