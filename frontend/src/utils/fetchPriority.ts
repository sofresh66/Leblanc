/**
 * Attribut HTML fetchpriority. React 18 ne connaît pas la prop « fetchPriority »
 * (avertissement en développement) : on passe l'attribut en minuscules.
 */
export function fetchPriority(priority: 'high' | 'low' | 'auto'): Record<string, string> {
  return { fetchpriority: priority };
}
