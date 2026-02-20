/**
 * License validation for Pilos Agents Pro.
 * Validates license keys against the Pilos licensing server.
 *
 * BUSL-1.1 — see packages/pro/LICENSE
 */

export interface LicenseInfo {
  key: string;
  email: string;
  plan: 'pro' | 'teams';
  seats?: number;
  expiresAt: string | null; // ISO date string, null = perpetual
}

export interface LicenseValidationResult {
  valid: boolean;
  license?: LicenseInfo;
  error?: string;
}

const LICENSE_SERVER = (typeof window !== 'undefined' && (window as any).__PILOS_LICENSE_SERVER__)
  || 'https://api.pilos.ai/v1/licenses';
const STORAGE_KEY = 'pilos_license_key';

/** Validate the stored license key against the licensing server. */
export async function validateLicense(): Promise<LicenseValidationResult> {
  const key = getLicenseKey();
  if (!key) {
    return { valid: false, error: 'No license key found' };
  }

  try {
    const res = await fetch(`${LICENSE_SERVER}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });

    if (!res.ok) {
      return { valid: false, error: `Server error: ${res.status}` };
    }

    const data = await res.json();
    return data as LicenseValidationResult;
  } catch (err) {
    // Offline fallback: trust local cache for up to 7 days
    return validateOffline(key);
  }
}

/** Activate a new license key and persist it locally. */
export async function activateLicense(key: string): Promise<LicenseValidationResult> {
  const res = await fetch(`${LICENSE_SERVER}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });

  const data = await res.json() as LicenseValidationResult;

  if (data.valid) {
    setLicenseKey(key);
    setLicenseCache(data);
  }

  return data;
}

/** Deactivate and remove the current license from this machine. */
export async function deactivateLicense(): Promise<void> {
  const key = getLicenseKey();
  if (key) {
    await fetch(`${LICENSE_SERVER}/deactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    }).catch(() => {});
  }
  clearLicense();
}

// ---------------------------------------------------------------------------
// Storage helpers (Electron uses localStorage via the renderer process)
// ---------------------------------------------------------------------------

function getLicenseKey(): string | null {
  return typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
}

function setLicenseKey(key: string): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, key);
}

function setLicenseCache(result: LicenseValidationResult): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('pilos_license_cache', JSON.stringify({ result, cachedAt: Date.now() }));
  }
}

function clearLicense(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('pilos_license_cache');
  }
}

function validateOffline(key: string): LicenseValidationResult {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('pilos_license_cache') : null;
    if (!raw) return { valid: false, error: 'No offline cache' };

    const { result, cachedAt } = JSON.parse(raw) as { result: LicenseValidationResult; cachedAt: number };
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    if (Date.now() - cachedAt < sevenDays && result.license?.key === key) {
      return result;
    }
    return { valid: false, error: 'Offline grace period expired' };
  } catch {
    return { valid: false, error: 'Cache read error' };
  }
}
