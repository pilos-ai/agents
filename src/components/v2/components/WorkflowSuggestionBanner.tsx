import { Icon } from '../../common/Icon'

interface Props {
  onConvert: () => void
  onDismiss: () => void
}

export function WorkflowSuggestionBanner({ onConvert, onDismiss }: Props) {
  return (
    <div className="mx-4 mt-2 flex items-center gap-3 px-4 py-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5">
      <Icon icon="lucide:sparkles" className="text-blue-400 text-sm flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-blue-300 font-medium">This looks like a repeatable workflow</p>
        <p className="text-[10px] text-zinc-500">Save it as a reusable task to run again anytime</p>
      </div>
      <button
        onClick={onConvert}
        className="px-3 py-1 rounded-lg text-xs font-medium text-blue-400 border border-blue-500/30 hover:bg-blue-500/10 transition-colors whitespace-nowrap"
      >
        Save as Task
      </button>
      <button
        onClick={onDismiss}
        className="text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        <Icon icon="lucide:x" className="text-xs" />
      </button>
    </div>
  )
}
