import pkg from '../package.json';

export const HUB_MANIFEST_FIELDS = [
  'name', 'version', 'title', 'description', 'icon', 'author',
  'homepage', 'repository', 'scopes', 'license',
] as const;

export type AppManifest = Pick<typeof pkg, (typeof HUB_MANIFEST_FIELDS)[number]>;

export function createManifest(): AppManifest {
  return Object.fromEntries(
    HUB_MANIFEST_FIELDS.map((field) => [field, pkg[field]]),
  ) as AppManifest;
}
