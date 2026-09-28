import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import frPlaces from '../../../../public/locales/fr/places.json';
import enPlaces from '../../../../public/locales/en/places.json';
import esPlaces from '../../../../public/locales/es/places.json';
import dePlaces from '../../../../public/locales/de/places.json';
import itPlaces from '../../../../public/locales/it/places.json';
import nlPlaces from '../../../../public/locales/nl/places.json';
import frCommon from '../../../../public/locales/fr/common.json';
import frErrors from '../../../../public/locales/fr/errors.json';

export const testI18n = createInstance();
void testI18n.use(initReactI18next).init({
  lng: 'fr',
  fallbackLng: 'fr',
  defaultNS: 'places',
  ns: ['places', 'common', 'errors'],
  resources: {
    fr: { places: frPlaces, common: frCommon, errors: frErrors },
    en: { places: enPlaces },
    es: { places: esPlaces },
    de: { places: dePlaces },
    it: { places: itPlaces },
    nl: { places: nlPlaces },
  },
  initImmediate: false,
  interpolation: { escapeValue: false },
});
