import type { LicenseTier, ProFeatureFlags } from '../types'
import { isMonetizationEnabled } from './monetization'

export const FREE_LIMITS: ProFeatureFlags = {
  tier: 'free',
  maxAgents: 3,
  maxMcpServers: 3,
  maxProjects: 3,
  teamMode: false,
  teamSync: false,
  premiumAgents: false,
  enabledFeatures: [],
}

const PRO_LIMITS: ProFeatureFlags = {
  tier: 'pro',
  maxAgents: Infinity,
  maxMcpServers: Infinity,
  maxProjects: Infinity,
  teamMode: true,
  teamSync: false,
  premiumAgents: true,
  enabledFeatures: [],
}

const TEAMS_LIMITS: ProFeatureFlags = {
  tier: 'teams',
  maxAgents: Infinity,
  maxMcpServers: Infinity,
  maxProjects: Infinity,
  teamMode: true,
  teamSync: true,
  premiumAgents: true,
  enabledFeatures: [],
}

/**
 * Everything unlocked, regardless of tier — what every user gets while Pilos is
 * free. `tier` is left as the user's real tier so account UI can still say
 * "Free" honestly; it just no longer restricts anything.
 */
const UNRESTRICTED_LIMITS: Omit<ProFeatureFlags, 'tier'> = {
  maxAgents: Infinity,
  maxMcpServers: Infinity,
  maxProjects: Infinity,
  teamMode: true,
  teamSync: true,
  premiumAgents: true,
  enabledFeatures: [],
}

export function getFlagsForTier(tier: LicenseTier): ProFeatureFlags {
  // Free product: the tier table below is bypassed entirely. This single branch
  // is what lifts the project/agent/MCP caps and unlocks team mode, premium
  // agents and team sync for everyone. See src/lib/monetization.ts.
  if (!isMonetizationEnabled()) return { ...UNRESTRICTED_LIMITS, tier }

  switch (tier) {
    case 'teams': return { ...TEAMS_LIMITS }
    case 'pro': return { ...PRO_LIMITS }
    default: return { ...FREE_LIMITS }
  }
}

export async function loadProModule(): Promise<typeof import('@pilos/pro') | null> {
  try {
    const mod = await import('@pilos/pro')
    return mod
  } catch {
    return null
  }
}
