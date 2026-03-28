import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { revertFileEdit, readDir, registerFileHandlers } from './files'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const capturedHandlers: Record<string, (...args: unknown[]) => unknown> = {}
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      capturedHandlers[channel] = handler
    },
    on: () => {},
  },
  app: { getPath: () => ':memory:', getName: () => 'Pilos', setName: () => {} },
  BrowserWindow: class {},
  dialog: {},
  shell: {},
  Menu: { buildFromTemplate: () => ({ popup: () => {} }) },
  clipboard: { writeText: () => {} },
  Tray: class {},
  nativeImage: { createFromPath: () => ({}) },
}))

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pilos-files-test-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('revertFileEdit', () => {
  it('replaces newString with oldString in file', async () => {
    const filePath = path.join(tmpDir, 'test.txt')
    await fs.writeFile(filePath, 'const x = 2')

    const result = await revertFileEdit(filePath, 'const x = 1', 'const x = 2')
    expect(result).toEqual({ success: true })

    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('const x = 1')
  })

  it('returns error when newString is not found in file', async () => {
    const filePath = path.join(tmpDir, 'test.txt')
    await fs.writeFile(filePath, 'original content')

    const result = await revertFileEdit(filePath, 'old', 'not-present')
    expect(result).toEqual({ success: false, error: expect.stringContaining('Content no longer matches') })
  })

  it('only replaces first occurrence', async () => {
    const filePath = path.join(tmpDir, 'multi.txt')
    await fs.writeFile(filePath, 'foo foo foo')

    await revertFileEdit(filePath, 'bar', 'foo')
    const content = await fs.readFile(filePath, 'utf-8')
    // String.replace only replaces first occurrence
    expect(content).toBe('bar foo foo')
  })
})

describe('readDir', () => {
  it('returns entries for a flat directory', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.txt'), '')
    await fs.writeFile(path.join(tmpDir, 'b.ts'), '')
    await fs.mkdir(path.join(tmpDir, 'sub'))

    const entries = await readDir(tmpDir)
    const names = entries.map((e) => e.name)
    expect(names).toContain('a.txt')
    expect(names).toContain('b.ts')
    expect(names).toContain('sub')
  })

  it('marks directories correctly', async () => {
    await fs.mkdir(path.join(tmpDir, 'mydir'))
    await fs.writeFile(path.join(tmpDir, 'myfile.txt'), '')

    const entries = await readDir(tmpDir)
    const dir = entries.find((e) => e.name === 'mydir')
    const file = entries.find((e) => e.name === 'myfile.txt')
    expect(dir?.isDirectory).toBe(true)
    expect(file?.isDirectory).toBe(false)
  })

  it('includes absolute paths', async () => {
    await fs.writeFile(path.join(tmpDir, 'x.txt'), '')
    const entries = await readDir(tmpDir)
    const file = entries.find((e) => e.name === 'x.txt')
    expect(file?.path).toBe(path.join(tmpDir, 'x.txt'))
  })

  it('recursively includes one level of subdirectory entries', async () => {
    const subDir = path.join(tmpDir, 'nested')
    await fs.mkdir(subDir)
    await fs.writeFile(path.join(subDir, 'deep.ts'), '')

    const entries = await readDir(tmpDir, true)
    const names = entries.map((e) => e.name)
    expect(names).toContain('nested/deep.ts')
  })

  it('non-recursive mode does not include subdirectory files', async () => {
    const subDir = path.join(tmpDir, 'nested')
    await fs.mkdir(subDir)
    await fs.writeFile(path.join(subDir, 'deep.ts'), '')

    const entries = await readDir(tmpDir, false)
    const names = entries.map((e) => e.name)
    expect(names).not.toContain('nested/deep.ts')
  })
})

describe('registerFileHandlers', () => {
  it('registers all four IPC handlers and their callbacks work', async () => {
    registerFileHandlers()

    expect(capturedHandlers['files:revertEdit']).toBeDefined()
    expect(capturedHandlers['files:readFile']).toBeDefined()
    expect(capturedHandlers['files:writeFile']).toBeDefined()
    expect(capturedHandlers['files:readDir']).toBeDefined()

    // Exercise each callback
    const filePath = path.join(tmpDir, 'ipc-test.txt')
    await fs.writeFile(filePath, 'hello world')

    // files:readFile
    const content = await capturedHandlers['files:readFile']({}, filePath)
    expect(content).toBe('hello world')

    // files:writeFile
    await capturedHandlers['files:writeFile']({}, filePath, 'updated')
    expect(await fs.readFile(filePath, 'utf-8')).toBe('updated')

    // files:revertEdit
    const revertResult = await capturedHandlers['files:revertEdit']({}, filePath, 'original', 'updated')
    expect((revertResult as { success: boolean }).success).toBe(true)

    // files:readDir
    const dirEntries = await capturedHandlers['files:readDir']({}, tmpDir)
    expect(Array.isArray(dirEntries)).toBe(true)
  })
})
