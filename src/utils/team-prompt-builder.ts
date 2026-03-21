import type { AgentDefinition } from '../types'

/**
 * Analyze a message and return agents whose expertise is relevant.
 * Used to inject per-message context hints so agents self-activate proactively.
 */
export function detectRelevantAgents(message: string, agents: AgentDefinition[]): AgentDefinition[] {
  if (agents.length === 0) return []

  const lower = message.toLowerCase()

  // Check for explicit @mentions — those agents always lead
  const mentioned = agents.filter((a) => lower.includes(`@${a.name.toLowerCase()}`))

  // Score each agent by how many of their expertise keywords appear in the message
  const scored = agents.map((a) => {
    const keywords = [
      ...a.expertise,
      a.role.toLowerCase(),
      a.name.toLowerCase(),
    ]
    const score = keywords.reduce((acc, kw) => {
      return acc + (lower.includes(kw.toLowerCase()) ? 1 : 0)
    }, 0)
    return { agent: a, score }
  })

  // Relevant = score >= 1, plus any mentioned agents
  const relevant = scored
    .filter((s) => s.score >= 1)
    .map((s) => s.agent)

  // Merge mentioned + relevant, deduplicated
  const combined = [...new Set([...mentioned, ...relevant])]
  return combined
}

/**
 * Build a per-message context hint to inject before the user's message.
 * This guides Claude on which agents should speak up for this specific turn.
 */
export function buildMessageContextHint(message: string, agents: AgentDefinition[]): string {
  const relevant = detectRelevantAgents(message, agents)

  // Don't inject if all agents are relevant (broad message) or none matched
  if (relevant.length === 0 || relevant.length === agents.length) return ''

  const names = relevant.map((a) => `@${a.name}`).join(', ')
  const others = agents.filter((a) => !relevant.includes(a)).map((a) => a.name).join(', ')

  return `[Team routing: ${names} should lead on this. ${others ? `${others} should join only if they have something direct to add.` : ''} All agents may still contribute if the topic touches their domain.]\n\n`
}

export function buildTeamSystemPrompt(agents: AgentDefinition[]): string {
  if (agents.length === 0) return ''

  const agentList = agents
    .map(
      (a) =>
        `- **${a.name}** (${a.role}): ${a.personality}\n  Expertise: ${a.expertise.join(', ')}`
    )
    .join('\n')

  const agentNames = agents.map((a) => a.name).join(', ')
  const devAgent = agents.find((a) => a.expertise.includes('implementation') || a.id === 'developer')
  const devName = devAgent?.name || agents[0].name

  // Build per-agent proactive trigger rules from their expertise
  const triggerRules = agents
    .map((a) => {
      const triggers = a.expertise.slice(0, 4).join(', ')
      return `- **${a.name}**: Jump in whenever the topic involves ${triggers}`
    })
    .join('\n')

  return `# Multi-Agent Team Mode

You are role-playing as a team of specialized agents. Each agent has a distinct personality and expertise. When responding, you MUST prefix each agent's contribution with their name marker on its own line.

## Team Members
${agentList}

## Core Principle: Proactive Participation

**Every agent must actively scan each message and contribute if ANY part of it touches their expertise — without being explicitly called.**

Do NOT wait to be @mentioned. If your domain is relevant, speak up. Silence = absence.

## Proactive Trigger Rules

Each agent monitors for topics in their domain and MUST contribute when triggered:

${triggerRules}

If a message spans multiple domains (e.g. "implement a secure API with good UX"), ALL relevant agents contribute.

## Response Format Rules

1. **ALWAYS** start each agent's section with the marker \`[AgentName]\` on its own line, followed by their contribution.
2. **Every agent whose expertise is relevant MUST speak.** Do not artificially limit to 2-4 if more agents have something meaningful to add.
3. For simple/narrow questions, 1-2 agents is fine. For broad tasks, all relevant agents should contribute.
4. Stay in character. Each agent adds unique value — never repeat what another agent already said.
5. **${devName}** handles all tool use (file edits, bash commands, code writing). Other agents discuss and advise but don't use tools directly.
6. Agents build on and reference each other's contributions to create a cohesive team response.

## Agent Activation Examples

- "Fix this bug" → ${devName} leads; QA adds test cases; Architect flags root cause patterns
- "Design the checkout flow" → Designer leads; ${devName} notes implementation constraints; PM checks scope
- "Should we use Redis?" → Architect leads; ${devName} covers integration; PM flags delivery risk
- "Why is this slow?" → ${devName} profiles; Architect suggests structural fix; PM scopes the fix
- Direct @mention like "@${agents[0].name} what do you think?" → That agent leads, others join if relevant

## Example Response Format

[Architect]
Let me outline the approach for this feature...

[${devName}]
I'll implement that. Let me start with the data model...

[QA]
A few edge cases to consider before we ship...

Remember: Use the exact agent names listed above (${agentNames}). Each marker must be on its own line in the format \`[Name]\`. Be proactive — if your expertise applies, speak.`
}
