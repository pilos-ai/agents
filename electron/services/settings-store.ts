import fs from 'fs'
import path from 'path'
import { app } from 'electron'

interface Project {
  path: string
  name: string
  lastOpened: string
}

interface ProjectSettings {
  model: string
  permissionMode: string
  mode: 'solo' | 'team'
  agents: Array<{
    id: string
    name: string
    emoji: string
    color: string
    role: string
    personality: string
    expertise: string[]
  }>
}

interface Settings {
  terminalFontSize: number
  rightPanelWidth: number
  sidebarWidth: number
  recentProjects: Project[]
  projects: Record<string, ProjectSettings>
  [key: string]: unknown
}

const DEFAULTS: Settings = {
  terminalFontSize: 13,
  rightPanelWidth: 350,
  sidebarWidth: 220,
  recentProjects: [],
  projects: {},
}

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  model: 'sonnet',
  permissionMode: 'bypass',
  mode: 'solo',
  agents: [],
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

  // ── Recent Projects ──

  getRecentProjects(): Project[] {
    return this.data.recentProjects || []
  }

  addRecentProject(dirPath: string): void {
    const projects = (this.data.recentProjects || []).filter((p) => p.path !== dirPath)
    projects.unshift({
      path: dirPath,
      name: path.basename(dirPath),
      lastOpened: new Date().toISOString(),
    })
    // Keep max 20 recent projects
    this.data.recentProjects = projects.slice(0, 20)
    this.save()
  }

  removeRecentProject(dirPath: string): void {
    this.data.recentProjects = (this.data.recentProjects || []).filter((p) => p.path !== dirPath)
    this.save()
  }

  // ── Per-Project Settings ──

  getProjectSettings(dirPath: string): ProjectSettings {
    const stored = this.data.projects?.[dirPath]
    return { ...DEFAULT_PROJECT_SETTINGS, ...stored }
  }

  setProjectSettings(dirPath: string, partial: Partial<ProjectSettings>): void {
    if (!this.data.projects) this.data.projects = {}
    this.data.projects[dirPath] = { ...this.getProjectSettings(dirPath), ...partial }
    this.save()
  }
}
