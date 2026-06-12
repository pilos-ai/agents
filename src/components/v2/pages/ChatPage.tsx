/**
 * ChatPage — flagship Claude chat redesign matching pilos-handoff/app/screen_chat.jsx.
 *
 * The look is the prototype's three-pane layout:
 *   [ left .panel ] [ middle .chat-col ] [ right .chat-aside ]
 *
 * The behavior is the existing TerminalPage's behavior — streaming Claude CLI,
 * SQLite-backed conversation store, permission/question/plan-exit flows,
 * mobile relay injection, repetition-detection workflow suggestions. The page
 * keeps the existing `MessageBubble` for rendering each message so all those
 * inline IPC-driven blocks (ToolUseBlock, ExitPlanModeBlock, AskUserQuestionBlock)
 * continue to work without change.
 */
import { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useConversationStore } from '../../../store/useConversationStore'
import { useProjectStore } from '../../../store/useProjectStore'
import { useAppStore } from '../../../store/useAppStore'
import { useLicenseStore } from '../../../store/useLicenseStore'
import { useTaskStore } from '../../../store/useTaskStore'
import { useUsageStore } from '../../../store/useUsageStore'
import {
  IconChat,
  IconPaperclip,
  IconAt,
  IconSend,
  IconDots,
  IconPen,
  IconCopy,
  IconExternal,
  IconTrash,
  IconPlus,
  IconSearch,
  IconCpu,
  IconChevD,
  IconCheckSm,
  IconBolt,
  IconFolder,
  IconGithub,
  IconWorkflow,
  IconSpark,
  IconAgents,
  IconStop,
  IconTerminal,
  IconClock,
  IconRepeat,
} from '../PilosIcons'
import { parseLoopInterval, LOOP_INTERVAL_PRESETS } from '../../../utils/loop-interval'
import { MessageBubble } from '../../chat/MessageBubble'
import { PermissionBanner } from '../../chat/PermissionBanner'
import { ReplyPreview } from '../../chat/ReplyPreview'
import { ConvertConversationModal } from '../components/ConvertConversationModal'
import { WorkflowSuggestionBanner } from '../components/WorkflowSuggestionBanner'
import type { ImageAttachment } from '../../../types'

// ──────────────────────────────────────────────────────────────
// Static reference data — prototype's `AGENTS` / `MODELS` palette.
// The existing app has no multi-agent concept yet; the "room" widget
// uses this as a visual stand-in. Models are still the real CLI models
// from useProjectStore.setProjectModel.
// Solo/team is a REAL per-project setting now: it reads from the active
// project tab's `mode` (useProjectStore) and writes through `setProjectMode`,
// which persists to disk via api.projects.setSettings({ mode }). Team mode is
// Pro-gated by the license `teamMode` flag, matching SettingsDialog.
// ──────────────────────────────────────────────────────────────
const ROOM_AGENTS = [
  { code: 'ARC', name: 'Atlas', role: 'Software Architect', color: '#8b5cf6', model: 'claude-sonnet-4.6', status: 'thinking' as const },
  { code: 'DEV', name: 'Forge', role: 'Senior Developer', color: '#3ecf8e', model: 'claude-sonnet-4.6', status: 'online' as const },
  { code: 'PM', name: 'Nova', role: 'Project Manager', color: '#f59e0b', model: 'claude-haiku-4', status: 'online' as const },
  { code: 'SEC', name: 'Warden', role: 'Security Engineer', color: '#fb6f6f', model: 'claude-sonnet-4.6', status: 'idle' as const },
]

// Values are short CLI aliases — the CLI resolves them to the latest model
// in each family automatically, so Opus 4.9 etc. will be picked up without
// any code change. Labels are informational; update them as new versions ship.
const MODEL_OPTIONS = [
  { value: 'opus',   label: 'Opus',   version: '4.x', desc: 'Most capable' },
  { value: 'sonnet', label: 'Sonnet', version: '4.x', desc: 'Balanced' },
  { value: 'haiku',  label: 'Haiku',  version: '4.x', desc: 'Fast & efficient' },
]

const MODEL_LABEL: Record<string, string> = Object.fromEntries(
  MODEL_OPTIONS.map((m) => [m.value, m.label])
)

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']
const MAX_FILE_SIZE = 20 * 1024 * 1024

function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ──────────────────────────────────────────────────────────────
// Dropdown — port of prototype's `Dropdown` primitive.
// ──────────────────────────────────────────────────────────────
type MenuItem =
  | { sep: true }
  | { head: string }
  | { label: string; onClick?: () => void; danger?: boolean; active?: boolean; kbd?: string; icon?: React.ReactNode }

interface DropdownProps {
  trigger: React.ReactNode
  triggerClassName?: string
  items: MenuItem[]
  align?: 'left' | 'right'
  width?: number
}

function Dropdown({ trigger, triggerClassName, items, align = 'left', width = 200 }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Compute portal position from the trigger's bounding rect. Recompute on
  // window resize so the menu follows the trigger if layout shifts.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const place = () => {
      const t = triggerRef.current
      if (!t) return
      const r = t.getBoundingClientRect()
      const top = r.bottom + 6
      const left = align === 'right' ? r.right - width : r.left
      // Clamp to viewport so the menu never spills off-screen on tiny windows.
      const clampedLeft = Math.max(8, Math.min(left, window.innerWidth - width - 8))
      setPos({ top, left: clampedLeft })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true) // capture scroll on any ancestor
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, align, width])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', escHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', escHandler)
    }
  }, [open])

  const menu = open && pos ? createPortal(
    <div
      ref={menuRef}
      className={`menu menu-${align}`}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width }}
    >
      {items.map((it, i) => {
        if ('sep' in it) return <div key={i} className="menu-sep" />
        if ('head' in it) return <div key={i} className="menu-head">{it.head}</div>
        return (
          <button
            key={i}
            type="button"
            className={'menu-item' + (it.danger ? ' danger' : '') + (it.active ? ' on' : '')}
            onClick={() => { setOpen(false); it.onClick?.() }}
          >
            {it.icon && <span className="mi-ic">{it.icon}</span>}
            <span className="mi-l">{it.label}</span>
            {it.active && <span className="mi-ck"><IconCheckSm size={14} /></span>}
            {it.kbd && <span className="mi-kbd">{it.kbd}</span>}
          </button>
        )
      })}
    </div>,
    document.body,
  ) : null

  return (
    <div className="menu-wrap">
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        aria-expanded={open}
      >
        {trigger}
      </button>
      {menu}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Left panel — projects + conversations
// ──────────────────────────────────────────────────────────────
function ChatLeftPanel() {
  const openProjects = useProjectStore((s) => s.openProjects)
  const recentProjects = useProjectStore((s) => s.recentProjects)
  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const setActiveProject = useProjectStore((s) => s.setActiveProject)

  const conversations = useConversationStore((s) => s.conversations)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const setActiveConversation = useConversationStore((s) => s.setActiveConversation)
  const createConversation = useConversationStore((s) => s.createConversation)
  const isWaitingForResponse = useConversationStore((s) => s.isWaitingForResponse)
  const isStreaming = useConversationStore((s) => s.streaming.isStreaming)
  const isActiveConvBusy = isWaitingForResponse || isStreaming
  // Per-conversation live state (terminal model): every running chat shows a run
  // dot, foreground or background — not just the active one.
  const sessions = useConversationStore((s) => s.sessions)
  const busyProjectPaths = useMemo(() => {
    const map = useProjectStore.getState().conversationProjectMap
    const set = new Set<string>()
    for (const [cid, sess] of Object.entries(sessions)) {
      if (sess.isWaitingForResponse || sess.streaming.isStreaming) {
        const pp = map.get(cid)
        if (pp) set.add(pp)
      }
    }
    return set
  }, [sessions])

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">
          <span>Projects</span>
          <Dropdown
            align="right"
            width={208}
            triggerClassName="add"
            trigger={<IconPlus size={14} />}
            items={(() => {
              const openPaths = new Set(openProjects.map((p) => p.projectPath))
              const closedRecent = recentProjects.filter((p) => !openPaths.has(p.path)).slice(0, 5)
              const items: MenuItem[] = [
                { head: 'Add to workspace' },
                { icon: <IconFolder size={15} />, label: 'New project', onClick: () => { window.api?.dialog?.openDirectory?.().then((dir: string | null) => { if (dir) useProjectStore.getState().openProject(dir) }) } },
                { icon: <IconTerminal size={15} />, label: 'Open local folder…', onClick: () => { window.api?.dialog?.openDirectory?.().then((dir: string | null) => { if (dir) useProjectStore.getState().openProject(dir) }) } },
                { icon: <IconGithub size={15} />, label: 'Clone from GitHub' },
              ]
              if (closedRecent.length > 0) {
                items.push({ sep: true })
                items.push({ head: 'Recent' })
                for (const p of closedRecent) {
                  items.push({ icon: <IconClock size={15} />, label: p.name, onClick: () => { void useProjectStore.getState().openProject(p.path) } })
                }
              }
              items.push({ sep: true })
              items.push({ icon: <IconChat size={15} />, label: 'New conversation', kbd: '⌘N', onClick: () => { void createConversation() } })
              return items
            })()}
          />
        </div>
        <div className="panel-search">
          <IconSearch size={14} />
          <input
            placeholder="Search…"
            onFocus={() => {
              // FLAG: search input is inert; ⌘K opens the global CommandPalette
              // via V2Layout. Wire to that here if desired in next pass.
            }}
          />
          <span className="kbd">⌘K</span>
        </div>
      </div>

      {/* Projects — own scroll region, capped so it never crowds out conversations */}
      <div className="panel-section panel-projects">
        {openProjects.map((p) => {
          const isActive = p.projectPath === activeProjectPath
          const count = isActive ? conversations.length : (p.snapshot?.conversations.length ?? 0)
          const label = count === 1 ? '1 conversation' : `${count} conversations`
          // Dot reflects live activity, not selection (selection = left accent bar).
          // dot-run: streaming/waiting; dot-ok: idle with conversations; dot-idle: empty.
          // Non-active projects use the live per-session set (terminal model) so a
          // background project that is streaming lights up — the snapshot is only a
          // point-in-time mirror captured at switch-away and goes stale otherwise.
          const isBusy = isActive
            ? isActiveConvBusy
            : busyProjectPaths.has(p.projectPath)
          const dotClass = isBusy ? 'dot-run' : count > 0 ? 'dot-ok' : 'dot-idle'
          return (
            <button
              type="button"
              key={p.projectPath}
              className={'list-item' + (isActive ? ' active' : '')}
              onClick={() => { void setActiveProject(p.projectPath) }}
              title={p.projectPath}
            >
              <span className={'li-dot ' + dotClass} />
              <div className="li-main">
                <div className="li-name">{p.projectName}</div>
                <div className="li-sub">{label}</div>
              </div>
              {p.unreadCount > 0 && <span className="li-badge">{p.unreadCount}</span>}
            </button>
          )
        })}
      </div>

      <div className="panel-sec panel-sec-divider">
        <span>Conversations</span>
        <span className="n">{conversations.length}</span>
      </div>

      {/* Conversations — takes remaining vertical space, scrolls independently */}
      <div className="panel-section panel-conversations">
        {conversations.map((c) => {
          const isActive = c.id === activeConversationId
          const dot = isActive && isActiveConvBusy ? 'dot-run' : 'dot-idle'
          return (
            <button
              type="button"
              key={c.id}
              className={'list-item' + (isActive ? ' active' : '')}
              onClick={() => setActiveConversation(c.id)}
            >
              <span className="li-ico"><IconChat size={15} /></span>
              <div className="li-main">
                <div className="li-name">{c.title || 'New Conversation'}</div>
                <div className="li-sub">{new Date(c.updated_at).toLocaleString()}</div>
              </div>
              <span className={'li-dot ' + dot} style={{ width: 7, height: 7 }} />
            </button>
          )
        })}

        {conversations.length === 0 && activeProjectPath && (
          <div className="muted" style={{ padding: '12px 8px', fontSize: 11.5 }}>No conversations yet</div>
        )}
      </div>

      <div className="panel-foot">
        <button
          type="button"
          className="btn sm"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => { void createConversation() }}
          disabled={!activeProjectPath}
        >
          <IconPlus size={14} />
          New conversation
        </button>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Composer (chat input). Wires to existing sendMessage / queueMessage flow.
// Strips down the previous TerminalInput to the prototype's chrome but keeps
// the same submit pipeline and queueing semantics.
// ──────────────────────────────────────────────────────────────
function ChatComposer({ mode }: { mode: 'solo' | 'team' }) {
  const [val, setVal] = useState('')
  const [images, setImages] = useState<ImageAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // @-mention autocomplete state
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)

  // /loop scheduling state — when on, the next message is sent as `/loop <interval> …`
  const [loopMode, setLoopMode] = useState(false)
  const [loopInterval, setLoopInterval] = useState<string | null>(null)

  const sendMessage = useConversationStore((s) => s.sendMessage)
  const queueMessage = useConversationStore((s) => s.queueMessage)
  const isWaitingForResponse = useConversationStore((s) => s.isWaitingForResponse)
  const isStreaming = useConversationStore((s) => s.streaming.isStreaming)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const permissionRequest = useConversationStore((s) => s.permissionRequest)
  const respondPermission = useConversationStore((s) => s.respondPermission)
  const abortSession = useConversationStore((s) => s.abortSession)
  const replyToMessage = useConversationStore((s) => s.replyToMessage)
  const setReplyTo = useConversationStore((s) => s.setReplyTo)
  const isLoading = isWaitingForResponse || isStreaming

  // Project agents — used for @-mention autocomplete
  const projectAgents = useProjectStore((s) => {
    const tab = s.openProjects.find((p) => p.projectPath === s.activeProjectPath)
    return tab?.agents || []
  })

  // Filter agents by current mention query (case-insensitive prefix on name OR role)
  const mentionMatches = useMemo(() => {
    if (!mentionOpen) return [] as typeof projectAgents
    const q = mentionQuery.toLowerCase()
    return projectAgents
      .filter((a) => a.name.toLowerCase().includes(q) || a.role.toLowerCase().includes(q))
      .slice(0, 8)
  }, [mentionOpen, mentionQuery, projectAgents])

  // Track the last query so we only reset the selection index when the query
  // actually changes — otherwise arrow-key navigation gets clobbered on every
  // keystroke (onKeyUp fires `refreshMentionState` after onKeyDown bumped the
  // index, and an unconditional reset would snap it back to 0).
  const prevMentionQueryRef = useRef<string | null>(null)

  // Detect whether the caret is inside an @-mention token, capture the query.
  const refreshMentionState = useCallback((nextVal: string, caret: number) => {
    // Scan backwards from caret looking for `@` not preceded by a word char.
    const before = nextVal.slice(0, caret)
    const at = before.lastIndexOf('@')
    const closePicker = () => {
      setMentionOpen(false)
      prevMentionQueryRef.current = null
    }
    if (at < 0) { closePicker(); return }
    const charBeforeAt = at > 0 ? before[at - 1] : ''
    if (charBeforeAt && /\S/.test(charBeforeAt) && !/[\s]/.test(charBeforeAt)) {
      // `@` is glued to text → not a mention trigger (e.g. email)
      closePicker()
      return
    }
    const query = before.slice(at + 1)
    if (/\s/.test(query)) { closePicker(); return }
    setMentionOpen(true)
    setMentionQuery(query)
    if (prevMentionQueryRef.current !== query) {
      prevMentionQueryRef.current = query
      setMentionIndex(0)
    }
  }, [])

  // Replace the active @-query token with `@AgentName ` and close the picker.
  const insertMention = useCallback((agentName: string) => {
    const el = textareaRef.current
    if (!el) return
    const caret = el.selectionStart ?? val.length
    const before = val.slice(0, caret)
    const at = before.lastIndexOf('@')
    if (at < 0) return
    const replacement = `@${agentName} `
    const next = val.slice(0, at) + replacement + val.slice(caret)
    setVal(next)
    setMentionOpen(false)
    // Restore caret after the inserted mention
    queueMicrotask(() => {
      const pos = at + replacement.length
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }, [val])

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '24px'
    el.style.height = Math.min(el.scrollHeight, 180) + 'px'
  }, [val])

  // When user picks a reply target, jump focus into the composer
  useEffect(() => {
    if (replyToMessage) textareaRef.current?.focus()
  }, [replyToMessage])

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const next: ImageAttachment[] = []
    for (const file of Array.from(files)) {
      if (!ACCEPTED_TYPES.includes(file.type)) continue
      if (file.size > MAX_FILE_SIZE) continue
      const data = await fileToBase64(file)
      next.push({ data, mediaType: file.type, name: file.name || 'pasted-image' })
    }
    if (next.length > 0) setImages((prev) => [...prev, ...next])
  }, [])

  const submit = () => {
    const text = val.trim()
    if ((!text && images.length === 0) || !activeConversationId) return
    const baseBody = text || 'What is in this image?'

    // Loop mode: wrap the message in a `/loop <interval>` command. A natural-language
    // interval in the text ("every 30m") wins over the picker; otherwise use the picker
    // value (null → dynamic pacing, i.e. bare `/loop`).
    let body = baseBody
    if (loopMode && !baseBody.startsWith('/loop ')) {
      const parsed = parseLoopInterval(baseBody)
      const interval = parsed?.interval ?? loopInterval
      // When the whole message IS the interval phrase (e.g. "every 5m"), parsed.cleanText
      // is '' — use it directly. Only fall back to baseBody when there was no parse at all,
      // otherwise the stripped interval phrase gets duplicated back into the prompt.
      const cleaned = parsed ? parsed.cleanText : baseBody
      body = interval
        ? (cleaned ? `/loop ${interval} ${cleaned}` : `/loop ${interval}`)
        : (cleaned ? `/loop ${cleaned}` : '/loop')
    }

    const messageImages = images.length > 0 ? images : undefined
    if (isLoading) queueMessage(body, messageImages)
    else void sendMessage(body, messageImages)
    setVal('')
    setImages([])
    setLoopMode(false)
  }

  return (
    <div className="composer">
      <div className="composer-inner">
        <ReplyPreview />
        {images.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {images.map((img, i) => (
              <div key={i} style={{ position: 'relative', width: 56, height: 56 }}>
                {img.mediaType === 'application/pdf' ? (
                  <div style={{ width: 56, height: 56, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface)', display: 'grid', placeItems: 'center', fontSize: 18, color: 'var(--err)' }}>PDF</div>
                ) : (
                  <img src={`data:${img.mediaType};base64,${img.data}`} alt={img.name || 'attachment'} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
                )}
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: 'var(--err)', color: '#fff', border: 'none', fontSize: 10, cursor: 'pointer' }}
                >×</button>
              </div>
            ))}
          </div>
        )}

        <div className="composer-box">
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={
              !activeConversationId
                ? 'Create a conversation first…'
                : mode === 'team'
                  ? 'Message your team…  use @ to direct a question'
                  : 'Message Claude…'
            }
            value={val}
            onChange={(e) => {
              setVal(e.target.value)
              refreshMentionState(e.target.value, e.target.selectionStart ?? e.target.value.length)
            }}
            onKeyUp={(e) => {
              // Catch caret moves (arrow keys, click) that don't fire onChange
              const t = e.currentTarget
              refreshMentionState(t.value, t.selectionStart ?? t.value.length)
            }}
            onClick={(e) => {
              const t = e.currentTarget
              refreshMentionState(t.value, t.selectionStart ?? t.value.length)
            }}
            onBlur={() => {
              // Delay so a mouse click on a menu item can fire first
              setTimeout(() => setMentionOpen(false), 120)
            }}
            onPaste={(e) => {
              // Pull image/PDF files out of the clipboard. The global
              // `paste:text` IPC handler (App.tsx) only handles plain text;
              // images need to be picked up here from the native paste event.
              const files: File[] = []
              for (const item of Array.from(e.clipboardData.items)) {
                if (item.kind !== 'file') continue
                const f = item.getAsFile()
                if (f && ACCEPTED_TYPES.includes(f.type)) files.push(f)
              }
              if (files.length > 0) {
                e.preventDefault()
                void addFiles(files)
              }
            }}
            onKeyDown={(e) => {
              // Mention picker keyboard nav takes precedence
              if (mentionOpen && mentionMatches.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setMentionIndex((i) => (i + 1) % mentionMatches.length)
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length)
                  return
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault()
                  insertMention(mentionMatches[mentionIndex].name)
                  return
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setMentionOpen(false)
                  return
                }
              }
              if (e.key === 'Escape' && replyToMessage && !val) {
                e.preventDefault()
                setReplyTo(null)
                return
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (permissionRequest && !val.trim()) { respondPermission(true); return }
                submit()
              }
            }}
            disabled={!activeConversationId}
          />
          {mentionOpen && mentionMatches.length > 0 && (
            <div
              role="listbox"
              aria-label="Mention an agent"
              style={{
                position: 'absolute',
                left: 12,
                bottom: 'calc(100% + 6px)',
                minWidth: 220,
                maxWidth: 320,
                background: 'var(--surface)',
                border: '1px solid var(--line-2)',
                borderRadius: 10,
                boxShadow: '0 12px 32px -8px rgba(0,0,0,0.45)',
                padding: 4,
                zIndex: 50,
              }}
            >
              {mentionMatches.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  role="option"
                  aria-selected={i === mentionIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertMention(a.name)}
                  onMouseEnter={() => setMentionIndex(i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 7,
                    border: 'none',
                    background: i === mentionIndex ? 'var(--accent-soft)' : 'transparent',
                    color: 'var(--ink)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: 12.5,
                  }}
                >
                  <span
                    className={'cav ' + (AGENT_GRAD[a.color] || 'cav-grad-claude')}
                    style={{ width: 22, height: 22, borderRadius: 6, fontSize: 10, flex: 'none' }}
                  >
                    {a.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <span style={{ fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.role}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="composer-row">
            <div className="left">
              <button type="button" className="mini-ico" title="Attach" onClick={() => fileInputRef.current?.click()}>
                <IconPaperclip size={16} />
              </button>
              <button
                type="button"
                className="mini-ico"
                title="Mention agent"
                onClick={() => {
                  const el = textareaRef.current
                  if (!el) return
                  const caret = el.selectionStart ?? val.length
                  const before = val.slice(0, caret)
                  const after = val.slice(caret)
                  const needsSpace = before.length > 0 && !/\s$/.test(before)
                  const insert = needsSpace ? ' @' : '@'
                  const next = before + insert + after
                  setVal(next)
                  queueMicrotask(() => {
                    el.focus()
                    const pos = before.length + insert.length
                    el.setSelectionRange(pos, pos)
                    // Trigger mention picker for the newly inserted @
                    refreshMentionState(next, pos)
                  })
                }}
              >
                <IconAt size={16} />
              </button>
              <button type="button" className="mini-ico" title="Run as workflow">
                <IconWorkflow size={16} />
              </button>
              <Dropdown
                align="left"
                width={210}
                triggerClassName="mini-ico"
                trigger={
                  <span
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: loopMode ? 'var(--accent)' : undefined }}
                    title={loopMode ? 'Loop on — click to change or turn off' : 'Loop this message on a schedule'}
                  >
                    <IconRepeat size={16} />
                    {loopMode && <span style={{ fontSize: 11, fontWeight: 600 }}>{loopInterval || 'dynamic'}</span>}
                  </span>
                }
                items={[
                  { head: 'Repeat every' },
                  ...LOOP_INTERVAL_PRESETS.map((p) => ({
                    label: p.desc ? `${p.label} · ${p.desc}` : p.label,
                    active: loopMode && loopInterval === p.value,
                    onClick: () => { setLoopMode(true); setLoopInterval(p.value) },
                  })),
                  ...(loopMode
                    ? [{ label: 'Turn loop off', danger: true, onClick: () => { setLoopMode(false); setLoopInterval(null) } }]
                    : []),
                ]}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(',')}
                multiple
                hidden
                onChange={async (e) => {
                  const files = e.target.files
                  if (files && files.length > 0) await addFiles(files)
                  e.target.value = ''
                }}
              />
            </div>
            {isLoading ? (
              <button
                type="button"
                className="send"
                onClick={() => abortSession()}
                title="Stop"
                style={{ background: 'var(--err)' }}
              >
                <IconStop size={14} />
              </button>
            ) : (
              <button
                type="button"
                className="send"
                onClick={submit}
                disabled={!activeConversationId || (!val.trim() && images.length === 0)}
                title="Send"
              >
                <IconSend size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="composer-hint">
          <span className="kbd">↵</span> send
          <span className="kbd">⇧↵</span> newline
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconSpark size={13} style={{ color: 'var(--accent-2)' }} />
            Turn this chat into a workflow
          </span>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Right aside — agents in room + context
// ──────────────────────────────────────────────────────────────

// Map AgentDefinition.color (tailwind key) → `.cav-grad-*` class.
const AGENT_GRAD: Record<string, string> = {
  blue: 'cav-grad-blue',
  purple: 'cav-grad-purple',
  green: 'cav-grad-green',
  pink: 'cav-grad-pink',
  orange: 'cav-grad-orange',
  cyan: 'cav-grad-cyan',
  yellow: 'cav-grad-yellow',
  red: 'cav-grad-red',
  indigo: 'cav-grad-indigo',
}

interface RoomAgent {
  /** Real id from `AgentDefinition.id`, or `null` for prototype placeholder rows */
  id: string | null
  code: string
  name: string
  role: string
  /** Either a `cav-grad-*` class (real agent) or a CSS color value (placeholder) */
  gradClass?: string
  bgColor?: string
  status: 'thinking' | 'online' | 'idle'
  model: string
}

function RoomAgentRow({
  a,
  isStreaming,
  onModelChange,
}: {
  a: RoomAgent
  isStreaming: boolean
  onModelChange: ((m: string) => void) | null
}) {
  const [permOn, setPermOn] = useState(true)
  const liveStatus: RoomAgent['status'] = isStreaming ? 'thinking' : a.status
  return (
    <div className="room-agent">
      <div className="ra-top">
        <div
          className={'ra-av avatar ' + (a.gradClass || '')}
          style={a.bgColor ? { background: a.bgColor, fontSize: 11.5 } : { fontSize: 11.5 }}
        >
          {a.code.slice(0, 2)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ra-nm">{a.name}</div>
          <div className="ra-st">
            <span
              className="d"
              style={{
                background:
                  liveStatus === 'thinking'
                    ? 'var(--accent)'
                    : liveStatus === 'online'
                      ? 'var(--ok)'
                      : 'var(--faint)',
                flex: 'none',
              }}
            />
            <span className="role-text" title={a.role}>{a.role}</span>
          </div>
        </div>
      </div>
      <div className="ra-model">
        <Dropdown
          align="left"
          width={200}
          triggerClassName="model-btn"
          trigger={
            <>
              <IconCpu size={12} />
              <span className="nm">{MODEL_LABEL[a.model] ?? a.model}</span>
              <IconChevD size={11} />
            </>
          }
          items={[
            { head: onModelChange ? 'Model · permission to change' : 'Model (read-only)' },
            ...MODEL_OPTIONS.map((m) => ({
              label: `${m.label} — ${m.desc}`,
              active: m.value === a.model,
              onClick: onModelChange ? () => onModelChange(m.value) : undefined,
            })),
          ]}
        />
      </div>
      <div className="room-perm">
        <button
          type="button"
          className={'switch' + (permOn ? ' on' : '')}
          style={{ width: 30, height: 17 }}
          onClick={() => setPermOn((v) => !v)}
          aria-pressed={permOn}
        >
          <span className="knob" style={{ width: 12, height: 12, transform: permOn ? 'translateX(13px)' : 'none' }} />
        </button>
        <span className="muted">can run tools &amp; commands</span>
      </div>
    </div>
  )
}

function ChatAside({ mode }: { mode: 'solo' | 'team' }) {
  const activeTab = useProjectStore((s) => s.openProjects.find((p) => p.projectPath === s.activeProjectPath))
  const projectModel = activeTab?.model || 'sonnet'
  const setProjectModel = useProjectStore((s) => s.setProjectModel)
  const updateProjectAgent = useProjectStore((s) => s.updateProjectAgent)
  const setActiveView = useAppStore((s) => s.setActiveView)

  const messages = useConversationStore((s) => s.messages)
  const limits = useUsageStore((s) => s.limits)
  const isStreaming = useConversationStore((s) => s.streaming.isStreaming)
  const streamingAgentName = useConversationStore((s) => s.streaming.currentAgentName)

  // Build the room roster from REAL project agents. Each row's model dropdown
  // calls updateProjectAgent(id, { model }) — real per-agent persistence via
  // api.projects.setSettings (already wired in the store action).
  const roomAgents: RoomAgent[] = useMemo(() => {
    const realAgents = activeTab?.agents || []
    if (realAgents.length === 0) {
      // No agents configured yet → fall back to a single Claude placeholder so
      // the aside isn't empty. The dropdown writes to the project model.
      return [{
        id: null,
        code: 'CL',
        name: 'Claude',
        role: 'Default assistant',
        bgColor: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
        status: 'online',
        model: projectModel,
      }]
    }
    const visible = mode === 'solo' ? realAgents.slice(0, 1) : realAgents
    return visible.map((a) => ({
      id: a.id,
      code: a.name.slice(0, 2).toUpperCase(),
      name: a.name,
      role: a.role,
      gradClass: AGENT_GRAD[a.color] || 'cav-grad-claude',
      status: 'online' as const,
      // Per-agent override falls back to project model
      model: a.model || projectModel,
    }))
  }, [activeTab?.agents, mode, projectModel])

  const tokenLabel = limits?.five_hour?.utilization != null
    ? `${Math.round(limits.five_hour.utilization)}% / 5h`
    : '— / 200k'

  const handleModelChange = (agent: RoomAgent, newModel: string) => {
    if (agent.id) {
      updateProjectAgent(agent.id, { model: newModel })
    } else {
      // Placeholder Claude row → write to project-wide model
      setProjectModel(newModel)
    }
  }

  return (
    <div className="chat-aside">
      <div className="aside-head">
        {mode === 'solo' ? 'Active agent' : 'Team in this room'}
        <span className="tag">{roomAgents.length}</span>
      </div>
      <div className="aside-body">
        {roomAgents.map((a) => (
          <RoomAgentRow
            key={a.id ?? `placeholder-${a.code}`}
            a={a}
            isStreaming={isStreaming && (!streamingAgentName || streamingAgentName === a.name)}
            onModelChange={(m) => handleModelChange(a, m)}
          />
        ))}
        {mode === 'team' && (
          <button
            type="button"
            className="btn sm ghost"
            style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
            onClick={() => setActiveView('agents')}
          >
            <IconPlus size={14} /> Add agent
          </button>
        )}
      </div>

      {/* Pinned context footer — always visible regardless of how long the agent list grows */}
      <div className="aside-foot">
        <div className="panel-sec" style={{ padding: '0 8px 8px' }}>Context</div>
        <div className="row" style={{ justifyContent: 'space-between', padding: '6px 8px', fontSize: 12 }}>
          <span className="muted">Memory</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)' }}>SQLite · {messages.length} msgs</span>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', padding: '6px 8px', fontSize: 12 }}>
          <span className="muted">Tools</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)' }}>{(activeTab?.mcpServers || []).filter((s) => s.enabled).length} MCP</span>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', padding: '6px 8px', fontSize: 12 }}>
          <span className="muted">Tokens</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)' }}>{tokenLabel}</span>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────
export default function ChatPage() {
  const messages = useConversationStore((s) => s.messages)
  const streaming = useConversationStore((s) => s.streaming)
  const messageQueue = useConversationStore((s) => s.messageQueue)
  const permissionRequest = useConversationStore((s) => s.permissionRequest)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const conversations = useConversationStore((s) => s.conversations)
  const isWaitingForResponse = useConversationStore((s) => s.isWaitingForResponse)
  const isLoadingMessages = useConversationStore((s) => s.isLoadingMessages)
  const createConversation = useConversationStore((s) => s.createConversation)
  const renameConversation = useConversationStore((s) => s.renameConversation)
  const deleteConversation = useConversationStore((s) => s.deleteConversation)
  const stopLoop = useConversationStore((s) => s.stopLoop)
  const workflowSuggestion = useConversationStore((s) => s.workflowSuggestion)
  const dismissWorkflowSuggestion = useConversationStore((s) => s.dismissWorkflowSuggestion)
  // Pagination state for backwards infinite-scroll.
  const hasMoreOlder = useConversationStore((s) => s.hasMoreOlder)
  const isLoadingOlder = useConversationStore((s) => s.isLoadingOlder)
  const loadOlderMessages = useConversationStore((s) => s.loadOlderMessages)
  const scrollToMessageId = useConversationStore((s) => s.scrollToMessageId)
  const setScrollToMessageId = useConversationStore((s) => s.setScrollToMessageId)
  const ensureMessageLoaded = useConversationStore((s) => s.ensureMessageLoaded)
  const isLoopActive = useConversationStore((s) => {
    const cid = s.activeConversationId
    if (!cid || s.stoppedLoops[cid]) return false
    for (let i = s.messages.length - 1; i >= 0; i--) {
      const m = s.messages[i]
      if (m.role !== 'user' || m.type !== 'text') continue
      return m.content.trimStart().startsWith('/loop ')
    }
    return false
  })

  const activeProjectPath = useProjectStore((s) => s.activeProjectPath)
  const activeTab = useProjectStore((s) => s.openProjects.find((p) => p.projectPath === s.activeProjectPath))

  // Solo/team is a REAL per-project setting persisted on the project tab and to
  // disk (api.projects.setSettings({ mode })). Read it from the active tab and
  // write it via setProjectMode so the choice survives reload. Team mode is
  // Pro-gated by the license `teamMode` flag (matches SettingsDialog).
  const setProjectMode = useProjectStore((s) => s.setProjectMode)
  const teamModeUnlocked = useLicenseStore((s) => s.flags.teamMode)
  const mode: 'solo' | 'team' = activeTab?.mode ?? 'solo'

  const [showConvertModal, setShowConvertModal] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const activeConversation = conversations.find((c) => c.id === activeConversationId)
  const conversationTitle = activeConversation?.title || 'New Chat'

  // Scroll behavior — mirrors TerminalPage's smart scroll.
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const messageRefs = useRef<Map<number, HTMLElement>>(new Map())
  const prevConversationId = useRef(activeConversationId)
  const justSwitched = useRef(true)
  const userScrolledUp = useRef(false)
  // When loadOlderMessages is about to fire we record `scrollHeight - scrollTop`
  // (i.e. how far the bottom edge of the viewport is from the bottom of the
  // scroll content). After React commits the prepended rows, the layout effect
  // below restores that same distance so the rows the user was looking at stay
  // visually anchored — without this, the viewport would jump to the top.
  const prependAnchor = useRef<number | null>(null)
  // Most-recent message id we've seen — used to detect "real" new messages (vs.
  // prepending older ones) so the auto-scroll-to-bottom effect only fires when
  // the conversation actually grew at the tail.
  const lastSeenLastIdRef = useRef<number | string | null>(null)
  // Search-jump highlight (matches ChatPanel's 1.5s flash treatment).
  const [highlightedId, setHighlightedId] = useState<number | null>(null)

  useEffect(() => {
    if (prevConversationId.current !== activeConversationId) {
      prevConversationId.current = activeConversationId
      justSwitched.current = true
      userScrolledUp.current = false
      messageRefs.current.clear()
      prependAnchor.current = null
      lastSeenLastIdRef.current = null
    }
  }, [activeConversationId])

  // Scroll handler: track "user scrolled up" + trigger backwards page load
  // when we're within 150px of the top.
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const handler = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      userScrolledUp.current = distance > 150
      // Near top → load older. Skip while a load is in flight (the store also
      // guards) or there's nothing more to fetch.
      if (el.scrollTop < 150) {
        const s = useConversationStore.getState()
        if (s.hasMoreOlder && !s.isLoadingOlder && s.activeConversationId) {
          // Anchor the bottom-distance BEFORE the fetch so the layout effect
          // can pin the viewport once new rows render. The fire-and-forget
          // pattern then clears the anchor if the load returns 0 rows (so
          // the layout effect won't run); otherwise the layout effect itself
          // clears it after restoring scrollTop.
          if (prependAnchor.current === null) {
            const beforeCount = useConversationStore.getState().messages.length
            prependAnchor.current = el.scrollHeight - el.scrollTop
            void loadOlderMessages().finally(() => {
              const afterCount = useConversationStore.getState().messages.length
              // If the page returned no rows, the layout effect on `messages`
              // won't fire — drop the stale anchor so a future scroll can re-arm.
              if (afterCount === beforeCount) {
                prependAnchor.current = null
              }
            })
          }
        }
      }
    }
    el.addEventListener('scroll', handler, { passive: true })
    return () => el.removeEventListener('scroll', handler)
  }, [loadOlderMessages])

  // Restore scroll position after older messages prepend. We use a layout effect
  // so the DOM patch and scrollTop write happen in the same frame — otherwise
  // the user sees the viewport snap to the top before we correct it.
  useLayoutEffect(() => {
    if (prependAnchor.current === null) return
    const el = scrollContainerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight - prependAnchor.current
    prependAnchor.current = null
  }, [messages])

  // Auto-scroll-to-bottom: keyed on the LAST message id (and streaming text),
  // NOT on messages.length. With pagination, length also grows when older
  // messages are prepended — keying on length would scroll the user to the
  // bottom every time they paged backwards. The last-id check fires only when
  // a new message actually lands at the tail.
  useEffect(() => {
    const last = messages[messages.length - 1]
    const lastKey = last ? (last.id ?? `${last.timestamp}:${last.role}:${last.content.slice(0, 20)}`) : null
    const lastChanged = lastKey !== lastSeenLastIdRef.current
    lastSeenLastIdRef.current = lastKey

    if (justSwitched.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      justSwitched.current = false
    } else if (lastChanged && !userScrolledUp.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior })
    }
  }, [messages, activeConversationId, streaming.text])

  // Search jump-to-message: page backwards until the target is loaded, then
  // scroll it into view. SearchPanel sets `scrollToMessageId`; we clear it
  // here once acted on so a re-trigger of the same id still fires.
  useEffect(() => {
    if (scrollToMessageId === null) return
    const targetId = scrollToMessageId
    setScrollToMessageId(null)

    let cancelled = false
    void (async () => {
      await ensureMessageLoaded(targetId)
      if (cancelled) return
      // Wait one frame for React to commit any newly-prepended rows so the
      // ref map is populated before we try to scroll.
      requestAnimationFrame(() => {
        if (cancelled) return
        const el = messageRefs.current.get(targetId)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          setHighlightedId(targetId)
          setTimeout(() => setHighlightedId(null), 1500)
        }
      })
    })()

    return () => {
      cancelled = true
    }
  }, [scrollToMessageId, setScrollToMessageId, ensureMessageLoaded])

  // Custom context menu — copy selection via Electron shell
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return
      const sel = window.getSelection()?.toString().trim() ?? ''
      if (!sel) return
      e.preventDefault()
      window.api.shell?.showContextMenu(sel, false)
    }
    document.addEventListener('contextmenu', handler)
    return () => document.removeEventListener('contextmenu', handler)
  }, [])

  const isStreaming = streaming.isStreaming || isWaitingForResponse
  const streamingAgent = useMemo(() => {
    if (!isStreaming) return null
    const agents = activeTab?.agents || []
    const named = streaming.currentAgentName ? agents.find((a) => a.name === streaming.currentAgentName) : null
    if (named) {
      return { code: named.name.slice(0, 2).toUpperCase(), name: named.name, color: '#6366f1' }
    }
    return { code: 'CL', name: 'Claude', color: '#6366f1' }
  }, [isStreaming, streaming.currentAgentName, activeTab])

  // Persistent "which agent is working" status for the chat header. Always visible
  // during a turn (independent of scroll position), unlike the inline typing bubble.
  // Restores the pre-v2 Agent Status Bar incl. the "Rate limited, retrying…" state.
  const liveStatus = useMemo(() => {
    if (!isStreaming) return null
    if (streaming.retrying) return { dot: 'dot-warn', text: 'Rate limited, retrying…' }
    const who = streamingAgent?.name || 'Claude'
    if (streaming.isStreaming && streaming.text) return { dot: 'dot-run', text: `${who} is responding…` }
    return { dot: 'dot-run', text: `${who} is thinking…` }
  }, [isStreaming, streaming.retrying, streaming.isStreaming, streaming.text, streamingAgent])

  return (
    <div className="chat-wrap">
      <ChatLeftPanel />

      <div className="chat-col">
        <div className="main-head">
          <div className="main-title">
            <IconChat size={17} style={{ color: 'var(--ink-3)' }} />
            {isRenaming ? (
              <input
                ref={renameInputRef}
                type="text"
                defaultValue={conversationTitle}
                className="rename-input"
                onBlur={(e) => {
                  const next = e.target.value.trim()
                  if (next && next !== conversationTitle && activeConversationId) {
                    void renameConversation(activeConversationId, next)
                  }
                  setIsRenaming(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    ;(e.target as HTMLInputElement).blur()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setIsRenaming(false)
                  }
                }}
              />
            ) : (
              <span
                onDoubleClick={() => activeConversationId && setIsRenaming(true)}
                title="Double-click to rename"
                style={{ cursor: activeConversationId ? 'text' : 'default' }}
              >
                {conversationTitle}
              </span>
            )}
            {activeTab?.projectName && <span className="tag accent">{activeTab.projectName}</span>}
          </div>
          {liveStatus && (
            <span className="chat-status" title={liveStatus.text}>
              {streamingAgent && (
                <span
                  className="cav"
                  style={{ width: 17, height: 17, fontSize: 8.5, borderRadius: 5, background: streamingAgent.color }}
                >
                  {streamingAgent.code}
                </span>
              )}
              <span className={`status-dot ${liveStatus.dot}`} />
              <span className="status-text">{liveStatus.text}</span>
            </span>
          )}
          <div className="main-actions">
            <div className="seg">
              <button type="button" className={mode === 'solo' ? 'on' : ''} onClick={() => setProjectMode('solo')}>Solo</button>
              <button
                type="button"
                className={mode === 'team' ? 'on' : ''}
                disabled={!teamModeUnlocked}
                title={teamModeUnlocked ? undefined : 'Upgrade to Pro to unlock team mode'}
                onClick={() => { if (teamModeUnlocked) setProjectMode('team') }}
              >Team</button>
            </div>
            <Dropdown
              align="right"
              width={220}
              triggerClassName="btn sm ghost icon"
              trigger={<IconDots size={16} />}
              items={[
                {
                  icon: <IconPen size={15} />,
                  label: 'Rename conversation',
                  onClick: () => {
                    if (!activeConversationId) return
                    setIsRenaming(true)
                    // Focus on the next tick so the input renders first
                    requestAnimationFrame(() => {
                      renameInputRef.current?.focus()
                      renameInputRef.current?.select()
                    })
                  },
                },
                {
                  icon: <IconWorkflow size={15} />,
                  label: 'Turn into workflow',
                  kbd: '⌘W',
                  onClick: () => setShowConvertModal(true),
                },
                {
                  icon: <IconCopy size={15} />,
                  label: 'Copy transcript',
                  onClick: () => {
                    const text = messages
                      .filter((m) => m.type === 'text')
                      .map((m) => `${m.role === 'user' ? '> ' : ''}${m.content}`)
                      .join('\n\n')
                    void navigator.clipboard.writeText(text)
                  },
                },
                {
                  icon: <IconExternal size={15} />,
                  label: 'Export as Markdown',
                  onClick: () => {
                    const lines: string[] = [`# ${conversationTitle}`, '']
                    for (const m of messages) {
                      if (m.type === 'text') {
                        lines.push(m.role === 'user' ? '**User:**' : `**${m.agentName || 'Assistant'}:**`, '', m.content, '')
                      } else if (m.type === 'tool_use' && m.toolName) {
                        lines.push(`> Tool: \`${m.toolName}\``, '')
                      }
                    }
                    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `${conversationTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`
                    a.click()
                    URL.revokeObjectURL(url)
                  },
                },
                { sep: true },
                {
                  icon: <IconAgents size={15} />,
                  label: 'Manage agents in room',
                  onClick: () => useAppStore.getState().setActiveView('agents'),
                },
                {
                  icon: <IconTrash size={15} />,
                  label: 'Clear conversation',
                  danger: true,
                  onClick: () => {
                    if (!activeConversationId) return
                    if (window.confirm('Delete this conversation?')) {
                      void deleteConversation(activeConversationId)
                    }
                  },
                },
              ]}
            />
          </div>
        </div>

        {/* Loop banner — persistent stop control across scheduled iterations */}
        {isLoopActive && (
          <div style={{ margin: '8px 18px 0', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--accent-line)', background: 'var(--accent-soft)' }}>
            <div style={{ flex: 1, fontSize: 12, color: 'var(--ink-2)' }}>
              <strong>Loop active.</strong> Stop aborts the current turn.
            </div>
            <button
              type="button"
              className="btn sm"
              style={{ background: 'rgba(251,111,111,0.12)', borderColor: 'rgba(251,111,111,0.3)', color: 'var(--err)' }}
              onClick={() => stopLoop()}
            >
              <IconStop size={12} />
              Stop loop
            </button>
          </div>
        )}

        {/* Workflow suggestion — same store-driven banner as before */}
        {workflowSuggestion && !showConvertModal && (
          <div style={{ margin: '8px 18px 0' }}>
            <WorkflowSuggestionBanner
              suggestion={workflowSuggestion}
              onConvert={() => { setShowConvertModal(true); void dismissWorkflowSuggestion('later') }}
              onDismiss={() => { void dismissWorkflowSuggestion('later') }}
              onNever={
                workflowSuggestion.tier === 'repeated' || workflowSuggestion.tier === 'matched_workflow'
                  ? () => { void dismissWorkflowSuggestion('never') }
                  : undefined
              }
              onRun={
                workflowSuggestion.tier === 'matched_workflow'
                  ? () => {
                      const taskId = workflowSuggestion.taskId
                      void useTaskStore.getState().runTaskWorkflow(taskId, 'manual')
                      void dismissWorkflowSuggestion('later')
                    }
                  : undefined
              }
            />
          </div>
        )}

        <div className="chat-scroll" ref={scrollContainerRef}>
          <div className="chat-inner">
            {/* Conversation loading skeleton */}
            {isLoadingMessages && messages.length === 0 && (
              <div className="chat-loading" aria-label="Loading messages">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="cmsg" style={{ opacity: 0.4 }}>
                    <div className="cav" style={{ background: 'var(--surface-2)' }} />
                    <div className="cbody">
                      <div className="skeleton skeleton-line" style={{ width: '40%' }} />
                      <div className="skeleton skeleton-line" style={{ width: '92%', marginTop: 8 }} />
                      <div className="skeleton skeleton-line" style={{ width: '78%', marginTop: 6 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Older-messages loader — shown above the message list while a
                backwards page is in flight. Thin, low-distraction. */}
            {isLoadingOlder && (
              <div
                aria-label="Loading older messages"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '8px 0',
                  fontSize: 11.5,
                  color: 'var(--muted)',
                }}
              >
                <div className="tdots"><span /><span /><span /></div>
                <span>Loading older messages…</span>
              </div>
            )}

            {(() => {
              // Hide tool_result rows entirely (prototype omits them — the narrative
              // absorbs the result). Then group consecutive same-author messages so
              // a single avatar/header covers an assistant "turn" of text + tools.
              const visible = messages.filter((m) => m.type !== 'tool_result')
              return visible.map((msg, i) => {
                const prev = visible[i - 1]
                const sameAuthor = prev
                  && prev.role === msg.role
                  && (prev.agentName || '') === (msg.agentName || '')
                const closeInTime = prev
                  && msg.timestamp && prev.timestamp
                  && Math.abs(msg.timestamp - prev.timestamp) < 5 * 60_000
                const grouped = !!(sameAuthor && closeInTime)
                const isHighlighted = msg.id != null && msg.id === highlightedId
                return (
                  <div
                    key={msg.id || `msg-${i}`}
                    ref={(el) => {
                      // Track refs for search jump-to-message scrolling. Drop on unmount.
                      if (msg.id == null) return
                      if (el) messageRefs.current.set(msg.id, el)
                      else messageRefs.current.delete(msg.id)
                    }}
                    style={{
                      borderRadius: 8,
                      transition: 'background 0.7s',
                      background: isHighlighted ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                    }}
                  >
                    <MessageBubble
                      message={msg}
                      isLast={i === visible.length - 1}
                      grouped={grouped}
                    />
                  </div>
                )
              })
            })()}

            {/* Streaming partial text — wrapped in .cmsg for visual consistency */}
            {streaming.isStreaming && streaming.text && streamingAgent && (
              <div className="cmsg">
                <div className={'cav avatar'} style={{ background: streamingAgent.color }}>{streamingAgent.code}</div>
                <div className="cbody">
                  <div className="chead">
                    <span className="cname">{streamingAgent.name}</span>
                    <span className="crole">streaming</span>
                  </div>
                  <div className="ctext" style={{ whiteSpace: 'pre-wrap' }}>
                    {streaming.text}
                    <span className="streaming-cursor" />
                  </div>
                </div>
              </div>
            )}

            {/* Queued messages */}
            {messageQueue.length > 0 && messageQueue.map((q, i) => (
              <div key={`q-${i}`} className="cmsg user" style={{ opacity: 0.55 }}>
                <div className="cav" style={{ background: 'linear-gradient(135deg,#f59e0b,#ec4899)' }}>YOU</div>
                <div className="cbody">
                  <div className="chead">
                    <span className="cname">You</span>
                    <span className="ctime">queued</span>
                  </div>
                  <div className="ctext"><p>{q.text}</p></div>
                </div>
              </div>
            ))}

            {/* Typing / thinking indicator — this only renders before the first token,
                so the agent is genuinely thinking. Surfaces the retry state too. */}
            {streamingAgent && !streaming.text && (
              <div className={`agent-typing${streaming.retrying ? ' retrying' : ''}`}>
                <div className="cav" style={{ background: streamingAgent.color }}>{streamingAgent.code}</div>
                <div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 2 }}>
                    {streaming.retrying ? 'Rate limited, retrying…' : `${streamingAgent.name} is thinking…`}
                  </div>
                  <div className="tdots"><span /><span /><span /></div>
                </div>
              </div>
            )}

            {/* Permission request — same banner as before */}
            {permissionRequest && (
              <div style={{ margin: '12px 0' }}>
                <PermissionBanner />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Empty state — no conversation */}
          {!activeConversationId && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: 32, gap: 14 }}>
              <div style={{ width: 60, height: 60, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center' }}>
                <IconChat size={28} style={{ color: 'var(--ink-3)' }} />
              </div>
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', margin: 0 }}>No conversation selected</h3>
                <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
                  Pick one from the left panel, or start a new one
                </p>
              </div>
              <button
                type="button"
                className="btn primary sm"
                onClick={() => { void createConversation() }}
                disabled={!activeProjectPath}
              >
                <IconPlus size={14} /> New conversation
              </button>
            </div>
          )}

          {/* Empty state — conversation exists, no messages */}
          {messages.length === 0 && !streaming.isStreaming && activeConversationId && !isLoadingMessages && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: 32, gap: 12 }}>
              <IconChat size={36} style={{ color: 'var(--faint)' }} />
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', margin: 0 }}>Ready when you are</h3>
                <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>Send a message to start the conversation</p>
              </div>
            </div>
          )}
        </div>

        <ChatComposer mode={mode} />
      </div>

      <ChatAside mode={mode} />

      {showConvertModal && (
        <ConvertConversationModal
          messages={messages}
          conversationId={activeConversationId}
          onClose={() => setShowConvertModal(false)}
        />
      )}
    </div>
  )
}
