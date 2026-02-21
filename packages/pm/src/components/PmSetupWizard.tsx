import { useState, useEffect } from 'react'
import { useJiraStore } from '../stores/useJiraStore'
import type { JiraProject, JiraBoard } from '../types'

interface Props {
  onComplete: () => void
}

type WizardStep = 'connect' | 'project' | 'board' | 'done'

export function PmSetupWizard({ onComplete }: Props) {
  const connected = useJiraStore((s) => s.connected)
  const connecting = useJiraStore((s) => s.connecting)
  const error = useJiraStore((s) => s.error)
  const authorize = useJiraStore((s) => s.authorize)
  const projects = useJiraStore((s) => s.projects)
  const boards = useJiraStore((s) => s.boards)
  const loadProjects = useJiraStore((s) => s.loadProjects)
  const loadBoards = useJiraStore((s) => s.loadBoards)
  const loadingBoards = useJiraStore((s) => s.loadingBoards)
  const loadUsers = useJiraStore((s) => s.loadUsers)
  const selectProject = useJiraStore((s) => s.selectProject)
  const selectBoard = useJiraStore((s) => s.selectBoard)
  const saveBoardConfig = useJiraStore((s) => s.saveBoardConfig)
  const tokens = useJiraStore((s) => s.tokens)

  // Start at the right step based on connection state
  const [step, setStep] = useState<WizardStep>(connected ? 'project' : 'connect')
  const [selectedProject, setSelectedProject] = useState<JiraProject | null>(null)
  const [selectedBoardObj, setSelectedBoardObj] = useState<JiraBoard | null>(null)

  useEffect(() => {
    if (connected && step === 'connect') {
      setStep('project')
    }
    if (connected && projects.length === 0) {
      loadProjects()
    }
  }, [connected])

  const handleConnect = async () => {
    await authorize()
  }

  const handleSelectProject = async (project: JiraProject) => {
    setSelectedProject(project)
    selectProject(project.key)
    try {
      await loadBoards(project.key)
    } catch {
      // Boards API failed (scope issue) — skip to JQL mode
    }
    loadUsers(project.key).catch(() => {})
    // If boards loaded, show board step; otherwise auto-skip with JQL mode
    const currentBoards = useJiraStore.getState().boards
    if (currentBoards.length > 0) {
      setStep('board')
    } else {
      // Auto-select JQL mode (boardId=0)
      selectBoard(0, `${project.name} (all issues)`)
      await saveBoardConfig()
      setStep('done')
    }
  }

  const handleSelectBoard = async (board: JiraBoard) => {
    setSelectedBoardObj(board)
    selectBoard(board.id, board.name)
    await saveBoardConfig()
    setStep('done')
  }

  // Skip board selection — use JQL with project key directly
  const handleSkipBoard = async () => {
    if (!selectedProject) return
    // Use a dummy board ID of 0 to signal JQL mode
    selectBoard(0, `${selectedProject.name} (all issues)`)
    await saveBoardConfig()
    setStep('done')
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <div className="max-w-md w-full space-y-6">
        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {(['connect', 'project', 'board', 'done'] as WizardStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                step === s ? 'bg-blue-600 text-white' :
                (['connect', 'project', 'board', 'done'].indexOf(step) > i) ? 'bg-green-600 text-white' :
                'bg-neutral-800 text-neutral-500'
              }`}>
                {(['connect', 'project', 'board', 'done'].indexOf(step) > i) ? '✓' : i + 1}
              </div>
              {i < 3 && <div className="w-8 h-px bg-neutral-700" />}
            </div>
          ))}
        </div>

        {/* Connect step */}
        {step === 'connect' && (
          <div className="text-center space-y-4">
            <h2 className="text-xl font-semibold text-white">Connect to Jira</h2>
            <p className="text-sm text-neutral-400">
              Sign in with your Atlassian account to enable Jira integration.
            </p>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              {connecting ? 'Opening browser...' : 'Sign in with Atlassian'}
            </button>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        )}

        {/* Project selection step */}
        {step === 'project' && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-white text-center">Select Project</h2>
            <p className="text-sm text-neutral-400 text-center">
              Choose the Jira project for this workspace.
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleSelectProject(project)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-neutral-700 hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors text-left"
                >
                  <div className="w-8 h-8 bg-neutral-800 rounded flex items-center justify-center text-xs font-bold text-neutral-300">
                    {project.key.slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-200">{project.name}</p>
                    <p className="text-xs text-neutral-500">{project.key}</p>
                  </div>
                </button>
              ))}
              {projects.length === 0 && (
                <p className="text-sm text-neutral-500 text-center py-4">Loading projects...</p>
              )}
            </div>
          </div>
        )}

        {/* Board selection step */}
        {step === 'board' && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-white text-center">Select Board</h2>
            <p className="text-sm text-neutral-400 text-center">
              Choose the board for {selectedProject?.name}.
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {boards.map((board) => (
                <button
                  key={board.id}
                  onClick={() => handleSelectBoard(board)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-neutral-700 hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors text-left"
                >
                  <div className="text-sm font-medium text-neutral-200">{board.name}</div>
                  <span className="text-xs text-neutral-500 ml-auto">{board.type}</span>
                </button>
              ))}
              {boards.length === 0 && loadingBoards && (
                <p className="text-sm text-neutral-500 text-center py-4">Loading boards...</p>
              )}
              {boards.length === 0 && !loadingBoards && (
                <p className="text-sm text-neutral-500 text-center py-4">No boards found for this project.</p>
              )}
            </div>
            <button
              onClick={handleSkipBoard}
              className="w-full text-center text-xs text-neutral-500 hover:text-neutral-300 py-2 transition-colors"
            >
              Skip — use all project issues
            </button>
          </div>
        )}

        {/* Done step */}
        {step === 'done' && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-green-600/20 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white">All Set!</h2>
            <p className="text-sm text-neutral-400">
              Connected to <span className="text-white">{tokens?.siteName}</span><br />
              Project: <span className="text-white">{selectedProject?.name}</span><br />
              Board: <span className="text-white">{selectedBoardObj?.name}</span>
            </p>
            <button
              onClick={onComplete}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
            >
              Start Working
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
