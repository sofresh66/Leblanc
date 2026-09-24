import crypto from 'node:crypto';
import fs from 'node:fs';

/**
 * Extrait le préfixe numérique d'un nom de fichier de migration (ex: "001_extensions.sql" -> 1).
 *
 * @param {string} filename Nom du fichier de migration
 * @returns {number} Numéro de version entier
 * @throws {Error} Si le fichier ne respecte pas le format attendu
 */
export function parseMigrationVersion(filename) {
  const match = filename.match(/^(\d+)_.+\.sql$/);
  if (!match) {
    throw new Error(
      `Format de fichier de migration invalide : "${filename}". Format attendu : <numero>_<description>.sql`,
    );
  }
  const version = parseInt(match[1], 10);
  if (isNaN(version)) {
    throw new Error(`Préfixe numérique non valide dans "${filename}"`);
  }
  return version;
}

/**
 * Trie une liste de noms de fichiers de migration par leur numéro de version croissant.
 * Vérifie l'unicité des numéros de version et rejette tout doublon.
 *
 * @param {string[]} filenames Liste des noms de fichiers
 * @returns {string[]} Liste ordonnée par version croissante
 * @throws {Error} En cas de doublon de version ou de format incorrect
 */
export function sortMigrations(filenames) {
  const parsed = filenames.map((file) => ({
    file,
    version: parseMigrationVersion(file),
  }));

  const versionsSeen = new Map();
  for (const { file, version } of parsed) {
    if (versionsSeen.has(version)) {
      throw new Error(
        `Version de migration dupliquée détectée : la version ${version} est présente dans "${versionsSeen.get(version)}" et "${file}".`,
      );
    }
    versionsSeen.set(version, file);
  }

  parsed.sort((a, b) => a.version - b.version);
  return parsed.map((item) => item.file);
}

/**
 * Calcule l'empreinte SHA-256 déterministe d'un contenu SQL ou d'un fichier.
 * Normalise impérativement les fins de ligne (CRLF -> LF et CR -> LF) pour garantir un hash
 * strictement identique entre différents systèmes d'exploitation (Windows, Linux, macOS).
 *
 * @param {string} contentOrPath Contenu SQL ou chemin de fichier
 * @returns {string} Empreinte SHA-256 hexadécimale
 */
export function computeChecksum(contentOrPath) {
  let rawContent;
  if (typeof contentOrPath === 'string' && fs.existsSync(contentOrPath)) {
    rawContent = fs.readFileSync(contentOrPath, 'utf-8');
  } else {
    rawContent = contentOrPath;
  }

  // Normalisation déterministe des fins de ligne
  const normalized = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return crypto.createHash('sha256').update(normalized, 'utf-8').digest('hex');
}
