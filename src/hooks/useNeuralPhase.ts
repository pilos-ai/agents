import { useRef, useEffect, useCallback } from 'react'
import { useConversationStore } from '../store/useConversationStore'

export interface NeuralUniforms {
  intensity: number
  phase: number
  speed: number
  pulse: number
  shouldAnimate: boolean
}

interface PhaseTargets {
  intensity: number
  phase: number
  speed: number
}

export function useNeuralPhase() {
  const uniforms = useRef<NeuralUniforms>({
    intensity: 0.05,
    phase: 0,
    speed: 0.2,
    pulse: 0,
    shouldAnimate: false,
  })

  const targets = useRef<PhaseTargets>({
    intensity: 0.05,
    phase: 0,
    speed: 0.2,
  })

  const idleSince = useRef<number>(0)
  const wasStreaming = useRef(false)

  const updateTargets = useCallback(() => {
    const { streaming, isWaitingForResponse } = useConversationStore.getState()
    const { isStreaming, thinking, text } = streaming

    let phase: number
    let intensity: number
    let speed: number

    if (isStreaming && text) {
      // Streaming text
      phase = 2
      intensity = 0.7
      speed = 1.0
    } else if (isStreaming && thinking) {
      // Thinking with content
      phase = 1
      intensity = 0.9
      speed = 1.5
    } else if (isStreaming || isWaitingForResponse) {
      // Waiting, no content yet
      phase = 1
      intensity = 0.6
      speed = 1.2
    } else if (wasStreaming.current) {
      // Just finished
      phase = 3
      intensity = 1.0
      speed = 0.5
      uniforms.current.pulse = 1.0
      wasStreaming.current = false
    } else {
      // Idle
      phase = 0
      intensity = 0.05
      speed = 0.2
    }

    if (isStreaming) {
      wasStreaming.current = true
    }

    targets.current = { phase, intensity, speed }

    // Wake up animation if going active
    if (intensity > 0.05) {
      uniforms.current.shouldAnimate = true
      idleSince.current = 0
    }
  }, [])

  // Subscribe to store changes
  useEffect(() => {
    const unsub = useConversationStore.subscribe(updateTargets)
    updateTargets()
    return unsub
  }, [updateTargets])

  // Called each RAF frame by ThinkingBackground
  const tick = useCallback(() => {
    const u = uniforms.current
    const t = targets.current
    const lerpRate = 0.03

    u.intensity += (t.intensity - u.intensity) * lerpRate
    u.phase += (t.phase - u.phase) * lerpRate * 2
    u.speed += (t.speed - u.speed) * lerpRate

    // Decay pulse — hold at peak ~1.2s then fade ~1.5s
    if (u.pulse > 0.001) {
      if (u.pulse > 0.7) {
        u.pulse -= 0.005   // slow linear descent (hold phase)
      } else {
        u.pulse *= 0.965   // exponential fade out
      }
    } else {
      u.pulse = 0
    }

    // Idle sleep detection
    if (u.intensity < 0.06) {
      if (idleSince.current === 0) {
        idleSince.current = performance.now()
      } else if (performance.now() - idleSince.current > 2000) {
        u.shouldAnimate = false
      }
    } else {
      idleSince.current = 0
    }
  }, [])

  return { uniforms, tick }
}
