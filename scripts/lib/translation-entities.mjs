// Tables contrôlées par les scripts de traduction (statut, scores, signalements).
// Les deux tables ont la même forme : title_i18n, description_i18n,
// translation_status, et une table de sources DATAtourisme.
export const TRANSLATION_ENTITIES = {
  events: { table: 'events', sourceTable: 'source_records', foreignKey: 'event_id', label: 'événements', fileSuffix: '' },
  routes: { table: 'routes', sourceTable: 'route_source_records', foreignKey: 'route_id', label: 'parcours', fileSuffix: '-routes' },
};

/** --entity=events|routes (défaut : events, comportement historique). */
export function parseEntity(argv) {
  const options = argv.filter((arg) => arg.startsWith('--entity='));
  if (options.length > 1) throw new Error('--entity ne peut être donné qu’une fois');
  const name = options[0]?.slice('--entity='.length) ?? 'events';
  const entity = TRANSLATION_ENTITIES[name];
  if (!entity) throw new Error(`--entity attendu : ${Object.keys(TRANSLATION_ENTITIES).join(' ou ')}`);
  return { name, ...entity };
}
