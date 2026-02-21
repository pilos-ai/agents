import type { PmApi, PmDependencies } from '../types'

let _api: PmApi | null = null
let _getProjectPath: (() => string) | null = null
let _setActiveView: ((view: string) => void) | null = null
let _unsubProjectPath: (() => void) | null = null

export function initPmStores(deps: PmDependencies): void {
  _api = deps.api
  _getProjectPath = deps.getProjectPath
  _setActiveView = deps.setActiveView

  // Wire project-path subscription (for Jira store reset on project switch)
  if (_unsubProjectPath) _unsubProjectPath()
  _unsubProjectPath = deps.subscribeProjectPath(onProjectChange)
}

export function getApi(): PmApi {
  if (!_api) throw new Error('@pilos/agents-pm: initPmStores() not called')
  return _api
}

export function getProjectPath(): string {
  if (!_getProjectPath) throw new Error('@pilos/agents-pm: initPmStores() not called')
  return _getProjectPath()
}

export function getSetActiveView(): (view: string) => void {
  if (!_setActiveView) throw new Error('@pilos/agents-pm: initPmStores() not called')
  return _setActiveView
}

// Called when the active project path changes — imported by useJiraStore init
let _onProjectChangeHandler: ((path: string | null) => void) | null = null

export function setOnProjectChange(handler: (path: string | null) => void): void {
  _onProjectChangeHandler = handler
}

function onProjectChange(projectPath: string | null): void {
  if (_onProjectChangeHandler) {
    _onProjectChangeHandler(projectPath)
  }
}
