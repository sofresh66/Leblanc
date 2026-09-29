# Corrections critiques — 30 septembre 2026

## État de livraison

- Nettoyage en production approuvé et exécuté : 26 descriptions manuelles vidées, 33 lieux manuels toujours publiés, 26 notes conservées intégralement.
- Fallback et importeur corrigés localement, sans commit ni déploiement.
- Aucun changement des données DATAtourisme.

## Cause exacte du fallback

L'ancienne fonction `resolveEventContent` testait uniquement `event.title_i18n[normLang]`. Si le titre demandé était absent, elle passait directement à cette branche :

```ts
if (event.title_i18n.fr) {
  return {
    title: event.title_i18n.fr,
    description: event.description_i18n.fr,
    contentLanguage: 'fr',
    isFallback: true,
  };
}
```

La description traduite existante n'était plus consultée. À l'inverse, un titre anglais accompagné d'une description française produisait `contentLanguage: 'en'` pour un contenu mixte.

Chaque champ a désormais son propre repli : langue demandée → français → première langue disponible. Les textes vides ne bloquent pas le repli. `contentLanguage` et `isFallback` continuent de décrire le titre ; `descriptionLanguage` décrit séparément la description. Le mapper Worker et le repository de données locales transmettent ce champ. Le repository HTTP recalcule aussi les deux textes à partir des traductions brutes, ce qui permet au frontend corrigé de fonctionner avec le Worker actuellement déployé. Le champ reste optionnel dans le schéma HTTP pour accepter ces anciennes réponses.

Le titre et la description déclarent chacun leur attribut HTML `lang`. Le badge de fallback concerne explicitement le titre et indique sa langue réelle ; les six traductions du badge ont été adaptées.

## Mesure sur l'API publique actuelle

| Langue | Descriptions disponibles mais ignorées sans titre traduit |
|---|---:|
| Anglais | 106 / 125 |
| Espagnol | 106 / 125 |
| Allemand | 105 / 125 |
| Italien | 125 / 125 |
| Néerlandais | 106 / 125 |

L'audit initial de 105 fiches pour chaque langue était donc approximatif. Ne pas confondre ces 125 événements exposés par l'API (périmètre et fenêtre temporelle) avec les 192 événements publiés présents en base.

Contrôle visuel local avec données publiques réelles : `/en/events/f9da7ae4-da6c-4893-a42c-69926251e7fc` affiche le titre français « L'éloge de la fuite / Cirque contemporain » et sa description anglaise, avec `lang=fr` sur le titre et `lang=en` sur la description. Le site déployé conserve l'ancien fallback tant que le correctif frontend n'est pas publié.

## Notes internes

[Liste complète des 26 UUID, noms et descriptions avant/après](audit-descriptions-manuelles-2026-09-30.md).

L'importeur laisse désormais toutes les descriptions manuelles vides et conserve `precision` dans `raw_excerpt.precision`, conformément à la décision finale de l'utilisateur. Les tests SQL vérifient l'absence des mots suspects parmi les lieux manuels publiés et la présence des notes privées. Les 14 descriptions de fiches déjà masquées, hors périmètre approuvé, n'ont pas été modifiées.

API publique paginée : 68 lieux, dont 33 manuels ; 33 descriptions manuelles vides ; aucun mot-clé suspect. Contrôle navigateur de `/fr/ou-manger` puis de la fiche Dublineau David : « Description non disponible » remplace la note de doublon.

## Vérifications

- `npm run typecheck` : succès.
- `npm run lint` : succès.
- `npm test` : 354/354, soit 17 nouveaux tests ; les 337 tests précédents passent.
- Intégration SQL réelle en lecture seule : 22/22, dont 2 nouveaux tests.
- `npm run build` : succès, sitemap complet après configuration de l'URL publique de l'API (le .env local a une URL vide).
- `git diff --check` : succès.
- Aucun `any` ajouté.

Couverture ajoutée : description traduite sans titre dans les cinq langues, titre traduit sans description, repli complet, traductions vides, langue invalide, propagation Worker, compatibilité avec les réponses anciennes, rendu HTML, exclusion des notes des 56 entrées du fichier manuel, conservation de leur trace privée, contrôles SQL réels.

## Points à suivre

- Le workflow planifié à 03:00 Europe/Paris utilise encore l'ancien importeur de main : il peut republier les notes tant que le correctif n'est pas poussé. Aucun commit n'a été créé, conformément à la consigne.
- Certaines traductions préexistantes paraissent incohérentes : « Une épopée municipale » a une description anglaise parlant d'un imitateur ; « Randonnée pédestre Octobre Rose » mentionne des distances différentes selon la langue ; « L'affaire de Fachoda » commence par `%C0` en anglais. Données laissées intactes ; le fallback corrigé les rendra visibles.
- Avertissements existants non bloquants : annotations Rollup dans Zod et futures options React Router.

Message de commit proposé : `fix: resolve event translations independently and keep manual notes private`.
