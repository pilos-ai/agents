<p align="center">
  <img src="resources/icon.svg" width="80" height="80" alt="Pilos Agents" />
</p>

<h1 align="center">Pilos Agents</h1>

<p align="center">
  A desktop app for working with AI agents — built on Claude Code.
</p>

<p align="center">
  <a href="https://github.com/pilos-ai/agents/blob/main/LICENSE"><img src="https://img.shields.io/github/license/pilos-ai/agents" alt="License" /></a>
  <a href="https://github.com/pilos-ai/agents/releases"><img src="https://img.shields.io/github/v/release/pilos-ai/agents" alt="Release" /></a>
  <a href="https://github.com/pilos-ai/agents/stargazers"><img src="https://img.shields.io/github/stars/pilos-ai/agents" alt="Stars" /></a>
</p>

<!-- screenshot -->

## What is Pilos Agents

Pilos Agents is an Electron-based desktop application that gives you a visual interface on top of [Claude Code](https://docs.anthropic.com/en/docs/claude-code). It supports multi-agent teams, integrated terminals, MCP tool integrations, and persistent project memory — all in a native app for macOS and Windows.

## Features

- **🤖 Multi-Agent Team Mode** — 5 built-in agent roles (PM, Architect, Developer, Designer, Product) that collaborate on tasks
- **💻 Integrated Terminal** — Full terminal emulator powered by xterm.js, embedded alongside agent output
- **🔌 MCP Integrations** — 3 free built-in servers: GitHub, Supabase, and Filesystem
- **🧠 Persistent Project Memory** — SQLite-backed memory with multi-project tabs so context carries across sessions
- **🔒 Permission Modes** — Auto-approve, ask-before-running, or read-only — control what agents can do

## Quick Start

### Download

Grab the latest release from the [Releases page](https://github.com/pilos-ai/agents/releases).

### Build from Source

**Prerequisites:**
- [Node.js](https://nodejs.org/) 18+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) — `npm i -g @anthropic-ai/claude-code`
- An [Anthropic API key](https://console.anthropic.com/)

```bash
git clone https://github.com/pilos-ai/agents.git
cd agents
npm install
npm run dev
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

## Building

```bash
npm run dev          # Start dev server with hot reload
npm run build        # Production build
npm run dist:mac     # Package for macOS (.dmg)
npm run dist:win     # Package for Windows (.exe)
npm run dist:linux   # Package for Linux (.AppImage)
```

## Pro Features

Pilos Agents follows an open-core model. The core app is free and MIT-licensed. Pro features (browser automation, computer use, Jira integration) are available with a license — see [pilos.net/pricing](https://pilos.net/pricing).

## Contributing

Contributions are welcome.

1. Fork the repo
2. Create a feature branch (`git checkout -b my-feature`)
3. Commit your changes
4. Open a Pull Request

See [open issues](https://github.com/pilos-ai/agents/issues) for ideas on where to start.

## Community

- [GitHub Issues](https://github.com/pilos-ai/agents/issues) — Bug reports and feature requests
- [Discord](https://discord.gg/pilos) — Chat with the team
- [X / Twitter](https://x.com/pilosdotnet) — Updates and announcements

## License

MIT — see [LICENSE](LICENSE) for details.
