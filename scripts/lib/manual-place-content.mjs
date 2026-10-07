import { assertPublicDescriptionClean } from './public-description-guard.mjs';

/** Les notes de modération restent dans raw_excerpt, jamais dans le contenu public. */
export function manualPlaceContent(item) {
  const content = {
    description_i18n: {},
    raw_excerpt: { ...item },
  };
  assertPublicDescriptionClean(content.description_i18n, `manuel:${item.externalId ?? item.nom ?? '?'}`);
  return content;
}
