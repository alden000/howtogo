/**
 * QA-69 (1.2): brand and agency names with their own mixed case. Upper-cased OneMap/LTA words that match a
 * key here are shown with this spelling (never all caps, never plain title case). Keys are upper case.
 */
export const BRAND_CASE: Readonly<Record<string, string>> = {
  VIVOCITY: 'VivoCity',
  JCUBE: 'JCube',
  NPARKS: 'NParks',
  // QA-75: a brand with a digit; matched as the whole word before the "words with a digit stay upper case" rule.
  '7-ELEVEN': '7-Eleven',
};
