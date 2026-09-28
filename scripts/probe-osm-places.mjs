import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { RawPlaceSchema } from '@leblanc/shared';
import { createOverpassClient } from './lib/overpass-client.mjs';
import { normalizeOsmPlace } from './lib/overpass-normalizer.mjs';

const args = process.argv.slice(2);
if (args.some((arg) => !arg.startsWith('--input=') && !arg.startsWith('--output=')))
  throw new Error('Arguments attendus : --input=probe.json et/ou --output=rapport.json');
const input = args.find((arg) => arg.startsWith('--input='))?.slice(8);
const output = args.find((arg) => arg.startsWith('--output='))?.slice(9);
if (args.filter((arg) => arg.startsWith('--input=')).length > 1 ||
    args.filter((arg) => arg.startsWith('--output=')).length > 1 ||
    (input !== undefined && !input) || (output !== undefined && !output))
  throw new Error('Arguments de probe invalides');

// Cet utilitaire ne charge aucun client SQL et n'écrit que le rapport demandé.
const payload = input
  ? JSON.parse(await readFile(resolve(input), 'utf8'))
  : await createOverpassClient().fetchPlaces();
if (!Array.isArray(payload.elements)) throw new Error('Réponse Overpass invalide : elements absent');

const items = [];
const rejected = {};
const seen = new Set();
for (const element of payload.elements) {
  const item = normalizeOsmPlace(element);
  if (!item.ok) {
    rejected[item.reason] = (rejected[item.reason] ?? 0) + 1;
    continue;
  }
  if (seen.has(item.externalId)) {
    rejected.duplicate_external_id = (rejected.duplicate_external_id ?? 0) + 1;
    continue;
  }
  seen.add(item.externalId);
  if (!RawPlaceSchema.safeParse({ id: randomUUID(), ...item.place }).success)
    throw new Error(`Contrat Place invalide pour ${item.externalId}`);
  items.push(item);
}
const byType = Object.fromEntries([...new Set(items.map((item) => item.place.type))].sort()
  .map((type) => [type, items.filter((item) => item.place.type === type).length]));
const summary = {
  mode: 'DRY_RUN_NO_DATABASE_WRITES',
  input: input ? 'snapshot' : 'overpass_live',
  rawCount: payload.elements.length,
  accepted: items.length,
  rejected,
  byType,
  withOpeningHoursRaw: items.filter((item) => item.openingHoursRaw).length,
  withAddress: items.filter((item) => item.place.address).length,
  withPostalCode: items.filter((item) => item.place.postalCode).length,
  withPhone: items.filter((item) => item.place.phone).length,
  withWebsite: items.filter((item) => item.place.website).length,
};
if (output) {
  const path = resolve(output);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ summary, items }, null, 2)}\n`);
}
console.log(JSON.stringify({ summary, examples: items.slice(0, 5), output: output ?? null }, null, 2));
