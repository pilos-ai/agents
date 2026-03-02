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

export default defineConfig({
  plugins: [optionalPackageStubs()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
