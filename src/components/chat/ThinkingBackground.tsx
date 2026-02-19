import { useRef, useEffect } from 'react'
import { useNeuralPhase } from '../../hooks/useNeuralPhase'

// --- Helpers ---

function seed(i: number) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

// Smooth ease-in-out for natural transitions
function ease(t: number) {
  return t * t * (3 - 2 * t)
}

// Layered organic drift
function drift(base: number, time: number, freq: number, phase: number, amp: number) {
  return base
    + Math.sin(time * freq + phase) * amp * 0.6
    + Math.sin(time * freq * 1.7 + phase * 2.3) * amp * 0.3
    + Math.sin(time * freq * 0.4 + phase * 0.7) * amp * 0.1
}

// --- Types ---

interface Node {
  x: number; y: number
  r: number; depth: number; phase: number
  driftX: number; driftY: number; fireRate: number
}

interface Edge {
  a: number; b: number; seed: number
}

interface Pt { x: number; y: number }

// --- PILOS letter target positions ---

function generatePilosTargets(nodeCount: number, w: number, h: number): Pt[] {
  // Each letter defined as dot positions in local coords (0-1 height)
  const letters: { pts: Pt[]; width: number }[] = [
    // P — vertical stroke + rounded bump
    { width: 0.55, pts: [
      {x:0, y:0}, {x:0, y:0.2}, {x:0, y:0.4}, {x:0, y:0.6}, {x:0, y:0.8}, {x:0, y:1},
      {x:0.15, y:0}, {x:0.35, y:0}, {x:0.5, y:0.08}, {x:0.5, y:0.2},
      {x:0.5, y:0.32}, {x:0.35, y:0.42}, {x:0.15, y:0.42},
    ]},
    // I — simple vertical
    { width: 0.15, pts: [
      {x:0.075, y:0}, {x:0.075, y:0.2}, {x:0.075, y:0.4},
      {x:0.075, y:0.6}, {x:0.075, y:0.8}, {x:0.075, y:1},
    ]},
    // L — vertical + base
    { width: 0.45, pts: [
      {x:0, y:0}, {x:0, y:0.2}, {x:0, y:0.4}, {x:0, y:0.6}, {x:0, y:0.8}, {x:0, y:1},
      {x:0.15, y:1}, {x:0.3, y:1}, {x:0.45, y:1},
    ]},
    // O — ellipse
    { width: 0.5, pts: (() => {
      const pts: Pt[] = []
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2
        pts.push({ x: 0.25 + Math.cos(a) * 0.23, y: 0.5 + Math.sin(a) * 0.45 })
      }
      return pts
    })()},
    // S — two opposing arcs
    { width: 0.5, pts: (() => {
      const pts: Pt[] = []
      // Top arc curving right-to-left
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI * 0.15 + (i / 5) * Math.PI * 1.15
        pts.push({ x: 0.25 - Math.cos(a) * 0.22, y: 0.24 - Math.sin(a) * 0.2 })
      }
      // Bottom arc curving left-to-right
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI * 0.15 + (i / 5) * Math.PI * 1.15
        pts.push({ x: 0.25 + Math.cos(a) * 0.22, y: 0.76 + Math.sin(a) * 0.2 })
      }
      return pts
    })()},
  ]

  // Layout: compute total width with spacing
  const spacing = 0.18
  const totalW = letters.reduce((s, l) => s + l.width, 0) + spacing * (letters.length - 1)

  // Collect all points with absolute positions
  const allPts: Pt[] = []
  let xOff = 0
  for (const letter of letters) {
    for (const p of letter.pts) {
      allPts.push({ x: p.x + xOff, y: p.y })
    }
    xOff += letter.width + spacing
  }

  // Scale to fit canvas (word height ~22% of canvas, centered)
  const wordH = h * 0.22
  const scale = wordH // since letter height is 1.0
  const scaledW = totalW * scale
  const offX = (w - scaledW) * 0.5
  const offY = (h - wordH) * 0.5

  const targets = allPts.map(p => ({
    x: offX + p.x * scale,
    y: offY + p.y * scale,
  }))

  // Match count to nodeCount
  while (targets.length < nodeCount) {
    const i = targets.length % allPts.length
    targets.push({
      x: targets[i].x + (seed(targets.length * 17) - 0.5) * 4,
      y: targets[i].y + (seed(targets.length * 23) - 0.5) * 4,
    })
  }

  return targets.slice(0, nodeCount)
}

// --- Network builder ---

function buildNetwork(w: number, h: number) {
  const count = Math.max(30, 30 + Math.floor((w * h) / 25000))
  const nodes: Node[] = []

  for (let i = 0; i < count; i++) {
    const margin = 30
    nodes.push({
      x: margin + seed(i * 2) * (w - margin * 2),
      y: margin + seed(i * 2 + 1) * (h - margin * 2),
      r: 1.2 + seed(i * 3) * 2.0,
      depth: 0.3 + seed(i * 4) * 0.7,
      phase: seed(i * 5) * Math.PI * 2,
      driftX: 0.15 + seed(i * 6) * 0.4,
      driftY: 0.12 + seed(i * 7) * 0.35,
      fireRate: 0.5 + seed(i * 8) * 2.0,
    })
  }

  const edges: Edge[] = []
  const maxDist = Math.min(w, h) * 0.28
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x
      const dy = nodes[i].y - nodes[j].y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < maxDist) {
        const prob = 1.0 - dist / maxDist
        if (seed(i * 31 + j * 17) < prob * 0.6) {
          edges.push({ a: i, b: j, seed: seed(i * 13 + j * 29) })
        }
      }
    }
  }

  const targets = generatePilosTargets(nodes.length, w, h)

  return { nodes, edges, targets }
}

// --- Component ---

export function ThinkingBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const netRef = useRef<ReturnType<typeof buildNetwork> | null>(null)
  const sizeRef = useRef({ w: 0, h: 0 })
  const t0 = useRef(performance.now() / 1000)
  const { uniforms, tick } = useNeuralPhase()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const resize = () => {
      const p = canvas.parentElement
      if (!p) return
      const w = Math.max(1, p.clientWidth)
      const h = Math.max(1, p.clientHeight)
      if (sizeRef.current.w !== w || sizeRef.current.h !== h) {
        sizeRef.current = { w, h }
        canvas.width = w
        canvas.height = h
        netRef.current = buildNetwork(w, h)
      }
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement!)
    resize()

    const render = () => {
      tick()
      const u = uniforms.current

      if (!u.shouldAnimate) {
        rafRef.current = requestAnimationFrame(render)
        return
      }

      const { w, h } = sizeRef.current
      const net = netRef.current
      if (!net || w === 0) { rafRef.current = requestAnimationFrame(render); return }

      const now = performance.now() / 1000 - t0.current
      const spd = u.speed
      const inten = u.intensity
      const phase = u.phase
      const pulse = u.pulse
      const amp = Math.min(w, h) * 0.03

      // How much nodes should converge toward PILOS (0 = scattered, 1 = fully formed)
      const formT = ease(Math.min(1, pulse * 1.5))

      ctx.clearRect(0, 0, w, h)

      // --- Compute positions (scattered with drift, lerped toward letter targets) ---
      const pos: Pt[] = []
      for (let i = 0; i < net.nodes.length; i++) {
        const n = net.nodes[i]
        const scattered = {
          x: drift(n.x, now * spd, n.driftX, n.phase, amp),
          y: drift(n.y, now * spd, n.driftY, n.phase * 1.3, amp * 0.8),
        }
        const target = net.targets[i]
        pos.push({
          x: lerp(scattered.x, target.x, formT),
          y: lerp(scattered.y, target.y, formT),
        })
      }

      // --- Draw edges ---
      for (const e of net.edges) {
        const a = pos[e.a], b = pos[e.b]
        const na = net.nodes[e.a], nb = net.nodes[e.b]
        const avgDepth = (na.depth + nb.depth) * 0.5

        // Fade edges out as nodes converge to letters
        const edgeFade = 1 - formT * 0.7

        let alpha = inten * 0.22 * avgDepth * edgeFade

        if (phase > 0.3 && phase < 1.8) {
          const breathe = Math.sin(now * spd * 2.0 + e.seed * 6.28) * 0.5 + 0.5
          alpha += breathe * inten * 0.18 * avgDepth * edgeFade
        }

        const lw = (0.4 + inten * 0.8) * avgDepth

        // Curved connections
        const mx = (a.x + b.x) * 0.5
        const my = (a.y + b.y) * 0.5
        const perpX = -(b.y - a.y) * 0.08 * (e.seed - 0.5)
        const perpY = (b.x - a.x) * 0.08 * (e.seed - 0.5)

        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.quadraticCurveTo(mx + perpX, my + perpY, b.x, b.y)
        ctx.strokeStyle = `rgba(59,130,246,${Math.min(alpha, 0.5)})`
        ctx.lineWidth = lw
        ctx.stroke()

        // Streaming: data pulses
        if (phase > 1.5 && formT < 0.3) {
          for (let pi = 0; pi < 2; pi++) {
            const t = ((now * spd * (0.4 + pi * 0.3) + e.seed * 4.0 + pi * 1.7) % 1 + 1) % 1
            const px = a.x + (b.x - a.x) * t
            const py = a.y + (b.y - a.y) * t
            const pr = 2 + inten * 2

            const grad = ctx.createRadialGradient(px, py, 0, px, py, pr)
            grad.addColorStop(0, `rgba(150,200,255,${inten * 0.6 * avgDepth})`)
            grad.addColorStop(1, 'rgba(150,200,255,0)')
            ctx.beginPath()
            ctx.arc(px, py, pr, 0, Math.PI * 2)
            ctx.fillStyle = grad
            ctx.fill()
          }
        }
      }

      // --- Draw nodes ---
      for (let i = 0; i < net.nodes.length; i++) {
        const n = net.nodes[i]
        const p = pos[i]

        // Neuron firing during thinking
        let fireBright = 0
        if (phase > 0.3 && phase < 2.5 && formT < 0.3) {
          const fireWave = Math.sin(now * n.fireRate * 3.0 + n.phase * 10.0)
          fireBright = Math.max(0, fireWave * fireWave * fireWave) * inten * 0.6
        }

        // During letter formation, all nodes brighten uniformly
        const formBright = formT * 0.5

        const nodeAlpha = inten * n.depth + formBright
        const baseR = n.r * (1 + inten * 0.4) * n.depth
        const breathe = 1 + Math.sin(now * spd * 1.5 + n.phase) * 0.2 * inten * (1 - formT)
        const finalR = baseR * breathe * (1 + formT * 0.3)

        // Outer glow
        const glowR = finalR * (4 + fireBright * 3 + formT * 2)
        const ga = nodeAlpha * 0.3 + fireBright * 0.4 + formBright * 0.3
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR)
        grad.addColorStop(0, `rgba(59,130,246,${Math.min(ga, 0.7)})`)
        grad.addColorStop(0.4, `rgba(59,130,246,${Math.min(ga * 0.4, 0.35)})`)
        grad.addColorStop(1, 'rgba(59,130,246,0)')
        ctx.beginPath()
        ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()

        // Core — brighter white-blue during letter formation
        const coreR = Math.min(nodeAlpha * 0.7 + fireBright * 0.5 + formBright * 0.4, 0.95)
        const coreG = formT > 0.3 ? 190 + Math.floor(formT * 50) : 175
        const coreB = formT > 0.3 ? 255 : 255
        ctx.beginPath()
        ctx.arc(p.x, p.y, finalR, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(120,${coreG},${coreB},${coreR})`
        ctx.fill()
      }

      // --- Subtle flash overlay on completion ---
      if (pulse > 0.7) {
        const flashAlpha = (pulse - 0.7) * 0.15
        ctx.fillStyle = `rgba(80,140,255,${flashAlpha})`
        ctx.fillRect(0, 0, w, h)
      }

      rafRef.current = requestAnimationFrame(render)
    }

    uniforms.current.shouldAnimate = true
    rafRef.current = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  )
}
