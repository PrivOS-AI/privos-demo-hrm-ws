export type LicenseTier = 'free' | 'pro';

export interface AppLicense {
  tier: LicenseTier;
  state: 'active' | 'lapsed';
  features: string[];
  limits: Record<string, number>;
}

const TIER_CONFIG: Record<LicenseTier, Omit<AppLicense, 'state'>> = {
  free: { tier: 'free', features: [], limits: { records: 50 } },
  pro: { tier: 'pro', features: ['bulk-export'], limits: { records: 5000 } },
};

export class LicenseError extends Error {
  constructor(message: string, public readonly code: 'FEATURE_NOT_LICENSED' | 'LIMIT_EXCEEDED') {
    super(message);
  }
}

// Compatibility surface for the forthcoming @privos/app-license package.
export function resolveLicense(raw = process.env.PRIVOS_APP_LICENSE): AppLicense {
  if (!raw) return { ...TIER_CONFIG.free, state: 'active' };
  try {
    const parsed = JSON.parse(raw);
    const requested: LicenseTier = parsed.tier === 'pro' ? 'pro' : 'free';
    // A lapsed paid license degrades to free; it never deletes or mutates data.
    const effective = parsed.state === 'lapsed' ? TIER_CONFIG.free : TIER_CONFIG[requested];
    return { ...effective, state: parsed.state === 'lapsed' ? 'lapsed' : 'active' };
  } catch {
    return { ...TIER_CONFIG.free, state: 'active' };
  }
}

export function createLicenseGuard(license = resolveLicense()) {
  return {
    license,
    assert(feature: string) {
      if (!license.features.includes(feature)) {
        throw new LicenseError(`"${feature}" requires the Pro tier. Existing records remain available.`, 'FEATURE_NOT_LICENSED');
      }
    },
    assertWithin(limit: string, value: number) {
      const maximum = license.limits[limit];
      if (maximum !== undefined && value > maximum) {
        throw new LicenseError(`The ${license.tier} tier allows ${maximum} ${limit}; requested ${value}. Upgrade to Pro for a higher limit.`, 'LIMIT_EXCEEDED');
      }
    },
  };
}
