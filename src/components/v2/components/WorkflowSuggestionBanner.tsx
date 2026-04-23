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
  const accent = isMatched
    ? 'border-emerald-500/30 bg-emerald-500/5'
    : isRepeated
      ? 'border-indigo-500/30 bg-indigo-500/5'
      : 'border-blue-500/20 bg-blue-500/5'
  const iconColor = isMatched ? 'text-emerald-300' : isRepeated ? 'text-indigo-300' : 'text-blue-400'
  const titleColor = isMatched
    ? 'text-emerald-200'
    : isRepeated
      ? 'text-indigo-200'
      : 'text-blue-300'
  const buttonColor = isMatched
    ? 'text-emerald-200 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20'
    : isRepeated
      ? 'text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/10'
      : 'text-blue-400 border-blue-500/30 hover:bg-blue-500/10'

  // ── Primary action ─────────────────────────────────────────────────────────
  // Matched tier: run the workflow (no Pro gate — user already paid once to
  // create it). Other tiers: save-as-task (Pro-gated).
  const primaryLabel = isMatched ? 'Run workflow' : 'Save as Task'
  const primaryIcon = isMatched ? 'lucide:play' : undefined
  const primaryDisabled = isMatched ? !onRun : !isPro
  const primaryOnClick = isMatched ? onRun : isPro ? onConvert : undefined

  return (
    <div className={`mx-4 mt-2 flex items-center gap-3 px-4 py-2.5 rounded-lg border ${accent}`}>
      <Icon icon={iconName} className={`${iconColor} text-sm flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium ${titleColor}`}>{title}</p>
        <p className="text-[10px] text-zinc-500 truncate">{subtitle}</p>
      </div>
      <button
        onClick={primaryOnClick}
        disabled={primaryDisabled}
        className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap flex items-center gap-1.5 ${primaryDisabled ? 'text-zinc-500 border-pilos-border cursor-not-allowed opacity-60' : buttonColor}`}
      >
        {primaryIcon && <Icon icon={primaryIcon} className="text-xs" />}
        {primaryLabel}
        {!isMatched && !isPro && <ProBadge />}
      </button>
      {isMatched && (
        <button
          onClick={isPro ? onConvert : undefined}
          disabled={!isPro}
          title="Save this conversation as a new task instead"
          className={`text-[10px] transition-colors whitespace-nowrap ${isPro ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-600 cursor-not-allowed'}`}
        >
          Save new
        </button>
      )}
      {(isRepeated || isMatched) && onNever && (
        <button
          onClick={onNever}
          title="Never suggest for this pattern"
          className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors whitespace-nowrap"
        >
          Never
        </button>
      )}
      <button
        onClick={onDismiss}
        title="Not now"
        className="text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        <Icon icon="lucide:x" className="text-xs" />
      </button>
    </div>
  )
}
