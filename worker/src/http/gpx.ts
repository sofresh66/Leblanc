import {
  ODBL_LICENSE_URL,
  OSM_ATTRIBUTION_TEXT,
  OSM_COPYRIGHT_URL,
  TrailTrackSchema,
} from '@leblanc/shared';

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char] ?? char);
}

/** Nom de fichier ASCII sûr pour Content-Disposition. */
export function gpxFileName(title: string): string {
  const slug = title.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return `${slug || 'parcours'}.gpx`;
}

/**
 * GPX 1.1 d'un tracé OpenStreetMap. Le fichier est une base de données dérivée
 * d'OSM : il reste sous ODbL, ce que disent ses métadonnées.
 */
export function buildGpx({ title, osmRelationId, trackGeojson }: { title: string; osmRelationId: number; trackGeojson: string }): string {
  const track = TrailTrackSchema.parse(JSON.parse(trackGeojson) as unknown);
  const name = escapeXml(title);
  const segments = track.coordinates.map((line) => [
    '      <trkseg>',
    ...line.map(([lon, lat]) => `        <trkpt lat="${lat}" lon="${lon}"/>`),
    '      </trkseg>',
  ].join('\n'));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Le Blanc &amp; Moi" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <metadata>',
    `    <name>${name}</name>`,
    `    <desc>${escapeXml(`Tracé ${OSM_ATTRIBUTION_TEXT} (relation ${osmRelationId}).`)}</desc>`,
    '    <copyright author="OpenStreetMap contributors">',
    `      <license>${ODBL_LICENSE_URL}</license>`,
    '    </copyright>',
    `    <link href="${OSM_COPYRIGHT_URL}"><text>${escapeXml(OSM_ATTRIBUTION_TEXT)}</text></link>`,
    `    <link href="https://www.openstreetmap.org/relation/${osmRelationId}"><text>Relation OpenStreetMap ${osmRelationId}</text></link>`,
    '  </metadata>',
    '  <trk>',
    `    <name>${name}</name>`,
    segments.join('\n'),
    '  </trk>',
    '</gpx>',
    '',
  ].join('\n');
}
