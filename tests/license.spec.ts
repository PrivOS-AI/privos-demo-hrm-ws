import { describe, expect, it } from 'vitest';
import { createLicenseGuard, LicenseError, resolveLicense } from '../src/license';

describe('license compatibility guard', () => {
  it('allows bulk export on Pro', () => {
    expect(() => createLicenseGuard(resolveLicense('{"tier":"pro","state":"active"}')).assert('bulk-export')).not.toThrow();
  });
  it('refuses bulk export on free with an upgrade message', () => {
    expect(() => createLicenseGuard(resolveLicense()).assert('bulk-export'))
      .toThrowError(/requires the Pro tier/);
  });
  it('enforces record limits helpfully', () => {
    expect(() => createLicenseGuard(resolveLicense()).assertWithin('records', 51))
      .toThrowError(/allows 50 records/);
  });
  it('degrades a lapsed Pro license without destroying state', () => {
    const license = resolveLicense('{"tier":"pro","state":"lapsed"}');
    expect(license).toMatchObject({ tier: 'free', state: 'lapsed', limits: { records: 50 } });
  });
  it('uses stable error codes', () => {
    try {
      createLicenseGuard(resolveLicense()).assert('bulk-export');
    } catch (error) {
      expect(error).toBeInstanceOf(LicenseError);
      expect((error as LicenseError).code).toBe('FEATURE_NOT_LICENSED');
    }
  });
});
