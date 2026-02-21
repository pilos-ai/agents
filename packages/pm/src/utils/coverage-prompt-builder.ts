import type { Story, StoryCriterion } from '../types'

/**
 * Builds a system prompt for Claude to analyze code coverage against acceptance criteria.
 */
export function buildCoveragePrompt(story: Story, criteria: StoryCriterion[]): string {
  const criteriaList = criteria
    .map((c, i) => `${i + 1}. ${c.description}`)
    .join('\n')

  return `You are a code coverage analyzer. Your job is to determine whether each acceptance criterion for a user story has been implemented in the codebase.

## User Story
**Title**: ${story.title}
**Description**: ${story.description}

## Acceptance Criteria
${criteriaList}

## Instructions
For each acceptance criterion, search the codebase to determine if it has been implemented. Look for:
- Relevant components, functions, or modules
- Tests that verify the behavior
- API endpoints or data handling

For each criterion, output a structured block like this:

\`\`\`coverage
criterion: <number>
covered: <true|false>
files: <comma-separated list of relevant file paths>
explanation: <brief explanation of why you believe it is or isn't covered>
\`\`\`

Output one block per criterion. Be thorough but concise. Only mark a criterion as covered if you find clear evidence of implementation.`
}
