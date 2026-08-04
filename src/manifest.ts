import publisherManifest from '../privos-app.json';

export const MARKETPLACE_MANIFEST_FIELDS = [
  'schemaVersion', 'kind', 'name', 'version', 'title', 'description', 'icon',
  'author', 'homepage', 'repository', 'permissions', 'dataPolicy', 'availabilityTier',
  'tools', 'port', 'resources', 'volumes', 'stateless', 'license',
  'resourceManifestTemplate',
] as const;

export const HUB_MANIFEST_FIELDS = MARKETPLACE_MANIFEST_FIELDS;

export type AppManifest = Pick<typeof publisherManifest, (typeof MARKETPLACE_MANIFEST_FIELDS)[number]>;

export function createManifest(): AppManifest {
  return Object.fromEntries(
    MARKETPLACE_MANIFEST_FIELDS.map((field) => [field, publisherManifest[field]]),
  ) as AppManifest;
}
