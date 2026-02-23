import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'
import fs from 'fs'

// Load .env values (including non-VITE_ prefixed) for use in electron builds
const env = loadEnv('production', __dirname, '')

// Detect which optional packages are present (submodules may not be checked out)
const pmMcpServerPath = 'packages/pm/electron/jira-mcp-server.ts'
const hasPmPackage = fs.existsSync(path.resolve(__dirname, pmMcpServerPath))
const hasProPackage = fs.existsSync(path.resolve(__dirname, 'packages/pro/package.json'))

// Vite plugin: resolve imports of missing optional packages to empty stubs
// so the dynamic import() try/catch in src/lib/pm.ts and src/lib/pro.ts
// triggers the catch branch instead of a build error.
const optionalPackages = ['@pilos/agents-pm', '@pilos/pro']
  .filter((_, i) => ![hasPmPackage, hasProPackage][i])

function optionalPackageStubs(): import('vite').Plugin {
  return {
    name: 'optional-package-stubs',
    resolveId(id) {
      if (optionalPackages.some(pkg => id === pkg || id.startsWith(pkg + '/'))) {
        return '\0stub:' + id
      }
    },
    load(id) {
      if (id.startsWith('\0stub:')) {
        return 'throw new Error("optional package not available")'
      }
    },
  }
}

const electronEntries: Parameters<typeof electron>[0] = [
  {
    entry: 'electron/main.ts',
    vite: {
      plugins: [optionalPackageStubs()],
      define: {
        'process.env.ATLASSIAN_CLIENT_ID': JSON.stringify(env.ATLASSIAN_CLIENT_ID || ''),
        'process.env.ATLASSIAN_CLIENT_SECRET': JSON.stringify(env.ATLASSIAN_CLIENT_SECRET || ''),
      },
      resolve: {
        alias: hasPmPackage
          ? { '@pilos/agents-pm': path.resolve(__dirname, 'packages/pm') }
          : {},
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
            'electron-updater',
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

const rendererAliases: Record<string, string> = {
  '@': path.resolve(__dirname, 'src'),
}
if (hasPmPackage) rendererAliases['@pilos/agents-pm'] = path.resolve(__dirname, 'packages/pm')
if (hasProPackage) rendererAliases['@pilos/pro'] = path.resolve(__dirname, 'packages/pro')

export default defineConfig({
  plugins: [
    react(),
    electron(electronEntries),
    renderer(),
    optionalPackageStubs(),
  ],
  resolve: {
    alias: rendererAliases,
  },
  define: {
    'window.__PILOS_LICENSE_SERVER__': JSON.stringify(
      process.env.VITE_LICENSE_SERVER || ''
    ),
    '__APP_VERSION__': JSON.stringify(
      JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')).version
    ),
  },
})
