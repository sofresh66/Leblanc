import type { Event } from '@leblanc/shared';

/** Champs d'adresse potentiellement nuls dans la réponse de l'API. */
export type EventAddressFields = Pick<Event, 'venueName' | 'address' | 'postalCode' | 'city'>;

/** Normalise une valeur potentiellement nulle ou vide ; `null` si rien d'exploitable. */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/** Ne conserve que les segments non vides, dans l'ordre reçu. */
function toParts(values: (string | null)[]): string[] {
  return values.filter((value): value is string => value !== null);
}

/**
 * Compose « Lieu, Ville » pour les aperçus (carte, fiche détaillée).
 * Retourne `null` si aucun des deux champs n'est renseigné : aucune valeur n'est inventée.
 */
export function formatVenueCity(event: EventAddressFields): string | null {
  const parts = toParts([clean(event.venueName), clean(event.city)]);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Compose l'adresse complète « Lieu, Adresse, CP Ville » (utilisée par l'export .ics).
 * Les champs nuls sont ignorés ; retourne `null` si aucun champ d'adresse n'existe.
 */
export function formatFullAddress(event: EventAddressFields): string | null {
  const postalCity = toParts([clean(event.postalCode), clean(event.city)]).join(' ');
  const parts = toParts([
    clean(event.venueName),
    clean(event.address),
    postalCity.length > 0 ? postalCity : null,
  ]);

  return parts.length > 0 ? parts.join(', ') : null;
}
