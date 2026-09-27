# Restaurants — Lot 1 : données

Implémenté et exécuté le 27 septembre 2026, depuis Git Bash dans
`/c/Users/elhar/Documents/Playground/Leblanc`.

## Décisions conservées

- **Q1** : ingestion large, incluant restaurants, bars, cafés, restauration rapide et street-food.
- **Q2** : architecture générique `places`, prévue pour les futures routes localisées de lieux.
  Ce lot ne crée aucune route frontend ou API.
- **Q3** : absence ou insuffisance d'horaires = information inconnue.
  Aucun état « ouvert maintenant » ou « fermé » n'est calculé ou stocké.

Les modèles, endpoints et normaliseur des événements restent inchangés.

## Probe API réel

La clé `.env` a été chargée sans affichage. Le test `echo "$DATATOURISME_API_KEY" | wc -c`
a retourné **37**, et non une valeur supérieure à 40. L'API a néanmoins accepté la clé.

Les deux commandes demandées ont renvoyé :

- Structure : trois objets — Les Rives de la Creuse, Fa Si La Manger, La Table Mailloise ;
  `meta.total=32`, `page_size=3`, `total_pages=11`.
- Comptage : `meta.total=32`, `page_size=1`, `total_pages=32`.

Extrait réel réduit au contrat utile (champs omis volontairement) :

```json
{
  "uuid": "03bd32d0-2c79-333a-aecb-2a00d4cf3835",
  "label": { "@en": "Les Rives de la Creuse", "@fr": "Les Rives de la Creuse" },
  "type": ["BrasserieOrTavern", "PlaceOfInterest", "FoodEstablishment", "PointOfInterest", "Restaurant"],
  "isLocatedAt": [{
    "geo": { "latitude": 46.6353214, "longitude": 1.28616238 },
    "address": [{ "streetAddress": ["Scoury"], "postalCode": "36300", "addressLocality": "Ciron" }]
  }],
  "offers": [{ "priceSpecification": [
    { "additionalInformation": { "@fr": "Menu du jour" }, "priceCurrency": "EUR", "price": 18, "minPrice": [18], "hasEligiblePolicy": [{ "key": "BaseRateFullRate" }] },
    { "priceCurrency": "EUR", "price": 10, "minPrice": [10], "hasEligiblePolicy": [{ "key": "ChildRate" }] }
  ] }]
}
```

Le probe complémentaire `type=FoodEstablishment` renvoie **35 lieux**.
Une liste `type=FoodEstablishment,Restaurant,...` renvoie zéro objet : elle n'est pas utilisable
pour cette union. Le filtre vérifié et utilisé est :

```text
/v1/placeOfInterest
geo_distance=46.6333,1.0833,20km
filters=type[in]=FoodEstablishment,Restaurant,BarOrPub,CafeOrTeahouse,FastFoodRestaurant,StreetFood
lang=fr,en,es,de,it,nl
```

Les horaires sont demandés explicitement et trouvés dans
`isLocatedAt[].openingHoursSpecification[]`. Exemple réel du Cardinal :

```json
{
  "validFrom": "2026-06-30T22:00:00Z",
  "validThrough": "2026-08-30T22:00:00Z",
  "dayOfWeek": [{ "label": { "@en": "Wednesday", "@fr": "Mercredi" } }],
  "opens": "08:00",
  "closes": "21:00"
}
```

Cela devient une règle du mercredi (ISO 3), du **1er juillet au 31 août 2026**, de 08:00 à 21:00,
après conversion des instants en dates civiles `Europe/Paris`.
Le thésaurus réel confirme `Week0` = dernière semaine du mois, `Week1` à `Week5` = première à cinquième.

Les réponses brutes restent dans `artifacts/places-probe-{structure,count,full,wide,weeks}.json`,
ignorées par Git. La syntaxe des filtres, la sélection des champs et la pagination sont documentées
par [l'API DATAtourisme](https://api.datatourisme.fr/v1/docs).

## Migration et contrats

Le contenu SQL complet est dans [006_places.sql](../migrations/006_places.sql).
La migration est appliquée sur la base configurée par `DATABASE_URL_DIRECT`.
Elle crée `places`, `place_opening_hours`, `place_source_records`, les index GiST/B-tree
et le déclencheur `updated_at` propre aux lieux.

Deux compléments au schéma initial préservent l'information nécessaire :

- `price_details JSONB` : chaque tarif garde son libellé multilingue, ses politiques,
  ses prestations, ses bornes et sa devise. La synthèse min/max retient les pleins tarifs
  comparables, jamais les tarifs enfant. Aucun libellé « menu adulte » n'est inventé.
- `opening_hours_status` : `unknown` si aucune règle exploitable ; `partial` si certaines
  règles sont rejetées ; `provided` si les règles reçues sont exploitables.
  **`provided` ne garantit pas une couverture exhaustive et ne suffit pas pour conclure « fermé ».**

Les jours utilisent 1=lundi à 7=dimanche. Plusieurs services par jour sont conservés,
les doublons exacts sont éliminés. Les bornes de validité sont facultatives.
Une fermeture antérieure à l'ouverture représente un service franchissant minuit.
Une heure d'ouverture égale à la fermeture reste ambiguë : aucun état n'en est déduit.

Schémas ajoutés à `shared/src/schemas.ts`, types correspondants dans `shared/src/types.ts` :

- `PlaceTypeSchema`, `PlaceSchema`, `PlaceDetailSchema` ;
- `PlaceListParamsSchema`, `PlaceListResponseSchema` ;
- `OpeningHoursRuleSchema`, `PlaceSourceRecordSchema` ;
- auxiliaires `RawPlaceSchema`, `PlacePriceDetailSchema`.

## Client, normaliseur et ingestion

- `scripts/lib/datatourisme-places-client.mjs` : endpoint dédié, filtre d'union vérifié,
  six langues, horaires explicites, curseurs opaques, timeout, trois tentatives pour 429/5xx/réseau.
  Les liens de pagination sont limités à l'origine et au chemin attendus ; les redirections sont refusées.
- `scripts/lib/datatourisme-places-normalizer.mjs` : extraction des champs structurés,
  classifications multiples, rayon 20 km, horaires, prix, cuisines, contacts et photos.
  Une donnée absente reste absente ; les traductions ne sont pas fabriquées.
  Les annotations de la photo choisie, dont les crédits, sont conservées dans l'extrait source.
- `scripts/lib/places-store.mjs` : UPSERT associé à `(source, external_id)`, identifiants stables
  des règles horaires, suppression des seules règles source devenues obsolètes.
  Les statuts `hidden` et `closed` existants sont conservés.
- `scripts/ingest-places.mjs` : récupération et validation de toutes les pages avant les écritures,
  transaction atomique, verrou consultatif PostgreSQL de session, suivi dans `ingestion_runs`
  avec `source='datatourisme_places'`, compteurs par type. Aucune absence du flux ne masque un lieu.

```bash
npm run db:ingest:places -- --dry-run
npm run db:ingest:places -- --limit=3
npm run db:ingest:places
```

Le pré-script npm compile automatiquement `shared`. Le contrôle à blanc ne se connecte pas à la base.
Une ingestion limitée est marquée `partial` dans l'historique.

Le workflow `.github/workflows/production.yml` exécute également `npm run db:ingest:places`
juste après l'ingestion des événements et avant le build frontend. Il utilise les secrets
`DATABASE_URL_DIRECT` et `DATATOURISME_API_KEY` déjà configurés. Il se déclenche sur son
horaire quotidien ou manuellement avec `gh workflow run production.yml --ref main --repo sofresh66/Leblanc`.
Un push seul ne le déclenche pas.

## Résultats et vérifications

| Type interne | Nombre |
| --- | ---: |
| restaurant | 28 |
| bar | 1 |
| cafe | 1 |
| fast_food | 2 |
| food_truck | 1 |
| other_food | 2 |
| **Total** | **35** |

Les **32** objets comportant le sous-type source `Restaurant` sont tous conservés.
Le type interne donne priorité à street-food, fast-food, café, bar, puis restaurant.
Ainsi, les comptages internes sont exclusifs, contrairement aux classifications source multiples.
`food_truck` regroupe ici `StreetFood` ; cela ne constitue pas une preuve que le commerce est mobile.

- Première ingestion : **35 créations**, zéro rejet/avertissement.
- Seconde ingestion : **0 création, 35 mises à jour** ; mêmes UUID des lieux, sources et horaires.
- **35 sources**, **107 règles horaires** concernant 9 lieux ; **26 lieux aux horaires inconnus**.
- **11 lieux avec prix de synthèse**, 35 avec une URL d'image, aucun hors du rayon selon PostGIS.
- Deux exécutions enregistrées avec statut `success`.
- `npm run typecheck`, `npm run lint`, `npm run build` : succès.
- Le build initial a utilisé le repli du sitemap (API non joignable via sa configuration locale).
  Relancé avec `SITEMAP_API_URL=https://leblanc-api.elharchdenis.workers.dev/api`, il génère
  les fiches événements sans cet avertissement. Aucun paramètre `.env` n'a été modifié.
- Vérification des URLs fournies : site HTTP 200 ; API `/health` renvoie `status: ok`.
- `npm test` : **218 tests réussis**, dont **164 existants + 54 nouveaux**.
- Vérification SQL réelle : passage minuit, Week0, retrait des anciens horaires, conservation
  d'un statut masqué, rejet des jours/heures invalides et exclusion d'une connexion concurrente.
  Ces essais ont été annulés par `ROLLBACK`.
- Empreintes intégrales avant/après identiques sur `events` (**249 lignes**),
  `event_occurrences` (**447 lignes**) et `source_records` (**249 lignes**).
  Ces volumes observés incluent les contenus masqués et peuvent différer du brief antérieur.

Les preuves SQL locales sont dans `artifacts/places-db-before.json`,
`artifacts/places-db-after-first.json` et `artifacts/places-db-after-second.json`.

## Limites et points à reprendre au lot frontend

- Deux lieux ne comportent que `FoodEstablishment` : conservés en `other_food` sans inférer leur type du nom.
- Des doublons métier peuvent exister entre POI distincts (notamment les fiches d'hôtel/restaurant).
  L'idempotence porte sur l'identifiant source ; aucune fusion automatique n'a été faite.
- Les horaires sont inconnus pour 26 lieux. Une période dépassée, un jour manquant ou une règle
  ambiguë ne doit pas conduire automatiquement à « fermé ».
- Les emails ne sont plus exposés par l'API depuis le 24 juin 2026 selon sa
  [documentation](https://api.datatourisme.fr/v1/docs) ; le champ demeure nullable.
- Les données tarifaires sans politique explicite restent dans `price_details` ; une simple
  fourchette ne prouve pas qu'il s'agit d'un menu. Utiliser le libellé source dans l'affichage.
- Aucun endpoint, écran, calcul d'ouverture ou placeholder graphique n'est inclus dans ce lot de données.

## Git et commit proposé

À la livraison initiale : travail local sur `main`, dépôt propre au démarrage,
ajouts et modifications laissés non indexés, sans commit, push ou déploiement.
La finalisation demandée ensuite ajoute l'ingestion quotidienne et prévoit deux commits
(workflow, puis données), un push et une exécution manuelle du workflow de production.

Message proposé :

```text
feat(places): add restaurant data model and DATAtourisme ingestion
```
