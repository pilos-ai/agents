export async function loadPmModule(): Promise<typeof import('@pilos/agents-pm') | null> {
  try {
    const mod = await import('@pilos/agents-pm')
    return mod
  } catch {
    return null
  }
}
