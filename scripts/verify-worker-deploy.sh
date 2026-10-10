#!/usr/bin/env bash
# Vérifie, en lecture seule, un Worker déployé : anciennes routes, routes des parcours, CORS.
# Usage : scripts/verify-worker-deploy.sh [URL_API] [vide|données]
#   URL_API : défaut https://leblanc-api.elharchdenis.workers.dev
#   vide    : la table des parcours est vide (juste après le déploiement) ; données : ingestion faite.
set -u

API="${1:-https://leblanc-api.elharchdenis.workers.dev}"
API="${API%/}"
ROUTES_STATE="${2:-vide}"
FAILURES=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass() { printf '  OK    %s\n' "$1"; }
fail() { printf '  ÉCHEC %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }
# get CHEMIN NOM [ORIGIN] : corps, en-têtes et statut
get() {
  local origin_header=()
  [ -n "${3:-}" ] && origin_header=(-H "Origin: $3")
  curl -s "${origin_header[@]}" -D "$TMP/$2.headers" -o "$TMP/$2.json" -w '%{http_code}' "$API$1" > "$TMP/$2.status"
}
status() { cat "$TMP/$1.status"; }
json() { node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log($2)" "$TMP/$1.json"; }
acao() { grep -i '^access-control-allow-origin:' "$TMP/$1.headers" | tr -d '\r' | sed 's/^[^:]*: *//'; }

echo "Worker testé : $API (parcours : $ROUTES_STATE)"

# Juste après un déploiement, certaines requêtes peuvent encore atteindre l'ancienne
# version le temps de la propagation. On attend 5 réponses consécutives de la
# nouvelle version (/routes en 200 et origine de preview acceptée), 90 s au plus.
PREVIEW_ORIGIN=https://routes-preview.leblanc-et-moi.pages.dev
consecutive=0
for attempt in $(seq 1 45); do
  code="$(curl -s -o /dev/null -D "$TMP/probe.headers" -w '%{http_code}' -H "Origin: $PREVIEW_ORIGIN" "$API/api/v1/routes?limit=1")"
  origin="$(grep -i '^access-control-allow-origin:' "$TMP/probe.headers" | tr -d '\r' | sed 's/^[^:]*: *//')"
  if [ "$code" = 200 ] && [ "$origin" = "$PREVIEW_ORIGIN" ]; then consecutive=$((consecutive + 1)); else consecutive=0; fi
  [ "$consecutive" -ge 5 ] && break
  sleep 2
done
if [ "$consecutive" -ge 5 ]; then
  echo "Propagation : nouvelle version servie de façon stable (après $attempt essai(s))."
else
  echo "Propagation : nouvelle version NON stable après 90 s (dernier essai : statut $code, CORS « $origin »)."
fi

echo "Anciennes routes"
get /health health
check "/health 200 et status ok" '[ "$(status health)" = 200 ] && [ "$(json health "j.status")" = ok ]'
get "/api/v1/events?limit=3" events
check "/events 200 avec des événements" '[ "$(status events)" = 200 ] && [ "$(json events "j.items.length")" -gt 0 ]'
get "/api/v1/events/geo?lang=fr" eventsgeo
check "/events/geo 200 avec des points" '[ "$(status eventsgeo)" = 200 ] && [ "$(json eventsgeo "j.items.length")" -gt 0 ]'
EVENT_ID="$(json events "j.items[0]?.id ?? ''")"
get "/api/v1/events/$EVENT_ID?lang=fr" event
check "/events/:id 200" '[ "$(status event)" = 200 ]'
get /api/v1/categories categories
check "/categories 200" '[ "$(status categories)" = 200 ]'
get "/api/v1/places?limit=3" places
check "/places 200 avec des lieux" '[ "$(status places)" = 200 ] && [ "$(json places "j.items.length")" -gt 0 ]'
PLACE_ID="$(json places "j.items[0]?.id ?? ''")"
get "/api/v1/places/$PLACE_ID?lang=fr" place
check "/places/:id 200" '[ "$(status place)" = 200 ]'

echo "Routes des parcours"
get "/api/v1/routes?limit=3" routes
get /api/v1/routes/geo routesgeo
if [ "$ROUTES_STATE" = vide ]; then
  check "/routes 200, liste vide, sans curseur" '[ "$(status routes)" = 200 ] && [ "$(json routes "j.items.length")" = 0 ] && [ "$(json routes "j.nextCursor")" = null ]'
  check "/routes/geo 200, aucun parcours" '[ "$(status routesgeo)" = 200 ] && [ "$(json routesgeo "j.items.length")" = 0 ]'
else
  check "/routes 200 avec des parcours et un curseur" '[ "$(status routes)" = 200 ] && [ "$(json routes "j.items.length")" = 3 ] && [ "$(json routes "j.nextCursor")" != null ]'
  check "/routes/geo 200 avec des tracés" '[ "$(status routesgeo)" = 200 ] && [ "$(json routesgeo "j.items.filter(i=>i.hasTrack).length")" -gt 0 ]'
fi
get /api/v1/routes/00000000-0000-4000-8000-000000000000 routeunknown
check "/routes/<uuid inconnu> 404" '[ "$(status routeunknown)" = 404 ]'
get /api/v1/routes/pas-un-uuid routeinvalid
check "/routes/pas-un-uuid 400" '[ "$(status routeinvalid)" = 400 ]'
get "/api/v1/routes?modes=car" routebadmode
check "/routes?modes=car 400" '[ "$(status routebadmode)" = 400 ]'

echo "CORS"
get "/api/v1/events?limit=1" corsprod https://leblanc-et-moi.pages.dev
check "site de production autorisé (/events)" '[ "$(acao corsprod)" = "https://leblanc-et-moi.pages.dev" ]'
get "/api/v1/routes?limit=1" corsprodroutes https://leblanc-et-moi.pages.dev
check "site de production autorisé (/routes)" '[ "$(acao corsprodroutes)" = "https://leblanc-et-moi.pages.dev" ]'
get "/api/v1/routes?limit=1" corspreview https://routes-preview.leblanc-et-moi.pages.dev
check "preview du projet autorisée" '[ "$(acao corspreview)" = "https://routes-preview.leblanc-et-moi.pages.dev" ]' || true
[ "$(acao corspreview)" = "https://routes-preview.leblanc-et-moi.pages.dev" ] || echo "        reçu : statut $(status corspreview), CORS « $(acao corspreview) »"
for origin in http://routes-preview.leblanc-et-moi.pages.dev https://evil-leblanc-et-moi.pages.dev https://a.b.leblanc-et-moi.pages.dev https://leblanc-et-moi.pages.dev.evil.com; do
  name="cors$(printf '%s' "$origin" | tr -c 'a-z0-9' '_')"
  get "/api/v1/routes?limit=1" "$name" "$origin"
  check "refusé : $origin" '[ -z "$(acao "$name")" ]'
done
PREFLIGHT="$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS -H 'Origin: https://leblanc-et-moi.pages.dev' -H 'Access-Control-Request-Method: GET' "$API/api/v1/routes")"
check "prévol OPTIONS 204" '[ "$PREFLIGHT" = 204 ]'

if [ "$FAILURES" -eq 0 ]; then
  echo "Résultat : tous les contrôles sont passés."
else
  echo "Résultat : $FAILURES contrôle(s) en échec."
  exit 1
fi
