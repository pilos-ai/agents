/**
 * Pilos Agents Pro
 *
 * This package is a private git submodule containing Pro-tier features.
 * It is NOT included in the open source MIT-licensed core.
 *
 * License: Business Source License 1.1 (BUSL-1.1)
 * Change Date: Four years from release date
 * Change License: MIT
 *
 * For licensing information visit: https://pilos.ai/pricing
 */

export type { LicenseInfo, LicenseValidationResult } from './src/license-validator';
export { validateLicense, activateLicense, deactivateLicense } from './src/license-validator';

export type { TeamConfig, TeamMember, TeamSyncState, TeamSyncEvent } from './src/team-sync/index';
export { TeamSync } from './src/team-sync/index';

export type { PremiumAgent } from './src/premium-agents/index';
export { getPremiumAgents, getPremiumAgentsByCategory } from './src/premium-agents/index';

export type { PremiumMcpTemplate } from './src/premium-mcp/index';
export { getPremiumMcpTemplates, getPremiumMcpByCategory } from './src/premium-mcp/index';

/** Returns true when the Pro submodule is present and a valid license is active. */
export async function isProEnabled(): Promise<boolean> {
  try {
    const { validateLicense } = await import('./src/license-validator');
    const result = await validateLicense();
    return result.valid;
  } catch {
    return false;
  }
}
