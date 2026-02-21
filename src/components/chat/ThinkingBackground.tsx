import { useRef, useEffect } from 'react'
import { useNeuralPhase } from '../../hooks/useNeuralPhase'
import { useConversationStore, type ProcessLogEntry } from '../../store/useConversationStore'

// --- Helpers ---

function seed(i: number) {
    const s = Math.sin(i * 127.1 + 311.7) * 43758.5453
    return s - Math.floor(s)
}

function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t
}

function ease(t: number) {
    return t * t * (3 - 2 * t)
}

function drift(base: number, time: number, freq: number, phase: number, amp: number) {
    return base
        + Math.sin(time * freq + phase) * amp * 0.6
        + Math.sin(time * freq * 1.7 + phase * 2.3) * amp * 0.3
}

// --- Types ---

interface EventDot {
    baseX: number; baseY: number
    color: [number, number, number]
    spawnTime: number
    phase: number
    driftFreq: number
    direction: 'in' | 'out'
    eventType: string
    groupIdx: number
}

interface Pt { x: number; y: number }

// --- Colors (vibrant enough to see clearly) ---

const DOT_COLORS: Record<string, [number, number, number]> = {
    assistant:          [90, 155, 230],
    user:               [75, 195, 125],
    result:             [175, 130, 220],
    system:             [145, 150, 165],
    'session:started':  [60, 195, 150],
    'session:ended':    [215, 145, 70],
    'session:error':    [215, 105, 105],
    rate_limit_event:   [215, 185, 55],
    permission_request: [215, 170, 60],
    startSession:       [55, 195, 210],
    sendMessage:        [55, 195, 210],
}

const DEFAULT_COLOR: [number, number, number] = [110, 120, 140]

// Max dots rendered per event-type group (keeps the canvas readable)
const MAX_DOTS_PER_GROUP = 8

// --- Group layout ---
// Each event type gets its own cluster region on the canvas

const GROUP_POSITIONS: Record<string, { rx: number; ry: number }> = {
    sendMessage:        { rx: 0.15, ry: 0.22 },
    startSession:       { rx: 0.15, ry: 0.55 },
    'session:started':  { rx: 0.15, ry: 0.82 },
    'session:ended':    { rx: 0.85, ry: 0.82 },
    'session:error':    { rx: 0.85, ry: 0.6 },
    user:               { rx: 0.35, ry: 0.3 },
    assistant:          { rx: 0.65, ry: 0.3 },
    result:             { rx: 0.65, ry: 0.7 },
    system:             { rx: 0.5,  ry: 0.12 },
    rate_limit_event:   { rx: 0.5,  ry: 0.88 },
    permission_request: { rx: 0.5,  ry: 0.52 },
}

function groupCenter(eventType: string, w: number, h: number): Pt {
    const known = GROUP_POSITIONS[eventType]
    if (known) return { x: w * known.rx, y: h * known.ry }
    const hash = seed(eventType.length * 7 + eventType.charCodeAt(0) * 13)
    const hash2 = seed(eventType.length * 11 + eventType.charCodeAt(0) * 17)
    return { x: w * (0.15 + hash * 0.7), y: h * (0.15 + hash2 * 0.7) }
}

const MIN_DOT_SPACING = 22 // minimum pixels between dot centers
const MIN_RADIUS = 18      // no dot sits at the exact center — avoids glow stacking

function layoutDotInGroup(localIdx: number, _totalInGroup: number, cx: number, cy: number, _w: number, _h: number): Pt {
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))
    const angle = localIdx * goldenAngle
    const r = MIN_RADIUS + MIN_DOT_SPACING * Math.sqrt(localIdx)
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r }
}

// --- Groups ---

interface GroupInfo {
    eventType: string
    dotIndices: number[]
    cx: number; cy: number
    color: [number, number, number]
}

function rebuildGroups(dots: EventDot[], w: number, h: number): GroupInfo[] {
    const map = new Map<string, number[]>()
    for (let i = 0; i < dots.length; i++) {
        const key = dots[i].eventType
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(i)
    }
    const groups: GroupInfo[] = []
    for (const [eventType, allIndices] of map) {
        // Keep only the most recent dots per group to avoid clutter
        const indices = allIndices.length > MAX_DOTS_PER_GROUP
            ? allIndices.slice(-MAX_DOTS_PER_GROUP)
            : allIndices
        const c = groupCenter(eventType, w, h)
        const color = DOT_COLORS[eventType] || DEFAULT_COLOR
        groups.push({ eventType, dotIndices: indices, cx: c.x, cy: c.y, color })
        for (let li = 0; li < indices.length; li++) {
            const pos = layoutDotInGroup(li, indices.length, c.x, c.y, w, h)
            dots[indices[li]].baseX = pos.x
            dots[indices[li]].baseY = pos.y
            dots[indices[li]].groupIdx = groups.length - 1
        }
    }
    return groups
}

function createDot(entry: ProcessLogEntry, now: number): EventDot {
    return {
        baseX: 0, baseY: 0,
        color: DOT_COLORS[entry.eventType] || DEFAULT_COLOR,
        spawnTime: now,
        phase: seed(now * 1000 + entry.eventType.length) * Math.PI * 2,
        driftFreq: 0.06 + seed(now * 500 + entry.eventType.charCodeAt(0)) * 0.06,
        direction: entry.direction,
        eventType: entry.eventType,
        groupIdx: 0,
    }
}

// --- PILOS letter targets ---
// Returns the fixed set of letter points (not padded to dot count)

function generatePilosPoints(w: number, h: number): Pt[] {
    const letters: { pts: Pt[]; width: number }[] = [
        { width: 0.55, pts: [
                {x:0,y:0},{x:0,y:0.2},{x:0,y:0.4},{x:0,y:0.6},{x:0,y:0.8},{x:0,y:1},
                {x:0.15,y:0},{x:0.35,y:0},{x:0.5,y:0.08},{x:0.5,y:0.2},
                {x:0.5,y:0.32},{x:0.35,y:0.42},{x:0.15,y:0.42},
            ]},
        { width: 0.15, pts: [
                {x:0.075,y:0},{x:0.075,y:0.2},{x:0.075,y:0.4},
                {x:0.075,y:0.6},{x:0.075,y:0.8},{x:0.075,y:1},
            ]},
        { width: 0.45, pts: [
                {x:0,y:0},{x:0,y:0.2},{x:0,y:0.4},{x:0,y:0.6},{x:0,y:0.8},{x:0,y:1},
                {x:0.15,y:1},{x:0.3,y:1},{x:0.45,y:1},
            ]},
        { width: 0.5, pts: (() => {
                const pts: Pt[] = []
                for (let i = 0; i < 12; i++) {
                    const a = (i / 12) * Math.PI * 2 - Math.PI / 2
                    pts.push({ x: 0.25 + Math.cos(a) * 0.23, y: 0.5 + Math.sin(a) * 0.45 })
                }
                return pts
            })()},
        { width: 0.5, pts: (() => {
                const pts: Pt[] = []
                for (let i = 0; i < 6; i++) {
                    const a = -Math.PI * 0.15 + (i / 5) * Math.PI * 1.15
                    pts.push({ x: 0.25 - Math.cos(a) * 0.22, y: 0.24 - Math.sin(a) * 0.2 })
                }
                for (let i = 0; i < 6; i++) {
                    const a = -Math.PI * 0.15 + (i / 5) * Math.PI * 1.15
                    pts.push({ x: 0.25 + Math.cos(a) * 0.22, y: 0.76 + Math.sin(a) * 0.2 })
                }
                return pts
            })()},
    ]
    const spacing = 0.18
    const totalW = letters.reduce((s, l) => s + l.width, 0) + spacing * (letters.length - 1)
    const allPts: Pt[] = []
    let xOff = 0
    for (const letter of letters) {
        for (const p of letter.pts) allPts.push({ x: p.x + xOff, y: p.y })
        xOff += letter.width + spacing
    }
    const wordH = h * 0.22
    const scale = wordH
    const scaledW = totalW * scale
    const offX = (w - scaledW) * 0.5
    const offY = (h - wordH) * 0.5
    return allPts.map(p => ({ x: offX + p.x * scale, y: offY + p.y * scale }))
}

// PILOS particles — small dots emitted from groups that fly to letter positions
interface PilosParticle {
    fromX: number; fromY: number  // group center (origin)
    toX: number; toY: number      // letter position (destination)
    cpX: number; cpY: number      // bezier control point for curved path
    color: [number, number, number]
    delay: number                 // 0..1 — when this particle starts moving within formT
    duration: number              // 0..1 — how much of formT it takes to arrive
}

// Letter point counts: P=13, I=6, L=9, O=12, S=12 → total 52
const LETTER_SIZES = [13, 6, 9, 12, 12]

function createPilosParticles(groups: GroupInfo[], pilosPoints: Pt[]): PilosParticle[] {
    if (groups.length === 0 || pilosPoints.length === 0) return []
    const particles: PilosParticle[] = []

    // Figure out which letter each point belongs to
    const letterStarts: number[] = []
    let acc = 0
    for (const sz of LETTER_SIZES) { letterStarts.push(acc); acc += sz }

    for (let i = 0; i < pilosPoints.length; i++) {
        const g = groups[i % groups.length]
        const target = pilosPoints[i]

        // Determine letter index (0=P, 1=I, 2=L, 3=O, 4=S)
        let letterIdx = 0
        for (let li = LETTER_SIZES.length - 1; li >= 0; li--) {
            if (i >= letterStarts[li]) { letterIdx = li; break }
        }

        // Stagger: each letter gets a window; particles within a letter have slight jitter
        const letterDelay = letterIdx * 0.15          // P=0, I=0.15, L=0.30, O=0.45, S=0.60
        const withinIdx = i - letterStarts[letterIdx]
        const withinCount = LETTER_SIZES[letterIdx]
        const jitter = seed(i * 37 + 11) * 0.08       // small random offset within letter
        const delay = Math.min(letterDelay + (withinIdx / Math.max(withinCount, 1)) * 0.06 + jitter, 0.75)
        const duration = 0.22 + seed(i * 53 + 7) * 0.08  // varied flight time

        // Curved path: control point offset perpendicular to the straight line
        const dx = target.x - g.cx
        const dy = target.y - g.cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        const nx = dist > 0 ? -dy / dist : 0
        const ny = dist > 0 ? dx / dist : 0
        const curveMag = dist * (0.2 + seed(i * 71 + 3) * 0.25) * (seed(i * 19) > 0.5 ? 1 : -1)
        const cpX = (g.cx + target.x) * 0.5 + nx * curveMag
        const cpY = (g.cy + target.y) * 0.5 + ny * curveMag

        particles.push({
            fromX: g.cx, fromY: g.cy,
            toX: target.x, toY: target.y,
            cpX, cpY,
            color: g.color,
            delay,
            duration,
        })
    }
    return particles
}

// --- Within-group links ---

interface Link {
    a: number; b: number
    speed: number
    birthTime: number
}

function buildGroupLinks(groups: GroupInfo[], dots: EventDot[]): Link[] {
    const links: Link[] = []
    for (const g of groups) {
        const ids = g.dotIndices
        if (ids.length < 2) continue
        for (let k = 1; k < ids.length; k++) {
            links.push({
                a: ids[k - 1], b: ids[k],
                speed: 0.12 + seed(ids[k] * 7) * 0.1,
                birthTime: dots[ids[k]].spawnTime,
            })
        }
    }
    return links
}

// --- Conversation flow path ---
// Track the order groups appear to draw inter-group conversation arcs

interface ConversationArc {
    fromGroup: number
    toGroup: number
    birthTime: number
    speed: number
}

function buildConversationArcs(dots: EventDot[], groups: GroupInfo[]): ConversationArc[] {
    const arcs: ConversationArc[] = []
    if (dots.length < 2 || groups.length < 2) return arcs

    // Walk through dots in order — when eventType changes, draw arc between groups
    let lastGroupIdx = dots[0].groupIdx
    for (let i = 1; i < dots.length; i++) {
        const gIdx = dots[i].groupIdx
        if (gIdx !== lastGroupIdx) {
            // Check we haven't already added this exact pair recently
            const alreadyExists = arcs.some(a =>
                a.fromGroup === lastGroupIdx && a.toGroup === gIdx
            )
            if (!alreadyExists) {
                arcs.push({
                    fromGroup: lastGroupIdx,
                    toGroup: gIdx,
                    birthTime: dots[i].spawnTime,
                    speed: 0.08 + seed(i * 31) * 0.06,
                })
            }
            lastGroupIdx = gIdx
        }
    }
    return arcs
}

// --- Component ---

export function ThinkingBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const rafRef = useRef<number>(0)
    const sizeRef = useRef({ w: 0, h: 0 })
    const t0 = useRef(performance.now() / 1000)
    const dotsRef = useRef<EventDot[]>([])
    const linksRef = useRef<Link[]>([])
    const groupsRef = useRef<GroupInfo[]>([])
    const arcsRef = useRef<ConversationArc[]>([])
    const logCountRef = useRef(0)
    const pilosParticlesRef = useRef<PilosParticle[]>([])
    const activeDotSet = useRef<Set<number>>(new Set())
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
            }
        }

        const ro = new ResizeObserver(resize)
        ro.observe(canvas.parentElement!)
        resize()

        const render = () => {
            tick()
            const u = uniforms.current
            const { w, h } = sizeRef.current
            if (w === 0) { rafRef.current = requestAnimationFrame(render); return }

            const now = performance.now() / 1000 - t0.current

            // Sync process logs
            const logs = useConversationStore.getState().processLogs
            if (logs.length > logCountRef.current) {
                for (let i = logCountRef.current; i < logs.length; i++) {
                    dotsRef.current.push(createDot(logs[i], now))
                }
                logCountRef.current = logs.length
                groupsRef.current = rebuildGroups(dotsRef.current, w, h)
                // Build set of active dot indices (capped per group)
                activeDotSet.current = new Set(groupsRef.current.flatMap(g => g.dotIndices))
                linksRef.current = buildGroupLinks(groupsRef.current, dotsRef.current)
                arcsRef.current = buildConversationArcs(dotsRef.current, groupsRef.current)
                const pilosPoints = generatePilosPoints(w, h)
                pilosParticlesRef.current = createPilosParticles(groupsRef.current, pilosPoints)
                u.shouldAnimate = true
            }
            if (logs.length === 0 && logCountRef.current > 0) {
                dotsRef.current = []
                linksRef.current = []
                groupsRef.current = []
                arcsRef.current = []
                logCountRef.current = 0
                pilosParticlesRef.current = []
                activeDotSet.current = new Set()
            }

            const dots = dotsRef.current
            if (dots.length === 0 && !u.shouldAnimate) {
                rafRef.current = requestAnimationFrame(render)
                return
            }

            ctx.clearRect(0, 0, w, h)

            if (dots.length === 0) {
                rafRef.current = requestAnimationFrame(render)
                return
            }

            const spd = u.speed
            const inten = Math.max(u.intensity, 0.1)
            const phase = u.phase
            const pulse = u.pulse
            const driftAmp = Math.min(w, h) * 0.01
            const formT = ease(Math.min(1, pulse * 1.5))
            const groups = groupsRef.current

            // --- Compute positions (dots always stay in their group) ---
            const positions: Pt[] = []
            for (let i = 0; i < dots.length; i++) {
                const d = dots[i]
                positions.push({
                    x: drift(d.baseX, now * spd, d.driftFreq, d.phase, driftAmp),
                    y: drift(d.baseY, now * spd, d.driftFreq * 0.7, d.phase * 1.3, driftAmp * 0.7),
                })
            }

            // ===== 1. CONVERSATION ARCS between groups (unchanged by PILOS) =====
            const arcs = arcsRef.current
            for (const arc of arcs) {
                const gFrom = groups[arc.fromGroup]
                const gTo = groups[arc.toGroup]
                if (!gFrom || !gTo) continue

                const age = now - arc.birthTime
                const buildIn = Math.min(1, age / 1.5)
                if (buildIn <= 0) continue

                const ax = gFrom.cx
                const ay = gFrom.cy
                const bx = gTo.cx
                const by = gTo.cy

                const mx = (ax + bx) * 0.5
                const my = (ay + by) * 0.5
                const dx = bx - ax
                const dy = by - ay
                const dist = Math.sqrt(dx * dx + dy * dy)
                const curveOff = dist * 0.15
                const cpx = mx - (dy / dist) * curveOff
                const cpy = my + (dx / dist) * curveOff

                const arcAlpha = 0.07 * buildIn
                const colFrom = gFrom.color
                const colTo = gTo.color

                const grad = ctx.createLinearGradient(ax, ay, bx, by)
                grad.addColorStop(0, `rgba(${colFrom[0]},${colFrom[1]},${colFrom[2]},${arcAlpha})`)
                grad.addColorStop(1, `rgba(${colTo[0]},${colTo[1]},${colTo[2]},${arcAlpha})`)

                ctx.beginPath()
                ctx.moveTo(ax, ay)
                ctx.quadraticCurveTo(cpx, cpy, ax + (bx - ax) * buildIn, ay + (by - ay) * buildIn)
                ctx.strokeStyle = grad
                ctx.lineWidth = 0.6
                ctx.setLineDash([4, 6])
                ctx.stroke()
                ctx.setLineDash([])

                // Traveling messenger dot between groups
                if (buildIn > 0.4) {
                    const rawT = ((now * arc.speed) % 1 + 1) % 1
                    const t = rawT < 0.5 ? 2 * rawT * rawT : 1 - 2 * (1 - rawT) * (1 - rawT)
                    const omt = 1 - t
                    const tx = omt * omt * ax + 2 * omt * t * cpx + t * t * bx
                    const ty = omt * omt * ay + 2 * omt * t * cpy + t * t * by

                    const cr = Math.round(lerp(colFrom[0], colTo[0], t))
                    const cg = Math.round(lerp(colFrom[1], colTo[1], t))
                    const cb = Math.round(lerp(colFrom[2], colTo[2], t))
                    const travAlpha = 0.5 * buildIn

                    const glowR = 12
                    const tg = ctx.createRadialGradient(tx, ty, 0, tx, ty, glowR)
                    tg.addColorStop(0, `rgba(${cr},${cg},${cb},${travAlpha * 0.5})`)
                    tg.addColorStop(0.3, `rgba(${cr},${cg},${cb},${travAlpha * 0.15})`)
                    tg.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
                    ctx.beginPath()
                    ctx.arc(tx, ty, glowR, 0, Math.PI * 2)
                    ctx.fillStyle = tg
                    ctx.fill()

                    ctx.beginPath()
                    ctx.arc(tx, ty, 2.5, 0, Math.PI * 2)
                    ctx.fillStyle = `rgba(240,245,255,${travAlpha * 0.8})`
                    ctx.fill()
                }
            }

            // ===== 2. WITHIN-GROUP LINKS (unchanged by PILOS) =====
            const links = linksRef.current
            for (const link of links) {
                const pa = positions[link.a]
                const pb = positions[link.b]
                const da = dots[link.a]

                const age = now - link.birthTime
                const buildIn = Math.min(1, age / 1.0)
                if (buildIn <= 0) continue

                const alpha = 0.12 * buildIn

                ctx.beginPath()
                ctx.moveTo(pa.x, pa.y)
                ctx.lineTo(pb.x, pb.y)
                ctx.strokeStyle = `rgba(${da.color[0]},${da.color[1]},${da.color[2]},${alpha})`
                ctx.lineWidth = 0.7
                ctx.stroke()

                // Traveling dot within group
                if (buildIn > 0.3) {
                    const rawT = ((now * link.speed) % 1 + 1) % 1
                    const t = rawT < 0.5 ? 2 * rawT * rawT : 1 - 2 * (1 - rawT) * (1 - rawT)
                    const tx = lerp(pa.x, pb.x, t)
                    const ty = lerp(pa.y, pb.y, t)

                    const col = da.color
                    const travAlpha = 0.3 * buildIn

                    const tg = ctx.createRadialGradient(tx, ty, 0, tx, ty, 5)
                    tg.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${travAlpha * 0.6})`)
                    tg.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`)
                    ctx.beginPath()
                    ctx.arc(tx, ty, 5, 0, Math.PI * 2)
                    ctx.fillStyle = tg
                    ctx.fill()

                    ctx.beginPath()
                    ctx.arc(tx, ty, 1.2, 0, Math.PI * 2)
                    ctx.fillStyle = `rgba(220,225,245,${travAlpha})`
                    ctx.fill()
                }
            }

            // ===== 3. GROUP DOTS (only active/capped dots) =====
            const activeSet = activeDotSet.current
            for (let i = 0; i < dots.length; i++) {
                if (!activeSet.has(i)) continue
                const d = dots[i]
                const p = positions[i]
                const age = now - d.spawnTime
                const [cr, cg, cb] = d.color

                const fadeIn = Math.min(1, age * 2)
                const scaleIn = 1 + Math.max(0, 1 - age * 3) * 0.8

                let pulseBright = 0
                if (phase > 0.3 && phase < 2.5) {
                    const wave = Math.sin(now * (d.driftFreq * 4) + d.phase * 6)
                    pulseBright = Math.max(0, wave) * inten * 0.2
                }

                const dotAlpha = fadeIn * (0.6 + pulseBright)
                const baseR = (3.5 + seed(i * 3) * 2.0) * scaleIn
                const breathe = 1 + Math.sin(now * spd * 0.8 + d.phase) * 0.08
                const r = baseR * breathe

                // Glow
                const glowR = r * (4.0 + pulseBright * 3)
                const ga = dotAlpha * 0.35 + pulseBright * 0.2
                const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR)
                grd.addColorStop(0, `rgba(${cr},${cg},${cb},${Math.min(ga, 0.6)})`)
                grd.addColorStop(0.35, `rgba(${cr},${cg},${cb},${Math.min(ga * 0.3, 0.2)})`)
                grd.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
                ctx.beginPath()
                ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2)
                ctx.fillStyle = grd
                ctx.fill()

                // Core
                const coreAlpha = Math.min(dotAlpha * 0.85 + pulseBright * 0.3, 0.95)
                ctx.beginPath()
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
                ctx.fillStyle = `rgba(${cr},${cg},${cb},${coreAlpha})`
                ctx.fill()

                // Bright center
                ctx.beginPath()
                ctx.arc(p.x, p.y, r * 0.35, 0, Math.PI * 2)
                ctx.fillStyle = `rgba(235,240,255,${fadeIn * 0.45 + pulseBright * 0.3})`
                ctx.fill()
            }

            // ===== 4. PILOS PARTICLES (emitted from groups, fly to letter positions) =====
            if (formT > 0) {
                const particles = pilosParticlesRef.current
                for (let i = 0; i < particles.length; i++) {
                    const pt = particles[i]
                    const [cr, cg, cb] = pt.color

                    // Each particle flies from group center → letter position
                    const px = lerp(pt.fromX, pt.toX, formT)
                    const py = lerp(pt.fromY, pt.toY, formT)

                    // Small particle — 2px core with soft glow
                    const pAlpha = 0.5 + formT * 0.4
                    const pr = 2.0

                    // Glow
                    const glowR = pr * 4
                    const pg = ctx.createRadialGradient(px, py, 0, px, py, glowR)
                    pg.addColorStop(0, `rgba(${cr},${cg},${cb},${pAlpha * 0.4})`)
                    pg.addColorStop(0.4, `rgba(${cr},${cg},${cb},${pAlpha * 0.1})`)
                    pg.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
                    ctx.beginPath()
                    ctx.arc(px, py, glowR, 0, Math.PI * 2)
                    ctx.fillStyle = pg
                    ctx.fill()

                    // Core
                    ctx.beginPath()
                    ctx.arc(px, py, pr, 0, Math.PI * 2)
                    ctx.fillStyle = `rgba(${cr},${cg},${cb},${pAlpha})`
                    ctx.fill()

                    // Bright center
                    ctx.beginPath()
                    ctx.arc(px, py, pr * 0.4, 0, Math.PI * 2)
                    ctx.fillStyle = `rgba(240,245,255,${pAlpha * 0.6})`
                    ctx.fill()
                }
            }

            // --- Soft flash on completion ---
            if (pulse > 0.7) {
                const flashAlpha = (pulse - 0.7) * 0.04
                ctx.fillStyle = `rgba(60,100,180,${flashAlpha})`
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
