import { describe, expect, it } from 'vitest';
import {
  parseUserIdList,
  buildAssigneeValue,
  normalizeAssignedUserIds,
  assignedIdsMatch,
} from '../src/ui/assignee-demo-helpers';

describe('parseUserIdList', () => {
  it('splits on commas and whitespace and trims each id', () => {
    expect(parseUserIdList('user-1, user-2  user-3,\nuser-4')).toEqual(['user-1', 'user-2', 'user-3', 'user-4']);
  });

  it('dedupes repeated ids', () => {
    expect(parseUserIdList('user-1, user-1, user-2')).toEqual(['user-1', 'user-2']);
  });

  it('drops empty segments from trailing/leading separators', () => {
    expect(parseUserIdList(' , user-1 ,, ')).toEqual(['user-1']);
  });

  it('returns an empty array for blank input', () => {
    expect(parseUserIdList('   ')).toEqual([]);
  });
});

describe('buildAssigneeValue', () => {
  it('builds the array-of-bare-ids shape for a multi-user assignment', () => {
    expect(buildAssigneeValue(['user-1', 'user-2'])).toEqual(['user-1', 'user-2']);
  });

  it('trims, drops blanks, and dedupes', () => {
    expect(buildAssigneeValue([' user-1 ', 'user-1', '', 'user-2'])).toEqual(['user-1', 'user-2']);
  });
});

describe('normalizeAssignedUserIds', () => {
  it('accepts an array of bare-id strings', () => {
    expect(normalizeAssignedUserIds(['user-1', 'user-2'])).toEqual(['user-1', 'user-2']);
  });

  it('accepts an array of { _id } objects', () => {
    expect(normalizeAssignedUserIds([{ _id: 'user-1' }, { _id: 'user-2' }])).toEqual(['user-1', 'user-2']);
  });

  it('accepts a mixed array of bare ids and { _id } objects', () => {
    expect(normalizeAssignedUserIds(['user-1', { _id: 'user-2' }])).toEqual(['user-1', 'user-2']);
  });

  it('accepts a single bare-id string (not wrapped in an array)', () => {
    expect(normalizeAssignedUserIds('user-1')).toEqual(['user-1']);
  });

  it('accepts a single { _id } object (not wrapped in an array)', () => {
    expect(normalizeAssignedUserIds({ _id: 'user-1' })).toEqual(['user-1']);
  });

  it('ignores entries with no usable id and dedupes the rest', () => {
    expect(normalizeAssignedUserIds(['user-1', {}, null, 'user-1', 42])).toEqual(['user-1']);
  });

  it('returns an empty array for null/undefined', () => {
    expect(normalizeAssignedUserIds(null)).toEqual([]);
    expect(normalizeAssignedUserIds(undefined)).toEqual([]);
  });
});

describe('assignedIdsMatch', () => {
  it('matches identical sets regardless of order', () => {
    expect(assignedIdsMatch(['user-1', 'user-2'], ['user-2', 'user-1'])).toBe(true);
  });

  it('does not match when counts differ', () => {
    expect(assignedIdsMatch(['user-1', 'user-2'], ['user-1'])).toBe(false);
  });

  it('does not match when the id sets differ', () => {
    expect(assignedIdsMatch(['user-1', 'user-2'], ['user-1', 'user-3'])).toBe(false);
  });
});
