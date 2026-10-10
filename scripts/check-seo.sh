#!/usr/bin/env bash
# Vérifie ce que voient les robots sans JavaScript (aperçus WhatsApp/Facebook) :
# statuts HTTP (vraies 404), balises <head> injectées par le middleware Pages,
# en-têtes de sécurité et cache des assets.
# Usage : scripts/check-seo.sh [URL_DU_SITE]   (défaut : http://localhost:8788, wrangler pages dev)
set -u

BASE="${1:-http://localhost:8788}"
BASE="${BASE%/}"
UA='facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
FAILURES=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass() { printf '  OK    %s\n' "$1"; }
fail() { printf '  ÉCHEC %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

# fetch CHEMIN NOM : enregistre le corps, les en-têtes et le statut (sans suivre les redirections).
fetch() {
  curl -s -A "$UA" -D "$TMP/$2.headers" -o "$TMP/$2.html" -w '%{http_code}' "$BASE$1" > "$TMP/$2.status"
}
status() { cat "$TMP/$1.status"; }
count() { grep -o "$2" "$TMP/$1.html" | wc -l | tr -d ' '; }
has_header() { grep -qi "^$2:" "$TMP/$1.headers"; }

echo "Site testé : $BASE"

# Identifiants réels pris dans le sitemap.
curl -s "$BASE/sitemap.xml" > "$TMP/sitemap.xml"
EVENT_PATH="$(grep -o '<loc>[^<]*/fr/evenements/[^<]*</loc>' "$TMP/sitemap.xml" | head -1 | sed -E 's#<loc>https?://[^/]+##; s#</loc>##')"
PLACE_PATH="$(grep -o '<loc>[^<]*/fr/lieux/[^<]*</loc>' "$TMP/sitemap.xml" | head -1 | sed -E 's#<loc>https?://[^/]+##; s#</loc>##')"
check "sitemap : contient une fiche événement et une fiche lieu" '[ -n "$EVENT_PATH" ] && [ -n "$PLACE_PATH" ]'
WALK_PATH="$(grep -o '<loc>[^<]*/fr/se-balader/[^<]*</loc>' "$TMP/sitemap.xml" | head -1 | sed -E 's#<loc>https?://[^/]+##; s#</loc>##')"
check "sitemap : contient la liste et une fiche « Se balader »" 'grep -q "/fr/se-balader</loc>" "$TMP/sitemap.xml" && [ -n "$WALK_PATH" ]'
check "sitemap : alternates hreflang ×6 + x-default par URL" '[ "$(grep -o "<url>" "$TMP/sitemap.xml" | wc -l)" -gt 0 ] && [ "$(grep -o "<xhtml:link" "$TMP/sitemap.xml" | wc -l)" = "$(( $(grep -o "<url>" "$TMP/sitemap.xml" | wc -l) * 7 ))" ]'
check "sitemap : chaque URL a un lastmod" '[ "$(grep -o "<url>" "$TMP/sitemap.xml" | wc -l)" = "$(grep -o "<lastmod>" "$TMP/sitemap.xml" | wc -l)" ]'

echo "Page fixe : /de/karte"
fetch /de/karte static
check "statut 200" '[ "$(status static)" = 200 ]'
check "un seul <title>, propre à la page" '[ "$(count static "<title")" = 1 ] && grep -q "<title>Veranstaltungskarte" "$TMP/static.html"'
check "html lang=de" 'grep -q "<html lang=\"de\"" "$TMP/static.html"'
check "une seule canonical, vers /de/karte" '[ "$(count static "rel=\"canonical\"")" = 1 ] && grep -q "rel=\"canonical\" href=\"[^\"]*/de/karte\"" "$TMP/static.html"'
check "hreflang ×6 + x-default" '[ "$(count static "rel=\"alternate\"")" = 7 ]'
check "Open Graph et Twitter" 'grep -q "property=\"og:title\"" "$TMP/static.html" && grep -q "property=\"og:image\"" "$TMP/static.html" && grep -q "name=\"twitter:card\"" "$TMP/static.html"'
check "robots index" 'grep -q "name=\"robots\" content=\"index, follow\"" "$TMP/static.html"'

echo "En-têtes de sécurité (HTML servi par le middleware)"
for header in Strict-Transport-Security X-Frame-Options X-Content-Type-Options Referrer-Policy Permissions-Policy Content-Security-Policy-Report-Only; do
  check "$header" "has_header static $header"
done
check "CSP : tuiles tile.openstreetmap.org et images tourinsoft autorisées, report-uri" 'grep -i "^Content-Security-Policy-Report-Only:" "$TMP/static.headers" | grep -q "https://tile.openstreetmap.org" && grep -i "^Content-Security-Policy-Report-Only:" "$TMP/static.headers" | grep -q "media.tourinsoft.eu" && grep -i "^Content-Security-Policy-Report-Only:" "$TMP/static.headers" | grep -q "report-uri"'

echo "Fiche événement : $EVENT_PATH"
fetch "$EVENT_PATH" event
check "statut 200" '[ "$(status event)" = 200 ]'
check "titre de l'événement (pas le titre générique)" '! grep -q "<title>Le Blanc &amp; Moi</title>" "$TMP/event.html" && ! grep -q "<title>Le Blanc & Moi</title>" "$TMP/event.html"'
check "og:title, og:description et og:image" 'grep -q "property=\"og:title\"" "$TMP/event.html" && grep -q "property=\"og:description\" content=\"[^\"]\+\"" "$TMP/event.html" && grep -q "property=\"og:image\" content=\"https\?://" "$TMP/event.html"'
check "JSON-LD Event" 'grep -q "\"@type\":\"Event\"" "$TMP/event.html"'
check "balises injectées marquées data-rh" 'grep -q "<meta data-rh=\"true\" property=\"og:title\"" "$TMP/event.html"'

echo "Fiche lieu : $PLACE_PATH"
fetch "$PLACE_PATH" place
check "statut 200" '[ "$(status place)" = 200 ]'
check "JSON-LD d'établissement de restauration" 'grep -Eq "\"@type\":\"(Restaurant|BarOrPub|CafeOrCoffeeShop|FastFoodRestaurant|FoodEstablishment)\"" "$TMP/place.html"'

echo "Se balader : liste filtrée et fiche $WALK_PATH"
fetch "/fr/se-balader?withTrack=true&modes=foot%2Chorse" walks
check "liste filtrée : 200, canonical sans paramètres" '[ "$(status walks)" = 200 ] && grep -q "rel=\"canonical\" href=\"[^\"]*/fr/se-balader\"" "$TMP/walks.html"'
fetch "$WALK_PATH" walk
check "fiche : statut 200 et titre propre" '[ "$(status walk)" = 200 ] && ! grep -q "<title>Le Blanc &amp; Moi</title>" "$TMP/walk.html"'
check "fiche : hreflang ×6 + x-default" '[ "$(count walk "rel=\"alternate\"")" = 7 ]'
check "fiche : JSON-LD TouristTrip" 'grep -q "\"@type\":\"TouristTrip\"" "$TMP/walk.html"'

echo "Vraies 404"
for path in /fr/page-inconnue /xx/carte /fr/evenements/pas-un-uuid /fr/evenements/00000000-0000-4000-8000-000000000000 /fr/lieux/00000000-0000-4000-8000-000000000000 /fr/se-balader/pas-un-uuid /de/touren/00000000-0000-4000-8000-000000000000; do
  name="nf$(printf '%s' "$path" | tr -c 'a-z0-9' '_')"
  fetch "$path" "$name"
  check "$path → 404 noindex" '[ "$(status "$name")" = 404 ] && grep -q "name=\"robots\" content=\"noindex, follow\"" "$TMP/$name.html"'
done

echo "Assets"
ASSET="$(grep -o '/assets/[^"]*\.js' "$TMP/static.html" | head -1)"
curl -s -I "$BASE$ASSET" > "$TMP/asset.headers"
check "$ASSET : cache immuable d'un an" 'grep -i "^Cache-Control:" "$TMP/asset.headers" | grep -q "max-age=31536000" && grep -i "^Cache-Control:" "$TMP/asset.headers" | grep -q immutable'

if [ "$FAILURES" -eq 0 ]; then
  echo "Résultat : tous les contrôles sont passés."
else
  echo "Résultat : $FAILURES contrôle(s) en échec."
  exit 1
fi
