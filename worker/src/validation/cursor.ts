import { CursorPayloadSchema, type CursorPayload } from '@leblanc/shared';

/**
 * Encode un curseur de pagination opaque en base64url.
 *
 * @param startsAt Date de début de l'occurrence (format ISO)
 * @param id Identifiant de l'événement (UUID)
 */
export function encodeCursor(startsAt: string, id: string): string {
  const payload = JSON.stringify({ d: startsAt, i: id });
  const base64 = btoa(payload);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Décode et valide rigoureusement la structure d'un curseur de pagination.
 *
 * @param cursor Chaîne base64 ou base64url représentant le curseur
 * @returns Objet validé { d: string, i: string }
 * @throws {Error} Si le curseur n'est pas une base64 valide, n'est pas du JSON ou échoue à la validation
 */
export function decodeCursor(cursor: string): CursorPayload {
  if (!cursor || typeof cursor !== 'string') {
    throw new Error('Curseur invalide : chaîne vide ou manquante');
  }
  if (cursor.length > 512 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(cursor)) {
    throw new Error('Curseur invalide : encodage base64 incorrect');
  }

  let jsonString: string;
  try {
    // Normalise base64url vers base64 standard avec padding
    let base64 = cursor.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }

    jsonString = atob(base64);
  } catch {
    throw new Error('Curseur invalide : encodage base64 incorrect');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('Curseur invalide : JSON malformé');
  }

  const result = CursorPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Curseur invalide : ${result.error.issues.map((e) => e.message).join(', ')}`
    );
  }

  return result.data;
}
