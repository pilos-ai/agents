import type { LicenseTier, ProFeatureFlags } from '../types'

export const FREE_LIMITS: ProFeatureFlags = {
  tier: 'free',
  maxAgents: 3,
  maxMcpServers: 3,
  maxProjects: 3,
  teamMode: false,
  teamSync: false,
  premiumAgents: false,
}

const PRO_LIMITS: ProFeatureFlags = {
  tier: 'pro',
  maxAgents: Infinity,
  maxMcpServers: Infinity,
  maxProjects: Infinity,
  teamMode: true,
  teamSync: false,
  premiumAgents: true,
}

const TEAMS_LIMITS: ProFeatureFlags = {
  tier: 'teams',
  maxAgents: Infinity,
  maxMcpServers: Infinity,
  maxProjects: Infinity,
  teamMode: true,
  teamSync: true,
  premiumAgents: true,
}

export function getFlagsForTier(tier: LicenseTier): ProFeatureFlags {
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
