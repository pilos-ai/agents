/**
 * macOS system tool wrappers for desktop automation.
 * Uses child_process.execFile — no native modules required.
 *
 * Prefers `cliclick` when available, falls back to JXA (osascript -l JavaScript)
 * with CoreGraphics ObjC bridge.
 */

import { execFile } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'

let hasCliclick: boolean | null = null

/** Detect cliclick availability at startup */
async function detectCliclick(): Promise<boolean> {
  if (hasCliclick !== null) return hasCliclick
  return new Promise((resolve) => {
    execFile('which', ['cliclick'], (err) => {
      hasCliclick = !err
      resolve(hasCliclick)
    })
  })
}

function exec(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${stderr || err.message}`))
      else resolve(stdout)
    })
  })
}

function runJxa(script: string): Promise<string> {
  return exec('osascript', ['-l', 'JavaScript', '-e', script])
}

function runAppleScript(script: string): Promise<string> {
  return exec('osascript', ['-e', script])
}

/** Check Accessibility permission */
export async function checkAccessibilityPermission(): Promise<boolean> {
  try {
    await runAppleScript('tell application "System Events" to get name of first process')
    return true
  } catch {
    return false
  }
}

/** Capture screenshot, optionally of a region. Returns base64 PNG. */
export async function captureScreen(region?: { x: number; y: number; width: number; height: number }): Promise<{ data: string; width: number; height: number }> {
  const tmpFile = path.join(os.tmpdir(), `pilos-screenshot-${Date.now()}.png`)
  try {
    const args = ['-x', '-t', 'png']
    if (region) {
      args.push('-R', `${region.x},${region.y},${region.width},${region.height}`)
    }
    args.push(tmpFile)
    await exec('screencapture', args)
    const buffer = fs.readFileSync(tmpFile)
    const data = buffer.toString('base64')

    // Get dimensions from the PNG header (bytes 16-23)
    const width = buffer.readUInt32BE(16)
    const height = buffer.readUInt32BE(20)

    return { data, width, height }
  } finally {
    try { fs.unlinkSync(tmpFile) } catch { /* ignore */ }
  }
}

/** Click at coordinates */
export async function mouseClick(x: number, y: number): Promise<void> {
  if (await detectCliclick()) {
    await exec('cliclick', [`c:${x},${y}`])
  } else {
    await runJxa(`
      ObjC.import('CoreGraphics');
      var point = $.CGPointMake(${x}, ${y});
      var mouseDown = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseDown, point, $.kCGMouseButtonLeft);
      var mouseUp = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseUp, point, $.kCGMouseButtonLeft);
      $.CGEventPost($.kCGHIDEventTap, mouseDown);
      $.CGEventPost($.kCGHIDEventTap, mouseUp);
    `)
  }
}

/** Double-click at coordinates */
export async function mouseDoubleClick(x: number, y: number): Promise<void> {
  if (await detectCliclick()) {
    await exec('cliclick', [`dc:${x},${y}`])
  } else {
    await runJxa(`
      ObjC.import('CoreGraphics');
      var point = $.CGPointMake(${x}, ${y});
      var down1 = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseDown, point, $.kCGMouseButtonLeft);
      var up1 = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseUp, point, $.kCGMouseButtonLeft);
      $.CGEventSetIntegerValueField(down1, $.kCGMouseEventClickState, 1);
      $.CGEventPost($.kCGHIDEventTap, down1);
      $.CGEventPost($.kCGHIDEventTap, up1);
      var down2 = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseDown, point, $.kCGMouseButtonLeft);
      var up2 = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseUp, point, $.kCGMouseButtonLeft);
      $.CGEventSetIntegerValueField(down2, $.kCGMouseEventClickState, 2);
      $.CGEventPost($.kCGHIDEventTap, down2);
      $.CGEventPost($.kCGHIDEventTap, up2);
    `)
  }
}

/** Right-click at coordinates */
export async function mouseRightClick(x: number, y: number): Promise<void> {
  if (await detectCliclick()) {
    await exec('cliclick', [`rc:${x},${y}`])
  } else {
    await runJxa(`
      ObjC.import('CoreGraphics');
      var point = $.CGPointMake(${x}, ${y});
      var mouseDown = $.CGEventCreateMouseEvent(null, $.kCGEventRightMouseDown, point, $.kCGMouseButtonRight);
      var mouseUp = $.CGEventCreateMouseEvent(null, $.kCGEventRightMouseUp, point, $.kCGMouseButtonRight);
      $.CGEventPost($.kCGHIDEventTap, mouseDown);
      $.CGEventPost($.kCGHIDEventTap, mouseUp);
    `)
  }
}

/** Move mouse to coordinates */
export async function mouseMove(x: number, y: number): Promise<void> {
  if (await detectCliclick()) {
    await exec('cliclick', [`m:${x},${y}`])
  } else {
    await runJxa(`
      ObjC.import('CoreGraphics');
      var point = $.CGPointMake(${x}, ${y});
      var event = $.CGEventCreateMouseEvent(null, $.kCGEventMouseMoved, point, $.kCGMouseButtonLeft);
      $.CGEventPost($.kCGHIDEventTap, event);
    `)
  }
}

/** Drag from one point to another */
export async function mouseDrag(fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
  if (await detectCliclick()) {
    await exec('cliclick', [`dd:${fromX},${fromY}`, `du:${toX},${toY}`])
  } else {
    await runJxa(`
      ObjC.import('CoreGraphics');
      var from = $.CGPointMake(${fromX}, ${fromY});
      var to = $.CGPointMake(${toX}, ${toY});
      var mouseDown = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseDown, from, $.kCGMouseButtonLeft);
      $.CGEventPost($.kCGHIDEventTap, mouseDown);
      delay(0.05);
      var mouseDrag = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseDragged, to, $.kCGMouseButtonLeft);
      $.CGEventPost($.kCGHIDEventTap, mouseDrag);
      delay(0.05);
      var mouseUp = $.CGEventCreateMouseEvent(null, $.kCGEventLeftMouseUp, to, $.kCGMouseButtonLeft);
      $.CGEventPost($.kCGHIDEventTap, mouseUp);
    `)
  }
}

/** Type text string */
export async function typeText(text: string): Promise<void> {
  if (await detectCliclick()) {
    await exec('cliclick', [`t:${text}`])
  } else {
    // AppleScript keystroke handles special characters better
    const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    await runAppleScript(`tell application "System Events" to keystroke "${escaped}"`)
  }
}

/** Press key combination (e.g. "cmd+c", "shift+cmd+z", "return", "escape") */
export async function pressKey(combo: string): Promise<void> {
  const parts = combo.toLowerCase().split('+').map((s) => s.trim())
  const key = parts.pop()!
  const modifiers = parts

  const modifierMap: Record<string, string> = {
    cmd: 'command down',
    command: 'command down',
    ctrl: 'control down',
    control: 'control down',
    alt: 'option down',
    option: 'option down',
    shift: 'shift down',
  }

  // Special key codes for non-character keys
  const keyCodeMap: Record<string, number> = {
    return: 36, enter: 36,
    tab: 48,
    space: 49,
    delete: 51, backspace: 51,
    escape: 53, esc: 53,
    left: 123, right: 124, down: 125, up: 126,
    f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97,
    f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
    home: 115, end: 119, pageup: 116, pagedown: 121,
    forwarddelete: 117,
  }

  const modStr = modifiers.map((m) => modifierMap[m]).filter(Boolean)
  const usingClause = modStr.length > 0 ? ` using {${modStr.join(', ')}}` : ''

  if (keyCodeMap[key] !== undefined) {
    await runAppleScript(`tell application "System Events" to key code ${keyCodeMap[key]}${usingClause}`)
  } else {
    const escaped = key.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    await runAppleScript(`tell application "System Events" to keystroke "${escaped}"${usingClause}`)
  }
}

/** Scroll in a direction */
export async function scroll(direction: 'up' | 'down' | 'left' | 'right', amount: number = 3): Promise<void> {
  let dy = 0
  let dx = 0
  switch (direction) {
    case 'up': dy = amount; break
    case 'down': dy = -amount; break
    case 'left': dx = amount; break
    case 'right': dx = -amount; break
  }
  await runJxa(`
    ObjC.import('CoreGraphics');
    var event = $.CGEventCreateScrollWheelEvent(null, 0, 2, ${dy}, ${dx});
    $.CGEventPost($.kCGHIDEventTap, event);
  `)
}

/** Get screen dimensions */
export async function getScreenSize(): Promise<{ width: number; height: number }> {
  const result = await runJxa(`
    ObjC.import('AppKit');
    var frame = $.NSScreen.mainScreen.frame;
    JSON.stringify({ width: frame.size.width, height: frame.size.height });
  `)
  return JSON.parse(result.trim())
}
