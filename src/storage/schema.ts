import { schemaV2 } from './schema-v2.js';
import { lookupSchema } from './lookup-schema.js';
/** Versioned, toolkit-owned schema. Existing databases require an explicit offline upgrade. */
export const schemaVersion = 3;
export const applicationId = 0x57504b54;
export const schemaStatements = [
  ...schemaV2
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean),
  ...lookupSchema,
];
export const schema = schemaStatements.join(';\n') + ';';
