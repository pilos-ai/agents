/**
 * Curated Claude Code plugin catalog — hand-picked from the official marketplace.
 *
 * Plugins install via: `claude plugin install <name>@<marketplace> --scope project`
 *
 * Keep descriptions short (shown in the settings UI). `rationale` is shown when
 * the plugin is recommended so the user can decide whether to install.
 */

export type PluginCategory =
  | 'quality'
  | 'git'
  | 'lsp'
  | 'framework'
  | 'cloud'
  | 'productivity'
  | 'mcp'

export interface PluginDetectRule {
  /** Any of these files/globs existing in project root triggers the plugin. */
  anyFile?: string[]
  /** A JSON file + dot-path that must exist (e.g. package.json dependencies.react). */
  manifestKey?: { file: string; jsonPath: string }
  /** Any file with one of these extensions in the repo triggers the plugin. */
  fileExtensions?: string[]
}

export interface PluginRecommendation {
  id: string
  marketplace: string
  name: string
  description: string
  category: PluginCategory
  rationale: string
  /** Always recommended regardless of project contents. */
  baseline?: boolean
  /** Detection rule — if omitted and not baseline, plugin is opt-in only. */
  detect?: PluginDetectRule
}

const OFFICIAL = 'anthropics/claude-plugins-official'

export const RECOMMENDED_PLUGINS: PluginRecommendation[] = [
  // ── Baseline: quality of life for any project ─────────────────────────────
  {
    id: 'code-review',
    marketplace: OFFICIAL,
    name: 'code-review',
    description: 'Structured code-review slash commands and subagents.',
    category: 'quality',
    baseline: true,
    rationale: 'Adds /review commands that catch issues before PR review.',
  },
  {
    id: 'commit-commands',
    marketplace: OFFICIAL,
    name: 'commit-commands',
    description: 'Opinionated /commit helpers that write good messages.',
    category: 'git',
    baseline: true,
    rationale: 'Speeds up commits with well-formatted conventional messages.',
  },
  {
    id: 'code-simplifier',
    marketplace: OFFICIAL,
    name: 'code-simplifier',
    description: 'Refactors verbose code into clearer forms.',
    category: 'quality',
    baseline: true,
    rationale: 'On-demand cleanup for complex functions.',
  },
  {
    id: 'claude-md-management',
    marketplace: OFFICIAL,
    name: 'claude-md-management',
    description: 'Keeps CLAUDE.md files in sync with the repo.',
    category: 'productivity',
    baseline: true,
    rationale: 'Maintains project memory as the codebase evolves.',
  },
  {
    id: 'feature-dev',
    marketplace: OFFICIAL,
    name: 'feature-dev',
    description: 'End-to-end feature scaffolding workflow.',
    category: 'productivity',
    baseline: true,
    rationale: 'Breaks feature work into plan → implement → test steps.',
  },

  // ── Git hosting ───────────────────────────────────────────────────────────
  {
    id: 'github',
    marketplace: OFFICIAL,
    name: 'github',
    description: 'GitHub PR/issue workflows via gh CLI.',
    category: 'git',
    rationale: 'Repo is git-tracked; adds /pr and /issue helpers.',
    detect: { anyFile: ['.git'] },
  },

  // ── Language servers ──────────────────────────────────────────────────────
  {
    id: 'gopls-lsp',
    marketplace: OFFICIAL,
    name: 'gopls-lsp',
    description: 'Go language server integration.',
    category: 'lsp',
    rationale: 'Go project detected (go.mod present).',
    detect: { anyFile: ['go.mod'] },
  },
  {
    id: 'clangd-lsp',
    marketplace: OFFICIAL,
    name: 'clangd-lsp',
    description: 'C/C++ language server integration.',
    category: 'lsp',
    rationale: 'C/C++ sources detected.',
    detect: { fileExtensions: ['.c', '.cc', '.cpp', '.h', '.hpp'] },
  },
  {
    id: 'csharp-lsp',
    marketplace: OFFICIAL,
    name: 'csharp-lsp',
    description: 'C# language server integration.',
    category: 'lsp',
    rationale: 'C# project detected.',
    detect: { fileExtensions: ['.cs', '.csproj', '.sln'] },
  },
  {
    id: 'jdtls-lsp',
    marketplace: OFFICIAL,
    name: 'jdtls-lsp',
    description: 'Java language server integration.',
    category: 'lsp',
    rationale: 'Java project detected (pom.xml/build.gradle).',
    detect: { anyFile: ['pom.xml', 'build.gradle', 'build.gradle.kts'] },
  },
  {
    id: 'kotlin-lsp',
    marketplace: OFFICIAL,
    name: 'kotlin-lsp',
    description: 'Kotlin language server integration.',
    category: 'lsp',
    rationale: 'Kotlin sources detected.',
    detect: { fileExtensions: ['.kt', '.kts'] },
  },
  {
    id: 'lua-lsp',
    marketplace: OFFICIAL,
    name: 'lua-lsp',
    description: 'Lua language server integration.',
    category: 'lsp',
    rationale: 'Lua sources detected.',
    detect: { fileExtensions: ['.lua'] },
  },
  {
    id: 'elixir-ls-lsp',
    marketplace: OFFICIAL,
    name: 'elixir-ls-lsp',
    description: 'Elixir language server integration.',
    category: 'lsp',
    rationale: 'Elixir project detected (mix.exs).',
    detect: { anyFile: ['mix.exs'] },
  },

  // ── Framework awareness ───────────────────────────────────────────────────
  {
    id: 'frontend-design',
    marketplace: OFFICIAL,
    name: 'frontend-design',
    description: 'Design-system-aware frontend workflows.',
    category: 'framework',
    rationale: 'React/Next.js detected — helps with component patterns.',
    detect: {
      manifestKey: { file: 'package.json', jsonPath: 'dependencies.react' },
    },
  },
  {
    id: 'expo',
    marketplace: OFFICIAL,
    name: 'expo',
    description: 'Expo/React Native build and EAS helpers.',
    category: 'framework',
    rationale: 'Expo project detected (app.json or expo dep).',
    detect: {
      anyFile: ['app.json', 'app.config.js', 'app.config.ts', 'eas.json'],
    },
  },
  {
    id: 'laravel-boost',
    marketplace: OFFICIAL,
    name: 'laravel-boost',
    description: 'Laravel/PHP workflow helpers.',
    category: 'framework',
    rationale: 'Laravel project detected (artisan file).',
    detect: { anyFile: ['artisan'] },
  },

  // ── Cloud / deployment ────────────────────────────────────────────────────
  {
    id: 'firebase',
    marketplace: OFFICIAL,
    name: 'firebase',
    description: 'Firebase CLI workflows.',
    category: 'cloud',
    rationale: 'Firebase config detected.',
    detect: { anyFile: ['firebase.json', '.firebaserc'] },
  },
  {
    id: 'cloudflare',
    marketplace: OFFICIAL,
    name: 'cloudflare',
    description: 'Cloudflare Workers/Pages helpers.',
    category: 'cloud',
    rationale: 'Wrangler config detected.',
    detect: { anyFile: ['wrangler.toml', 'wrangler.json', 'wrangler.jsonc'] },
  },
  {
    id: 'aws-amplify',
    marketplace: OFFICIAL,
    name: 'aws-amplify',
    description: 'AWS Amplify workflows.',
    category: 'cloud',
    rationale: 'Amplify project detected.',
    detect: { anyFile: ['amplify/'] },
  },
  {
    id: 'netlify-skills',
    marketplace: OFFICIAL,
    name: 'netlify-skills',
    description: 'Netlify deploy helpers.',
    category: 'cloud',
    rationale: 'Netlify config detected.',
    detect: { anyFile: ['netlify.toml'] },
  },

  // ── MCP authoring ─────────────────────────────────────────────────────────
  {
    id: 'mcp-server-dev',
    marketplace: OFFICIAL,
    name: 'mcp-server-dev',
    description: 'Scaffolding and debugging for MCP servers.',
    category: 'mcp',
    rationale: 'You author MCP servers for Pilos — makes that flow faster.',
    detect: {
      manifestKey: { file: 'package.json', jsonPath: 'dependencies.@modelcontextprotocol/sdk' },
    },
  },
]

export function getPluginById(id: string): PluginRecommendation | undefined {
  return RECOMMENDED_PLUGINS.find((p) => p.id === id)
}
