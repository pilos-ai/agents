import type { Task, TaskTemplate, TaskPriority, TaskLicense, ScheduleInterval } from '../store/useTaskStore'
import type { WorkflowDefinition } from '../types/workflow'

// ── Export Format ──
// .pilos files are JSON with this structure.
// Designed to be marketplace-ready: includes author, tags, and preview metadata.

export interface PilosExportFile {
  pilos: {
    version: 1
    type: 'task'
    exportedAt: string
    appVersion: string
  }
  task: {
    title: string
    description: string
    template: TaskTemplate
    priority: TaskPriority
    agentName: string | null
    schedule: { interval: ScheduleInterval }
    workflow?: WorkflowDefinition
  }
  // Marketplace-ready metadata
  meta: {
    author?: string
    tags?: string[]
    nodeCount: number
    edgeCount: number
    previewDescription?: string
    license: TaskLicense
  }
}

// App version (kept in sync with package.json)
const APP_VERSION = '2.4.0'

// ── Sharing Rights ──

/**
 * Returns true if the task can be shared/exported.
 * Marketplace-purchased tasks cannot be redistributed.
 */
export function canShareTask(task: Task): boolean {
  return task.license !== 'marketplace'
}

// ── Export ──

/**
 * Strips runtime data from a Task and produces an export payload.
 * Removes: id, projectPath, status, progress, runs, integrations,
 * agentId, sourceConversationId, createdAt, updatedAt, schedule runtime state.
 * Also strips executionStatus/executionError from workflow node data.
 */
export function prepareTaskForExport(task: Task): PilosExportFile {
  const workflow = task.workflow ? cleanWorkflowNodes(task.workflow) : undefined

  return {
    pilos: {
      version: 1,
      type: 'task',
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
    },
    task: {
      title: task.title,
      description: task.description,
      template: task.template,
      priority: task.priority,
      agentName: task.agentName,
      schedule: { interval: task.schedule.interval },
      workflow,
    },
    meta: {
      nodeCount: workflow?.nodes.length ?? 0,
      edgeCount: workflow?.edges.length ?? 0,
      license: task.license || 'free',
    },
  }
}

/**
 * Serializes a PilosExportFile to a pretty-printed JSON string.
 */
export function serializeExport(data: PilosExportFile): string {
  return JSON.stringify(data, null, 2)
}

/**
 * Encodes a PilosExportFile to a clipboard string.
 * Format: pilos:task:v1:<base64>
 */
export function encodeForClipboard(data: PilosExportFile): string {
  const json = JSON.stringify(data)
  const base64 = btoa(unescape(encodeURIComponent(json)))
  return `pilos:task:v1:${base64}`
}

// ── Import ──

/**
 * Parses and validates a .pilos JSON string.
 * Throws an Error with a user-friendly message on failure.
 */
export function parseExportFile(jsonString: string): PilosExportFile {
  let data: unknown
  try {
    data = JSON.parse(jsonString)
  } catch {
    throw new Error('Invalid file format — not valid JSON')
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Invalid file format — expected an object')
  }

  const obj = data as Record<string, unknown>

  // Validate envelope
  const pilos = obj.pilos as Record<string, unknown> | undefined
  if (!pilos || typeof pilos !== 'object') {
    throw new Error('Not a Pilos export file — missing header')
  }
  if (pilos.type !== 'task') {
    throw new Error(`Unsupported export type: ${pilos.type}`)
  }
  if (typeof pilos.version === 'number' && pilos.version > 1) {
    throw new Error('This file was created with a newer version of Pilos Agents. Please update the app.')
  }
  if (pilos.version !== 1) {
    throw new Error('Invalid file format — unsupported version')
  }

  // Validate task payload
  const task = obj.task as Record<string, unknown> | undefined
  if (!task || typeof task !== 'object') {
    throw new Error('Invalid file format — missing task data')
  }
  if (!task.title || typeof task.title !== 'string') {
    throw new Error('Invalid file format — task title is required')
  }

  return data as PilosExportFile
}

/**
 * Decodes and validates a clipboard string.
 * Validates: starts with 'pilos:task:v1:', base64 decodes, then calls parseExportFile.
 */
export function decodeFromClipboard(clipboardText: string): PilosExportFile {
  const trimmed = clipboardText.trim()
  if (!isPilosClipboardString(trimmed)) {
    throw new Error('Not a valid Pilos clipboard payload')
  }

  const base64 = trimmed.slice('pilos:task:v1:'.length)
  let json: string
  try {
    json = decodeURIComponent(escape(atob(base64)))
  } catch {
    throw new Error('Failed to decode clipboard data — the content may be corrupted')
  }

  return parseExportFile(json)
}

/**
 * Converts a PilosExportFile into a partial Task suitable for addTask().
 * Sets sensible defaults: status='idle', progress=0, empty runs/integrations, schedule disabled.
 */
export function importedFileToTask(
  data: PilosExportFile,
): Omit<Task, 'id' | 'projectPath' | 'createdAt' | 'updatedAt' | 'runs'> {
  const t = data.task
  return {
    title: t.title,
    description: t.description || '',
    template: t.template || 'custom',
    priority: t.priority || 'medium',
    status: 'idle',
    agentId: null,
    agentName: t.agentName || null,
    progress: 0,
    integrations: [],
    schedule: {
      interval: t.schedule?.interval || 'manual',
      enabled: false,
      nextRunAt: null,
      lastRunAt: null,
    },
    workflow: t.workflow,
    license: data.meta?.license || 'free',
  }
}

// ── Validation ──

/**
 * Lightweight check: does the string look like a pilos clipboard payload?
 */
export function isPilosClipboardString(text: string): boolean {
  return text.trim().startsWith('pilos:task:v1:')
}

/**
 * Strips executionStatus and executionError from all workflow nodes.
 */
function cleanWorkflowNodes(workflow: WorkflowDefinition): WorkflowDefinition {
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        executionStatus: undefined,
        executionError: undefined,
      },
    })),
  }
}
