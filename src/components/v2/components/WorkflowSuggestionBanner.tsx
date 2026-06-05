import { Icon } from '../../common/Icon'
import { useLicenseStore } from '../../../store/useLicenseStore'
import { ProBadge } from '../../common/ProBadge'
import type { WorkflowSuggestion } from '../../../store/useConversationStore'

interface Props {
  suggestion: WorkflowSuggestion
  onConvert: () => void
  onDismiss: () => void
  onNever?: () => void
  /** Required for `matched_workflow` tier — invoked when user hits Run. */
  onRun?: () => void
}

export function WorkflowSuggestionBanner({
  suggestion,
  onConvert,
  onDismiss,
  onNever,
  onRun,
}: Props) {
  const tier = useLicenseStore((s) => s.tier)
  const isPro = tier === 'pro' || tier === 'teams'

  const isMatched = suggestion.tier === 'matched_workflow'
  const isRepeated = suggestion.tier === 'repeated'

  // ── Copy ───────────────────────────────────────────────────────────────────
  let title: string
  let subtitle: string
  if (isMatched) {
    const scorePct = Math.round(suggestion.match.score * 100)
    title = `Run "${suggestion.taskTitle}"?`
    subtitle = `You've done this before (${scorePct}% match) — run the saved workflow (${suggestion.nodeCount} step${suggestion.nodeCount === 1 ? '' : 's'}) instead of redoing it by hand.`
  } else if (isRepeated) {
    const matchCount = suggestion.match.similarConversationIds.length
    const scorePct = Math.round(suggestion.match.score * 100)
    const toolPreview = suggestion.match.commonTools.slice(0, 4).join(', ')
    title = 'Looks like a repeatable workflow'
    subtitle = `You've done this ${matchCount + 1} time${matchCount === 0 ? '' : 's'} (${scorePct}% match)${toolPreview ? ` using ${toolPreview}` : ''}.`
  } else {
    const toolPreview = suggestion.uniqueTools.slice(0, 4).join(', ')
    title = 'Save this as a reusable workflow?'
    subtitle = `This conversation uses ${suggestion.toolCount} tool call${suggestion.toolCount === 1 ? '' : 's'}${toolPreview ? ` (${toolPreview})` : ''} — save it to run again.`
  }

  // ── Visuals ────────────────────────────────────────────────────────────────
  const iconName = isMatched ? 'lucide:play-circle' : isRepeated ? 'lucide:repeat' : 'lucide:sparkles'
  const tileClass = isMatched ? 'msg-tile ok' : 'msg-tile accent'

  // ── Primary action ─────────────────────────────────────────────────────────
  // Matched tier: run the workflow (no Pro gate — user already paid once to
  // create it). Other tiers: save-as-task (Pro-gated).
  const primaryLabel = isMatched ? 'Run workflow' : 'Save as Task'
  const primaryIcon = isMatched ? 'lucide:play' : undefined
  const primaryDisabled = isMatched ? !onRun : !isPro
  const primaryOnClick = isMatched ? onRun : isPro ? onConvert : undefined

  return (
    <div className={tileClass}>
      <div className="msg-tile-head">
        <Icon icon={iconName} style={{ fontSize: 14, color: isMatched ? 'var(--ok)' : 'var(--accent-2)', flexShrink: 0 }} />
        <span>{title}</span>
        <button
          type="button"
          onClick={onDismiss}
          title="Not now"
          className="mini-ico"
          style={{ marginLeft: 'auto', width: 22, height: 22 }}
        >
          <Icon icon="lucide:x" style={{ fontSize: 12 }} />
        </button>
      </div>
      <div className="msg-tile-body" style={{ padding: '8px 12px' }}>
        <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>{subtitle}</p>
      </div>
      <div className="msg-tile-foot">
        <button
          type="button"
          onClick={primaryOnClick}
          disabled={primaryDisabled}
          className={'btn sm' + (isMatched ? ' primary' : '')}
        >
          {primaryIcon && <Icon icon={primaryIcon} style={{ fontSize: 12 }} />}
          {primaryLabel}
          {!isMatched && !isPro && <ProBadge />}
        </button>
        {isMatched && (
          <button
            type="button"
            onClick={isPro ? onConvert : undefined}
            disabled={!isPro}
            title="Save this conversation as a new task instead"
            className="btn sm ghost"
          >
            Save new
          </button>
        )}
        {(isRepeated || isMatched) && onNever && (
          <button
            type="button"
            onClick={onNever}
            title="Never suggest for this pattern"
            className="btn sm ghost"
            style={{ marginLeft: 'auto' }}
          >
            Never
          </button>
        )}
      </div>
    </div>
  )
}
