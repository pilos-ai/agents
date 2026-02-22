import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'
import fs from 'fs'

// Conditionally include PM MCP server entry if the package exists
const pmMcpServerPath = 'packages/pm/electron/jira-mcp-server.ts'
const hasPmPackage = fs.existsSync(path.resolve(__dirname, pmMcpServerPath))

const electronEntries: Parameters<typeof electron>[0] = [
  {
    entry: 'electron/main.ts',
    vite: {
      resolve: {
        alias: {
          '@pilos/agents-pm': path.resolve(__dirname, 'packages/pm'),
        },
      },
      build: {
        outDir: 'dist-electron',
        minify: false,
        rollupOptions: {
          external: [
            'electron',
            'better-sqlite3',
            'node-pty',
            'path',
            'fs',
            'os',
            'net',
            'http',
            'child_process',
            'crypto',
            'url',
            '@pilos/agents-pm/electron',
          ],
        },
      },
    },
  },
  {
    entry: 'electron/preload.ts',
    onstart(args) {
      args.reload()
    },
    vite: {
      build: {
        outDir: 'dist-electron',
        rollupOptions: {
          external: ['electron'],
        },
      },
    },
  },
]

if (hasPmPackage) {
  electronEntries.push({
    entry: pmMcpServerPath,
    vite: {
      build: {
        outDir: 'dist-electron',
        minify: false,
        rollupOptions: {
          external: ['fs', 'path', 'http', 'crypto', 'url'],
        },
      },
    },
  })
}

export default defineConfig({
  plugins: [
    react(),
    electron(electronEntries),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@pilos/pro': path.resolve(__dirname, 'packages/pro'),
      '@pilos/agents-pm': path.resolve(__dirname, 'packages/pm'),
    },
  },
  define: {
    'window.__PILOS_LICENSE_SERVER__': JSON.stringify(
      process.env.VITE_LICENSE_SERVER || ''
    ),
  },
})
