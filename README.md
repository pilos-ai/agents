<p align="center">
  <img src="resources/icon.svg" width="80" height="80" alt="Pilos Agents" />
</p>

<h1 align="center">Pilos Agents</h1>

<p align="center">
  <strong>The visual desktop app for Claude Code — multi-agent teams, MCP integrations, and project tabs in one native UI.</strong>
</p>

<p align="center">
  <a href="https://github.com/pilos-ai/agents/releases"><img src="https://img.shields.io/github/v/release/pilos-ai/agents" alt="Release" /></a>
  <a href="https://github.com/pilos-ai/agents/blob/main/LICENSE"><img src="https://img.shields.io/github/license/pilos-ai/agents" alt="License" /></a>
  <a href="https://github.com/pilos-ai/agents/stargazers"><img src="https://img.shields.io/github/stars/pilos-ai/agents" alt="Stars" /></a>
  <a href="https://pilos.net"><img src="https://img.shields.io/badge/website-pilos.net-blue" alt="Website" /></a>
  <a href="https://discord.gg/pilos"><img src="https://img.shields.io/badge/discord-join-5865F2?logo=discord&logoColor=white" alt="Discord" /></a>
  <a href="https://x.com/pilosdotnet"><img src="https://img.shields.io/badge/follow-@pilosdotnet-black?logo=x" alt="Twitter" /></a>
  <a href="https://dev.to/pilosdotnet"><img src="https://img.shields.io/badge/dev.to-pilosdotnet-0A0A0A?logo=devdotto" alt="Dev.to" /></a>
</p>

<p align="center"><img src="resources/demo.gif" width="800" alt="Pilos Agents demo" /></p>

---

## Why Pilos?

Claude Code is powerful, but it lives in the terminal. Pilos gives it a native desktop home:

- **See all your projects at once** — multi-tab interface, switch between projects without losing context
- **Multi-agent collaboration** — PM, Architect, Developer, Designer, and Product agents work together on your tasks
- **One-click MCP tools** — connect GitHub, Jira, Supabase, Sentry, browser automation, and more without editing JSON configs
- **Everything persists** — conversations, project memory, and agent context survive restarts

No lock-in. Your Claude Code CLI does all the AI work. Pilos is the visual layer on top.

## Download

<table>
  <tr>
    <td align="center"><b>macOS</b></td>
    <td align="center"><b>Windows</b></td>
    <td align="center"><b>Linux</b></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/pilos-ai/agents/releases/latest">Download .dmg</a></td>
    <td align="center"><a href="https://github.com/pilos-ai/agents/releases/latest">Download .exe</a></td>
    <td align="center"><a href="https://github.com/pilos-ai/agents/releases/latest">Download .AppImage</a></td>
  </tr>
</table>

> **Prerequisite:** [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) — `npm i -g @anthropic-ai/claude-code`

## Features

### Free (MIT)

- **Multi-Agent Teams** — 5 built-in roles (PM, Architect, Developer, Designer, Product) that collaborate on tasks with distinct perspectives
- **Multi-Project Tabs** — Work on multiple projects simultaneously, each with isolated conversations and context
- **Integrated Terminal** — Full terminal emulator (xterm.js) embedded alongside agent output
- **MCP Integrations** — Built-in servers for GitHub, Supabase, and Filesystem — one-click setup, no JSON editing
- **Persistent Memory** — SQLite-backed project memory that carries across sessions and restarts
- **Permission Modes** — Auto-approve, ask-before-running, or read-only — you control what agents can do
- **Native Context Menu** — Spell check, Look Up, and standard macOS/Windows edit actions
- **Auto Updates** — Automatic update checks with in-app install

### Pro

- **Browser MCP** — Let Claude see and interact with your browser via a Chrome extension
- **Computer Use** — macOS screen automation (screenshot, click, type) for visual tasks
- **Jira Integration** — Read and update Jira issues directly from the agent conversation
- **Sentry Integration** — Query errors, issues, and AI-powered root cause analysis
- **Premium MCP Templates** — One-click setup for Notion, Linear, Slack, and more

See [pilos.net/pricing](https://pilos.net/pricing) for plans.

## Build from Source

```bash
git clone https://github.com/pilos-ai/agents.git
cd agents
npm install
npm run dev
```

**Requirements:** Node.js 18+, Claude Code CLI authenticated

```bash
npm run build          # Production build
npm run dist:mac       # Package for macOS (.dmg)
npm run dist:win       # Package for Windows (.exe)
npm run dist:linux     # Package for Linux (.AppImage)
```

## Tech Stack

| Electron | React 19 | TypeScript | Vite | Zustand | Tailwind CSS | xterm.js | better-sqlite3 |
|----------|----------|------------|------|---------|--------------|----------|-----------------|

## Project Structure

```
electron/           Electron main process
  core/             Claude process management, database, terminal
  services/         Settings store, MCP config, CLI detection
src/                React renderer
  components/       UI components
  store/            Zustand state management
  hooks/            Custom React hooks
packages/           Optional feature packages (PM, Pro)
resources/          App icons and assets
```

## Contributing

Contributions are welcome.

1. Fork the repo
2. Create a feature branch (`git checkout -b my-feature`)
3. Commit your changes
4. Open a Pull Request

See [open issues](https://github.com/pilos-ai/agents/issues) for ideas on where to start.

## Community

- [Website](https://pilos.net) — Download, docs, and pricing
- [GitHub Issues](https://github.com/pilos-ai/agents/issues) — Bug reports and feature requests
- [Discord](https://discord.gg/pilos) — Chat with the team
- [X / Twitter](https://x.com/pilosdotnet) — Updates and announcements

## License

MIT — see [LICENSE](LICENSE) for details. Pro extensions are [BUSL-1.1](https://github.com/pilos-ai/agents/blob/main/packages/pro/LICENSE).
