import { describe, expect, it } from 'vitest';
import {
  addPermissionIdToGrant,
  buildItemAccessPatch,
  grantIncludes,
  findPermissionName,
} from '../src/ui/custom-permissions-helpers';

describe('addPermissionIdToGrant', () => {
  it('adds the id to an empty/undefined grant', () => {
    expect(addPermissionIdToGrant(undefined, 'perm-1')).toEqual(['perm-1']);
    expect(addPermissionIdToGrant([], 'perm-1')).toEqual(['perm-1']);
  });

  it('preserves existing ids and does not duplicate the added one', () => {
    expect(addPermissionIdToGrant(['perm-1'], 'perm-2')).toEqual(['perm-1', 'perm-2']);
    expect(addPermissionIdToGrant(['perm-1'], 'perm-1')).toEqual(['perm-1']);
  });
});

describe('buildItemAccessPatch', () => {
  it('builds only the requested grant fields', () => {
    expect(buildItemAccessPatch('perm-1', {}, { asReader: true, asEditor: false })).toEqual({ additionalReaders: ['perm-1'] });
    expect(buildItemAccessPatch('perm-1', {}, { asReader: false, asEditor: true })).toEqual({ additionalEditors: ['perm-1'] });
  });

  it('builds both grant fields and merges with existing ids', () => {
    const current = { additionalReaders: ['perm-0'], additionalEditors: [] };
    expect(buildItemAccessPatch('perm-1', current, { asReader: true, asEditor: true })).toEqual({
      additionalReaders: ['perm-0', 'perm-1'],
      additionalEditors: ['perm-1'],
    });
  });

  it('builds neither field when nothing is requested', () => {
    expect(buildItemAccessPatch('perm-1', {}, { asReader: false, asEditor: false })).toEqual({});
  });
});

describe('grantIncludes', () => {
  it('returns true only when the id is present', () => {
    expect(grantIncludes(['perm-1', 'perm-2'], 'perm-1')).toBe(true);
    expect(grantIncludes(['perm-1'], 'perm-2')).toBe(false);
  });

  it('returns false for undefined or non-array input', () => {
    expect(grantIncludes(undefined, 'perm-1')).toBe(false);
  });
});

describe('findPermissionName', () => {
  const catalog = [{ _id: 'perm-1', name: 'Legal' }, { _id: 'perm-2', name: 'Finance' }];

  it('resolves a known id to its name', () => {
    expect(findPermissionName(catalog, 'perm-1')).toBe('Legal');
  });

  it('falls back to the raw id when not found', () => {
    expect(findPermissionName(catalog, 'perm-unknown')).toBe('perm-unknown');
  });
});
