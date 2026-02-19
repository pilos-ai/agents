import fs from 'fs'
import path from 'path'
import { app } from 'electron'

interface Settings {
  model: string
  workingDirectory: string
  terminalFontSize: number
  rightPanelWidth: number
  sidebarWidth: number
  [key: string]: unknown
}

const DEFAULTS: Settings = {
  model: 'sonnet',
  workingDirectory: '',
  terminalFontSize: 13,
  rightPanelWidth: 350,
  sidebarWidth: 220,
}

export class SettingsStore {
  private filePath: string
  private data: Settings

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'settings.json')
    this.data = this.load()
  }

  private load(): Settings {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      return { ...DEFAULTS, ...JSON.parse(raw) }
    } catch {
      return { ...DEFAULTS }
    }
  }

  private save(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2))
  }

  get(key: string): unknown {
    return this.data[key] ?? DEFAULTS[key] ?? null
  }

  set(key: string, value: unknown): void {
    this.data[key] = value
    this.save()
  }

  getAll(): Settings {
    return { ...this.data }
  }
}
