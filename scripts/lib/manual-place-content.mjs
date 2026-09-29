/** Les notes de modération restent dans raw_excerpt, jamais dans le contenu public. */
export function manualPlaceContent(item) {
  return {
    description_i18n: {},
    raw_excerpt: { ...item },
  };
}
