/**
 * Premium MCP Server Templates — Pro/Teams tier feature.
 * Specialized MCP servers that pair with premium agent workflows.
 *
 * BUSL-1.1 — see packages/pro/LICENSE
 */

export interface PremiumMcpTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: string;
  config: {
    type: 'stdio' | 'http' | 'sse';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
  };
  requiredEnvVars: string[];
  setupSteps: string[];
  docsUrl?: string;
}

export const PREMIUM_MCP_TEMPLATES: PremiumMcpTemplate[] = [
  // ── Performance & Profiling ──
  {
    id: 'pro-profiler',
    name: 'Profiler',
    icon: '⚡',
    description: 'CPU/memory profiling, flame graphs, and benchmark analysis',
    category: 'Performance',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/profiler-mcp-server'],
      env: {},
    },
    requiredEnvVars: [],
    setupSteps: [
      'No configuration needed — works out of the box',
      'Supports Node.js, Python, and Go profiling',
    ],
  },

  // ── API & Schema ──
  {
    id: 'pro-openapi',
    name: 'OpenAPI',
    icon: '🔌',
    description: 'Generate, validate, and lint OpenAPI specs',
    category: 'API',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/openapi-mcp-server'],
      env: {},
    },
    requiredEnvVars: [],
    setupSteps: [
      'No configuration needed — works out of the box',
      'Place your OpenAPI spec files in the project root or provide paths as args',
    ],
  },

  // ── Database ──
  {
    id: 'pro-database',
    name: 'Database Tools',
    icon: '🗄️',
    description: 'Query analysis, migration generation, and schema visualization',
    category: 'Database',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/database-mcp-server'],
      env: { DATABASE_URL: '' },
    },
    requiredEnvVars: ['DATABASE_URL'],
    setupSteps: [
      'Set DATABASE_URL to your database connection string',
      'Supports PostgreSQL, MySQL, and SQLite',
      'Example: postgresql://user:pass@localhost:5432/mydb',
    ],
  },

  // ── Analytics & Growth ──
  {
    id: 'pro-analytics',
    name: 'Analytics',
    icon: '📈',
    description: 'Query analytics data, funnels, and A/B test results',
    category: 'Analytics',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/analytics-mcp-server'],
      env: { ANALYTICS_API_KEY: '' },
    },
    requiredEnvVars: ['ANALYTICS_API_KEY'],
    setupSteps: [
      'Set ANALYTICS_API_KEY to your analytics platform API key',
      'Supports Mixpanel, Amplitude, and PostHog',
    ],
  },

  // ── Accessibility ──
  {
    id: 'pro-a11y',
    name: 'Accessibility Checker',
    icon: '♿',
    description: 'WCAG audit, ARIA validation, and screen reader testing',
    category: 'Quality',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/a11y-mcp-server'],
      env: {},
    },
    requiredEnvVars: [],
    setupSteps: [
      'No configuration needed — works out of the box',
      'Uses axe-core engine for automated WCAG 2.2 testing',
    ],
  },

  // ── Design System ──
  {
    id: 'pro-storybook',
    name: 'Storybook',
    icon: '🧩',
    description: 'Browse components, stories, and design tokens',
    category: 'Design',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/storybook-mcp-server'],
      env: { STORYBOOK_URL: 'http://localhost:6006' },
    },
    requiredEnvVars: [],
    setupSteps: [
      'Start your Storybook dev server: npx storybook dev',
      'Default URL is http://localhost:6006 — change STORYBOOK_URL if different',
    ],
  },

  // ── Infrastructure ──
  {
    id: 'pro-k8s',
    name: 'Kubernetes',
    icon: '☸️',
    description: 'Cluster management, pod inspection, and Helm operations',
    category: 'Infrastructure',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/kubernetes-mcp-server'],
      env: {},
    },
    requiredEnvVars: [],
    setupSteps: [
      'Requires kubectl configured with cluster access',
      'Uses your default kubeconfig (~/.kube/config)',
      'Supports read operations and safe Helm commands',
    ],
  },
  {
    id: 'pro-terraform',
    name: 'Terraform',
    icon: '🏗️',
    description: 'Plan, validate, and inspect infrastructure-as-code',
    category: 'Infrastructure',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/terraform-mcp-server'],
      env: {},
    },
    requiredEnvVars: [],
    setupSteps: [
      'Requires Terraform CLI installed',
      'Point to your Terraform project directory',
      'Supports plan, validate, and state inspection (read-only)',
    ],
  },

  // ── Monitoring ──
  {
    id: 'pro-monitoring',
    name: 'Monitoring',
    icon: '🔔',
    description: 'Query metrics, logs, and traces from observability platforms',
    category: 'Infrastructure',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/monitoring-mcp-server'],
      env: { GRAFANA_URL: '', GRAFANA_API_KEY: '' },
    },
    requiredEnvVars: ['GRAFANA_URL', 'GRAFANA_API_KEY'],
    setupSteps: [
      'Set GRAFANA_URL to your Grafana instance (e.g. https://grafana.yourcompany.com)',
      'Go to Grafana > Administration > API keys > Add API key',
      'Set role to Viewer, copy the key as GRAFANA_API_KEY',
    ],
  },

  // ── Security ──
  {
    id: 'pro-security-scan',
    name: 'Security Scanner',
    icon: '🛡️',
    description: 'SAST analysis, dependency audit, and secret detection',
    category: 'Security',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/security-mcp-server'],
      env: {},
    },
    requiredEnvVars: [],
    setupSteps: [
      'No configuration needed — works out of the box',
      'Runs Semgrep, npm audit, and secret scanning on your codebase',
    ],
  },

  // ── Data ──
  {
    id: 'pro-data-pipeline',
    name: 'Data Pipeline',
    icon: '🔧',
    description: 'ETL inspection, data quality checks, and schema validation',
    category: 'Data',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/data-pipeline-mcp-server'],
      env: {},
    },
    requiredEnvVars: [],
    setupSteps: [
      'No configuration needed — works out of the box',
      'Supports dbt, Airflow DAG inspection, and data quality checks',
    ],
  },

  // ── Spreadsheets / Finance ──
  {
    id: 'pro-sheets',
    name: 'Google Sheets',
    icon: '📊',
    description: 'Read and write spreadsheets for financial data and reports',
    category: 'Productivity',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/sheets-mcp-server'],
      env: { GOOGLE_SHEETS_CREDENTIALS: '' },
    },
    requiredEnvVars: ['GOOGLE_SHEETS_CREDENTIALS'],
    setupSteps: [
      'Go to console.cloud.google.com and enable the Google Sheets API',
      'Create OAuth 2.0 or Service Account credentials',
      'Download JSON credentials and paste as GOOGLE_SHEETS_CREDENTIALS',
    ],
  },

  // ── i18n ──
  {
    id: 'pro-i18n',
    name: 'i18n Manager',
    icon: '🌍',
    description: 'Translation extraction, locale management, and ICU validation',
    category: 'Quality',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/i18n-mcp-server'],
      env: {},
    },
    requiredEnvVars: [],
    setupSteps: [
      'No configuration needed — works out of the box',
      'Detects i18n framework (react-intl, next-intl, vue-i18n) automatically',
    ],
  },
];

/** Get all premium MCP templates. */
export function getPremiumMcpTemplates(): PremiumMcpTemplate[] {
  return PREMIUM_MCP_TEMPLATES;
}

/** Get premium MCP templates grouped by category. */
export function getPremiumMcpByCategory(): Record<string, PremiumMcpTemplate[]> {
  const grouped: Record<string, PremiumMcpTemplate[]> = {};
  for (const t of PREMIUM_MCP_TEMPLATES) {
    if (!grouped[t.category]) grouped[t.category] = [];
    grouped[t.category].push(t);
  }
  return grouped;
}
