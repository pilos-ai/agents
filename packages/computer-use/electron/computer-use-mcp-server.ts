/**
 * Computer Use MCP Server — Desktop automation via macOS system tools.
 *
 * Stdio MCP server following the same pattern as jira-mcp-server.ts.
 * Provides screenshot, mouse, keyboard, and scroll tools for Claude sessions.
 *
 * Usage: Spawned as child process by the main Electron app with stdin/stdout MCP protocol.
 */

import {
  captureScreen,
  mouseClick,
  mouseDoubleClick,
  mouseRightClick,
  mouseMove,
  mouseDrag,
  typeText,
  pressKey,
  scroll,
  getScreenSize,
  checkAccessibilityPermission,
} from './macos-automation'

let accessibilityChecked = false
let accessibilityGranted = false

async function ensureAccessibility(): Promise<void> {
  if (!accessibilityChecked) {
    accessibilityGranted = await checkAccessibilityPermission()
    accessibilityChecked = true
  }
  if (!accessibilityGranted) {
    throw new Error(
      'Accessibility permission required. Go to System Settings > Privacy & Security > Accessibility and add Pilos Agents.'
    )
  }
}

const tools = [
  {
    name: 'computer_screenshot',
    description: 'Take a screenshot of the entire screen or a specific region',
    inputSchema: {
      type: 'object',
      properties: {
        region: {
          type: 'object',
          description: 'Optional region to capture {x, y, width, height}',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
          },
          required: ['x', 'y', 'width', 'height'],
        },
      },
    },
  },
  {
    name: 'computer_click',
    description: 'Click at screen coordinates',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'computer_double_click',
    description: 'Double-click at screen coordinates',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'computer_right_click',
    description: 'Right-click at screen coordinates',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'computer_type',
    description: 'Type text at the current cursor position',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to type' },
      },
      required: ['text'],
    },
  },
  {
    name: 'computer_key',
    description: 'Press a key combination (e.g. "cmd+c", "shift+cmd+z", "return", "escape", "tab")',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key combo like "cmd+c", "return", "escape"' },
      },
      required: ['key'],
    },
  },
  {
    name: 'computer_mouse_move',
    description: 'Move the mouse cursor to screen coordinates',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate' },
        y: { type: 'number', description: 'Y coordinate' },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'computer_scroll',
    description: 'Scroll in a direction',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: 'Scroll direction' },
        amount: { type: 'number', description: 'Scroll amount (default: 3)' },
      },
      required: ['direction'],
    },
  },
  {
    name: 'computer_get_screen_size',
    description: 'Get the screen resolution',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'computer_drag',
    description: 'Click and drag from one point to another',
    inputSchema: {
      type: 'object',
      properties: {
        fromX: { type: 'number', description: 'Start X coordinate' },
        fromY: { type: 'number', description: 'Start Y coordinate' },
        toX: { type: 'number', description: 'End X coordinate' },
        toY: { type: 'number', description: 'End Y coordinate' },
      },
      required: ['fromX', 'fromY', 'toX', 'toY'],
    },
  },
]

async function handleToolCall(
  name: string,
  input: Record<string, unknown>
): Promise<Array<{ type: string; text?: string; data?: string; mimeType?: string }>> {
  // Screenshot doesn't require accessibility
  if (name === 'computer_screenshot') {
    const region = input.region as { x: number; y: number; width: number; height: number } | undefined
    const result = await captureScreen(region)
    return [
      { type: 'image', data: result.data, mimeType: 'image/png' },
      { type: 'text', text: `Screenshot captured (${result.width}x${result.height})` },
    ]
  }

  if (name === 'computer_get_screen_size') {
    const size = await getScreenSize()
    return [{ type: 'text', text: JSON.stringify(size) }]
  }

  // All other tools require accessibility permission
  await ensureAccessibility()

  switch (name) {
    case 'computer_click':
      await mouseClick(input.x as number, input.y as number)
      return [{ type: 'text', text: `Clicked at (${input.x}, ${input.y})` }]

    case 'computer_double_click':
      await mouseDoubleClick(input.x as number, input.y as number)
      return [{ type: 'text', text: `Double-clicked at (${input.x}, ${input.y})` }]

    case 'computer_right_click':
      await mouseRightClick(input.x as number, input.y as number)
      return [{ type: 'text', text: `Right-clicked at (${input.x}, ${input.y})` }]

    case 'computer_type':
      await typeText(input.text as string)
      return [{ type: 'text', text: `Typed: "${(input.text as string).slice(0, 50)}${(input.text as string).length > 50 ? '...' : ''}"` }]

    case 'computer_key':
      await pressKey(input.key as string)
      return [{ type: 'text', text: `Pressed: ${input.key}` }]

    case 'computer_mouse_move':
      await mouseMove(input.x as number, input.y as number)
      return [{ type: 'text', text: `Moved mouse to (${input.x}, ${input.y})` }]

    case 'computer_scroll':
      await scroll(input.direction as 'up' | 'down' | 'left' | 'right', (input.amount as number) || 3)
      return [{ type: 'text', text: `Scrolled ${input.direction}${input.amount ? ` by ${input.amount}` : ''}` }]

    case 'computer_drag':
      await mouseDrag(input.fromX as number, input.fromY as number, input.toX as number, input.toY as number)
      return [{ type: 'text', text: `Dragged from (${input.fromX}, ${input.fromY}) to (${input.toX}, ${input.toY})` }]

    default:
      return [{ type: 'text', text: `Unknown tool: ${name}` }]
  }
}

// ── MCP stdio protocol (JSON-RPC over stdin/stdout) ──

interface JsonRpcMessage {
  jsonrpc: string
  id?: number
  method: string
  params?: unknown
}

function send(msg: unknown) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

async function handleMessage(msg: JsonRpcMessage) {
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'computer-use-mcp-server', version: '1.0.0' },
      },
    })
  } else if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: { tools },
    })
  } else if (msg.method === 'tools/call') {
    const params = msg.params as { name: string; arguments: Record<string, unknown> }
    try {
      const content = await handleToolCall(params.name, params.arguments || {})
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: { content },
      })
    } catch (err) {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [{ type: 'text', text: `Error: ${err}` }],
          isError: true,
        },
      })
    }
  } else if (msg.method === 'notifications/initialized') {
    // Acknowledgement from client, no response needed
  }
}

// Serialized request queue
const requestQueue: Array<{ msg: JsonRpcMessage; resolve: () => void }> = []
let processing = false

async function drainQueue() {
  if (processing) return
  processing = true
  while (requestQueue.length > 0) {
    const item = requestQueue.shift()!
    await handleMessage(item.msg)
    item.resolve()
  }
  processing = false
}

function enqueue(msg: JsonRpcMessage) {
  return new Promise<void>((resolve) => {
    requestQueue.push({ msg, resolve })
    drainQueue()
  })
}

let buffer = ''
process.stdin.setEncoding('utf-8')
process.stdin.on('data', (chunk: string) => {
  buffer += chunk
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const msg = JSON.parse(line) as JsonRpcMessage
      enqueue(msg)
    } catch {
      // Ignore malformed JSON
    }
  }
})
