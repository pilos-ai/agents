import type { StoryCriterion } from '../types'

interface Props {
  criteria: StoryCriterion[]
  analyzing: boolean
  onAnalyze: () => void
}

export function CoveragePanel({ criteria, analyzing, onAnalyze }: Props) {
  const covered = criteria.filter((c) => c.isCovered).length
  const total = criteria.length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-neutral-300">Coverage Analysis</h4>
        <button
          onClick={onAnalyze}
          disabled={analyzing || total === 0}
          className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-md transition-colors"
        >
          {analyzing ? 'Analyzing...' : 'Analyze Coverage'}
        </button>
      </div>

      {total > 0 && (
        <div className="text-xs text-neutral-500">
          {covered}/{total} criteria covered ({total > 0 ? Math.round((covered / total) * 100) : 0}%)
        </div>
      )}

      <div className="space-y-2">
        {criteria.map((criterion) => (
          <div
            key={criterion.id}
            className={`p-2.5 rounded-lg border ${
              criterion.isCovered
                ? 'border-green-500/20 bg-green-500/5'
                : 'border-neutral-800 bg-neutral-900/50'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className={`mt-0.5 text-xs ${criterion.isCovered ? 'text-green-400' : 'text-neutral-600'}`}>
                {criterion.isCovered ? '✓' : '○'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-neutral-200">{criterion.description}</p>
                {criterion.coveredExplanation && (
                  <p className="text-xs text-neutral-500 mt-1">{criterion.coveredExplanation}</p>
                )}
                {criterion.coveredFiles && criterion.coveredFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {criterion.coveredFiles.map((file, i) => (
                      <span key={i} className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                        {file}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
