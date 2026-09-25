import { describe, expect, it } from 'vitest';
import { formatFullAddress, formatVenueCity } from './eventLocation';

describe('eventLocation', () => {
  const full = {
    venueName: 'Guinguette des Rives',
    address: 'Quai de la Creuse',
    postalCode: '36300',
    city: 'Le Blanc',
  };

  it('compose le lieu et la ville quand les deux sont connus', () => {
    expect(formatVenueCity(full)).toBe('Guinguette des Rives, Le Blanc');
  });

  it('retombe sur la ville seule quand le lieu est null', () => {
    expect(formatVenueCity({ ...full, venueName: null })).toBe('Le Blanc');
  });

  it('retombe sur le lieu seul quand la ville est null', () => {
    expect(formatVenueCity({ ...full, city: null })).toBe('Guinguette des Rives');
  });

  it('retourne null quand lieu et ville sont absents ou vides (aucune valeur inventée)', () => {
    expect(formatVenueCity({ ...full, venueName: null, city: null })).toBeNull();
    expect(formatVenueCity({ ...full, venueName: '   ', city: '' })).toBeNull();
  });

  it('compose l’adresse complète avec lieu, adresse et code postal', () => {
    expect(formatFullAddress(full)).toBe('Guinguette des Rives, Quai de la Creuse, 36300 Le Blanc');
  });

  it('ignore l’adresse absente en conservant le code postal et la ville', () => {
    expect(formatFullAddress({ ...full, address: null })).toBe(
      'Guinguette des Rives, 36300 Le Blanc',
    );
  });

  it('réduit le champ LOCATION au lieu quand le reste de l’adresse est absent', () => {
    expect(formatFullAddress({ ...full, address: null, postalCode: null, city: null })).toBe(
      'Guinguette des Rives',
    );
  });

  it('retourne null quand tous les champs d’adresse sont absents', () => {
    expect(
      formatFullAddress({ venueName: null, address: null, postalCode: null, city: null }),
    ).toBeNull();
  });
});
