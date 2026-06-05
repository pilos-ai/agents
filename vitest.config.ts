import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import path from 'path'

// Stub optional packages that may not be checked out (same as vite.config.ts)
const optionalPackages = ['@pilos/agents-pm', '@pilos/pro', '@pilos/computer-use']

function optionalPackageStubs(): Plugin {
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

// Stub Electron APIs for handler/main-process unit tests
function electronStubs(): Plugin {
  return {
    name: 'electron-stubs',
    resolveId(id) {
      if (id === 'electron') return '\0electron-stub'
    },
    load(id) {
      if (id === '\0electron-stub') {
        return `
          export const app = { getPath: () => ':memory:', getName: () => 'Pilos Agents', setName: () => {} }
          export const ipcMain = { handle: () => {}, on: () => {} }
          export const BrowserWindow = class {}
          export const dialog = {}
          export const shell = {}
          export const Menu = { buildFromTemplate: () => ({ popup: () => {} }) }
          export const clipboard = { writeText: () => {} }
          export const Tray = class {}
          export const nativeImage = { createFromPath: () => ({}) }
        `
      }
    },
  }
}

export default defineConfig({
  plugins: [optionalPackageStubs()],
  test: {
    globals: true,
    projects: [
      {
        // Renderer / React tests
        plugins: [optionalPackageStubs()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          setupFiles: ['./src/test/setup.ts'],
        },
        resolve: {
          alias: {
            '@': path.resolve(__dirname, 'src'),
            '@pilos/repetition-detection': path.resolve(__dirname, 'packages/repetition-detection'),
          },
        },
      },
      {
        // Self-contained packages/* logic (e.g. repetition-detection). These
        // tests were previously orphaned — no project glob matched them, so
        // `npm test` never ran them. Pure logic → node environment.
        plugins: [optionalPackageStubs()],
        test: {
          name: 'packages',
          environment: 'node',
          include: ['packages/**/__tests__/**/*.test.ts', 'packages/**/*.test.ts'],
          exclude: ['**/node_modules/**'],
        },
        resolve: {
          alias: {
            '@pilos/repetition-detection': path.resolve(__dirname, 'packages/repetition-detection'),
          },
        },
      },
      {
        // Electron main-process tests (node environment, electron mocked)
        plugins: [optionalPackageStubs(), electronStubs()],
        test: {
          name: 'electron',
          environment: 'node',
          include: [
            'electron/**/*.test.ts',
          ],
          globalSetup: ['./electron/test/sqlite-setup.ts'],
        },
        resolve: {
          alias: {
            '@': path.resolve(__dirname, 'src'),
            '@pilos/repetition-detection': path.resolve(__dirname, 'packages/repetition-detection'),
          },
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
