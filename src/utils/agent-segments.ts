import type { AgentDefinition } from '../types'

export interface AgentSegment {
  agentName: string | null
  agentId?: string
  agentIcon?: string
  agentColor?: string
  text: string
}

/**
 * Splits assistant text into per-agent segments based on `[AgentName]` marker lines.
 * Lines that match a known agent name start a new segment attributed to that agent.
 * Text before any marker is attributed to null (no agent).
 */
export function parseAgentSegments(text: string, agents: AgentDefinition[]): AgentSegment[] {
  const agentNameSet = new Set(agents.map((a) => a.name))
  const lines = text.split('\n')
  const segments: AgentSegment[] = []
  let current: { agentName: string | null; agentId?: string; agentIcon?: string; agentColor?: string; lines: string[] } = {
    agentName: null,
    lines: [],
  }

  for (const line of lines) {
    const match = line.match(/^\[([A-Za-z_\s]+)\]\s*$/)
    if (match) {
      const name = match[1].trim()
      if (agentNameSet.has(name)) {
        // Flush current segment
        const segText = current.lines.join('\n').trim()
        if (segText) {
          segments.push({
            agentName: current.agentName,
            agentId: current.agentId,
            agentIcon: current.agentIcon,
            agentColor: current.agentColor,
            text: segText,
          })
        }
        const agent = agents.find((a) => a.name === name)
        current = {
          agentName: name,
          agentId: agent?.id,
          agentIcon: agent?.icon,
          agentColor: agent?.color,
          lines: [],
        }
        continue
      }
    }
    current.lines.push(line)
  }

  // Flush last segment
  const lastText = current.lines.join('\n').trim()
  if (lastText) {
    segments.push({
      agentName: current.agentName,
      agentId: current.agentId,
      agentIcon: current.agentIcon,
      agentColor: current.agentColor,
      text: lastText,
    })
  }

  return segments
}

/**
 * Returns the name of the last agent whose marker appears in the text, or null.
 * Used during streaming to track the currently-speaking agent.
 */
export function detectLastAgent(text: string, agents: AgentDefinition[]): string | null {
  const agentNameSet = new Set(agents.map((a) => a.name))
  const lines = text.split('\n')
  let lastAgentName: string | null = null
  for (const line of lines) {
    const m = line.match(/^\[([A-Za-z_\s]+)\]\s*$/)
    if (m && agentNameSet.has(m[1].trim())) {
      lastAgentName = m[1].trim()
    }
  }
  return lastAgentName
}
