import { BaseSolver } from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"
import {
  AutoroutingDrcEngine,
  type AutoroutingDrcError,
  type HighDensityRoute,
  type SimplifiedPcbTrace,
} from "high-density-repair03/lib"
import { convertRepairRoutesToTraces } from "./convertRepairRoutesToTraces"
import type { Bounds, RepairRegionInput } from "./repairRegionTypes"
import {
  getSegmentBoundsInterval,
  REGION_EPSILON,
} from "./repairRegionGeometry"
import { getFixedObstacleViolations } from "./getFixedObstacleViolations"
import { normalizeRepairTrace } from "./normalizeRepairTrace"
import { findClearancePath } from "./findClearancePath"
import { getNewViaPadViolations } from "./getNewViaPadViolations"
import { getRepairViaGeometry } from "./getRepairViaGeometry"

type Point = HighDensityRoute["route"][number]
type Candidate = { routeIndex: number; route: HighDensityRoute }
type RepairTarget = { ri: number; pi: number; distance: number; t: number }
type Score = {
  count: number
  severity: number
  errors: AutoroutingDrcError[]
  fixedViolations: Map<string, number>
}
export type Repair04SolverInput = RepairRegionInput & {
  /** Deterministic candidate budget; each step evaluates at most one candidate. */
  maxCandidates?: number
  traceClearance?: number
  viaClearance?: number
  /** Permit layer bridges and general via edits unless movableVias constrains them; defaults to false. */
  allowLayerChanges?: boolean
  /** Search planar paths first (default true); false only changes search order and grants no via permission. */
  traceOnlyFirst?: boolean
  /** Permit selected existing vias to move in XY independently of allowLayerChanges; a nonempty list fixes all other via geometry, counts, spans, and diameters. */
  movableVias?: readonly { routeIndex: number; viaIndex: number }[]
}

function inside(point: Point, bounds: Bounds): boolean {
  return (
    point.x > bounds.minX + REGION_EPSILON * 4 &&
    point.x < bounds.maxX - REGION_EPSILON * 4 &&
    point.y > bounds.minY + REGION_EPSILON * 4 &&
    point.y < bounds.maxY - REGION_EPSILON * 4
  )
}

function rebuildVias(route: HighDensityRoute): HighDensityRoute {
  const vias: HighDensityRoute["vias"] = []
  for (let i = 1; i < route.route.length; i++) {
    const a = route.route[i - 1]!
    const b = route.route[i]!
    if (a.z !== b.z && a.toNextSegmentType !== "through_obstacle") {
      if (a.x !== b.x || a.y !== b.y) {
        throw new Error(
          "repair04: a layer transition must have coincident endpoints",
        )
      }
      if (!vias.some((v) => v.x === b.x && v.y === b.y))
        vias.push({ x: b.x, y: b.y })
    }
  }
  return { ...route, vias }
}

function getViaGeometryKey(route: HighDensityRoute): string {
  const transitions: number[][] = []
  for (let index = 1; index < route.route.length; index++) {
    const before = route.route[index - 1]!
    const after = route.route[index]!
    if (before.z !== after.z && before.toNextSegmentType !== "through_obstacle")
      transitions.push([before.x, before.y, before.z, after.z])
  }
  return JSON.stringify([route.viaDiameter, transitions])
}

/**
 * Local, incremental DRC optimization. Receives only a region and its fixed
 * clearance context. It never fetches or retains an enclosing board.
 */
export class Repair04Solver extends BaseSolver {
  private readonly input: Repair04SolverInput
  private readonly mutableBounds: Bounds
  private readonly engine: AutoroutingDrcEngine
  private readonly fixedTraces: SimplifiedPcbTrace[]
  private routes: HighDensityRoute[]
  private score: Score | null = null
  private candidates: Generator<Candidate> | null = null
  private bestAdjustment: { routes: HighDensityRoute[]; score: Score } | null =
    null
  private readonly lockedPoints: Point[][]
  private evaluated = 0
  private accepted = 0
  private readonly maxCandidates: number

  constructor(input: Repair04SolverInput) {
    super()
    if (!Number.isFinite(input.boundaryMargin) || input.boundaryMargin <= 0) {
      throw new Error("repair04: boundaryMargin must be positive and finite")
    }
    const b = input.bounds
    if (
      ![b.minX, b.maxX, b.minY, b.maxY].every(Number.isFinite) ||
      b.maxX - b.minX < 10 - 1e-8 ||
      b.maxY - b.minY < 10 - 1e-8
    ) {
      throw new Error("repair04: bounds must be finite and at least 10 × 10 mm")
    }
    this.input = structuredClone(input)
    this.routes = structuredClone(input.routes)
    this.fixedTraces = (input.srj.traces ?? []).map((trace) =>
      normalizeRepairTrace(trace, input.srj.minTraceWidth),
    )
    this.mutableBounds = {
      minX: b.minX + input.boundaryMargin,
      minY: b.minY + input.boundaryMargin,
      maxX: b.maxX - input.boundaryMargin,
      maxY: b.maxY - input.boundaryMargin,
    }
    if (
      this.mutableBounds.minX >= this.mutableBounds.maxX ||
      this.mutableBounds.minY >= this.mutableBounds.maxY
    ) {
      throw new Error("repair04: boundary collar leaves no mutable area")
    }
    if (input.lockedPointIndices.length !== input.routes.length) {
      throw new Error("repair04: every route requires a lock mask")
    }
    this.lockedPoints = this.routes.map((route, ri) => {
      if (input.lockedPointIndices[ri]!.length !== route.route.length) {
        throw new Error("repair04: lock mask length must match its route")
      }
      for (let i = 1; i < route.route.length; i++) {
        const interval = getSegmentBoundsInterval(
          route.route[i - 1]!,
          route.route[i]!,
          this.mutableBounds,
        )
        if (interval?.some((t) => t > 1e-8 && t < 1 - 1e-8)) {
          throw new Error(
            "repair04: boundary crossings require fixed cut points; use extractRepairRegion",
          )
        }
      }
      return route.route.filter(
        (p, pi) =>
          input.lockedPointIndices[ri]![pi] ||
          pi === 0 ||
          pi === route.route.length - 1 ||
          p.pcb_port_id ||
          p.insideJumperPad ||
          p.toNextSegmentType ||
          !inside(p, this.mutableBounds),
      )
    })
    for (const selected of input.movableVias ?? []) {
      const route = this.routes[selected.routeIndex]
      const via =
        route &&
        getRepairViaGeometry(route, input.srj.layerCount)[selected.viaIndex]
      if (
        !via ||
        via.pointIndices.some((index): boolean =>
          this.isLocked(selected.routeIndex, route!.route[index]!),
        )
      ) {
        throw new Error(
          "repair04: movable via must identify an unlocked existing via",
        )
      }
    }
    this.maxCandidates = input.maxCandidates ?? 8000
    if (!Number.isInteger(this.maxCandidates) || this.maxCandidates < 1) {
      throw new Error("repair04: maxCandidates must be a positive integer")
    }
    this.MAX_ITERATIONS = this.maxCandidates * 2 + 4
    this.engine = new AutoroutingDrcEngine(input.srj, {
      traceClearance: input.traceClearance ?? 0.1,
      viaClearance: input.viaClearance ?? 0.1,
      includeTraceViaOwnerMetadata: true,
    })
  }

  private evaluate(routes: HighDensityRoute[]): Score {
    const { errors } = this.engine.evaluate([
      ...this.fixedTraces,
      ...convertRepairRoutesToTraces(routes, this.input.srj.layerCount),
    ])
    const fixedViolations = new Map<string, number>()
    for (const violation of getFixedObstacleViolations({
      srj: this.input.srj,
      routes,
      traceClearance: this.input.traceClearance,
      viaClearance: this.input.viaClearance,
    })) {
      fixedViolations.set(violation.key, violation.severity)
      errors.push({
        type: "pcb_trace_error",
        error_type: "pcb_trace_error",
        message: `repair04 fixed obstacle clearance: ${violation.key}`,
        center: violation.center,
        minimum_clearance: violation.severity,
        actual_clearance: 0,
        pcb_trace_id: `repair04_${violation.routeIndex}`,
        pcb_trace_error_id: violation.key,
      })
    }
    // Layer repair must also see existing same-net via-pad defects. The wire
    // checker permits own-pad contact; omitting these can falsely end the
    // search at zero errors. Locked vias remain outside the mutable score.
    for (const violation of getNewViaPadViolations({
      srj: this.input.srj,
      previousRoutes: routes,
      routes,
      viaClearance: this.input.viaClearance,
      includeExistingVias:
        this.input.allowLayerChanges === true && !this.input.movableVias?.length
          ? routes.flatMap(
              (route, routeIndex): { routeIndex: number; viaIndex: number }[] =>
                getRepairViaGeometry(route, this.input.srj.layerCount).flatMap(
                  (
                    via,
                    viaIndex,
                  ): { routeIndex: number; viaIndex: number }[] =>
                    via.pointIndices.every(
                      (index): boolean =>
                        !this.isLocked(routeIndex, route.route[index]!),
                    )
                      ? [{ routeIndex, viaIndex }]
                      : [],
                ),
            )
          : this.input.movableVias,
    })) {
      errors.push({
        type: "pcb_trace_error",
        error_type: "pcb_trace_error",
        message: `repair04 selected existing via pad clearance: ${violation.key}`,
        center: violation.center,
        minimum_clearance: violation.severity,
        actual_clearance: 0,
        pcb_trace_id: `repair04_${violation.routeIndex}`,
        pcb_trace_error_id: violation.key,
      })
    }
    let severity = 0
    for (const error of errors) {
      const gap = /gap: (-?[\d.]+)/.exec(error.message)
      const actual =
        typeof error.actual_clearance === "number"
          ? error.actual_clearance
          : gap
            ? Number(gap[1])
            : null
      const minimum =
        typeof error.minimum_clearance === "number"
          ? error.minimum_clearance
          : 0.1
      severity += actual !== null ? Math.max(0, minimum - actual) : 1
    }
    return { count: errors.length, severity, errors, fixedViolations }
  }

  private isLocked(routeIndex: number, point: Point): boolean {
    return (
      !inside(point, this.mutableBounds) ||
      this.lockedPoints[routeIndex]!.some(
        (p) => p.x === point.x && p.y === point.y,
      )
    )
  }

  private *generateClearanceCandidates(
    targets: RepairTarget[],
    allowLayerChanges: boolean,
  ): Generator<Candidate> {
    // Search complete spans between immutable contacts. A clearance path can
    // navigate several obstacles at once without moving either attachment.
    const searched = new Set<string>()
    for (const { ri, pi } of targets) {
      if (searched.size >= 12) break
      const route = this.routes[ri]!
      const isAnchor = (index: number): boolean => {
        const point = route.route[index]!
        return (
          this.isLocked(ri, point) ||
          (!allowLayerChanges &&
            ((index > 0 && route.route[index - 1]!.z !== point.z) ||
              (index + 1 < route.route.length &&
                route.route[index + 1]!.z !== point.z)))
        )
      }
      let lo = pi - 1,
        hi = pi
      while (lo > 0 && !isAnchor(lo)) lo--
      while (hi < route.route.length - 1 && !isAnchor(hi)) hi++
      const key = `${ri}:${lo}:${hi}`
      if (searched.has(key)) continue
      searched.add(key)
      const a = route.route[lo]!,
        b = route.route[hi]!
      if (a.x === b.x && a.y === b.y) continue
      const inMutableClosure = (p: Point): boolean =>
        p.x >= this.mutableBounds.minX - REGION_EPSILON &&
        p.x <= this.mutableBounds.maxX + REGION_EPSILON &&
        p.y >= this.mutableBounds.minY - REGION_EPSILON &&
        p.y <= this.mutableBounds.maxY + REGION_EPSILON
      if (!inMutableClosure(a) || !inMutableClosure(b)) continue
      const widths = new Set(
        route.route
          .slice(lo, hi + 1)
          .map(
            (p) =>
              (p as Point & { traceThickness?: number }).traceThickness ??
              route.traceThickness,
          ),
      )
      if (widths.size !== 1) continue
      const traceThickness = [...widths][0]!
      const path = findClearancePath({
        allowLayerChanges,
        srj: this.input.srj,
        routes: this.routes,
        routeIndex: ri,
        start: a,
        end: b,
        bounds: this.mutableBounds,
        traceThickness,
        gridSize: traceThickness <= 0.1 ? traceThickness / 2 : 0.1,
        traceClearance: this.input.traceClearance ?? 0.1,
        viaClearance: this.input.viaClearance ?? 0.1,
      })
      if (!path) continue
      yield {
        routeIndex: ri,
        route: rebuildVias({
          ...route,
          route: [
            ...route.route.slice(0, lo),
            ...path,
            ...route.route.slice(hi + 1),
          ],
        }),
      }
    }
  }

  private preservesViaPermissions(
    routeIndex: number,
    route: HighDensityRoute,
  ): boolean {
    const original = this.input.routes[routeIndex]!
    const before = getRepairViaGeometry(original, this.input.srj.layerCount)
    const after = getRepairViaGeometry(route, this.input.srj.layerCount)
    if (
      route.connectionName !== original.connectionName ||
      route.rootConnectionName !== original.rootConnectionName ||
      route.viaDiameter !== original.viaDiameter ||
      before.length !== after.length
    )
      return false
    return before.every((via, viaIndex): boolean => {
      const next = after[viaIndex]!
      if (
        JSON.stringify(via.layerSequence) !==
          JSON.stringify(next.layerSequence) ||
        via.diameter !== next.diameter
      )
        return false
      const allowed = this.input.movableVias?.some(
        (selected): boolean =>
          selected.routeIndex === routeIndex && selected.viaIndex === viaIndex,
      )
      return allowed === true || (via.x === next.x && via.y === next.y)
    })
  }

  private *generateExistingViaCandidates(): Generator<Candidate> {
    for (const selected of this.input.movableVias ?? []) {
      const route = this.routes[selected.routeIndex]!
      const via = getRepairViaGeometry(route, this.input.srj.layerCount)[
        selected.viaIndex
      ]!
      if (
        via.pointIndices.some((index): boolean =>
          this.isLocked(selected.routeIndex, route.route[index]!),
        )
      )
        continue
      for (const amount of [0.025, 0.05, 0.1, 0.2, 0.35, 0.5, 0.8, 1.2]) {
        for (let direction = 0; direction < 16; direction++) {
          const x = via.x + amount * Math.cos((direction * Math.PI) / 8)
          const y = via.y + amount * Math.sin((direction * Math.PI) / 8)
          if (!inside({ x, y, z: via.minZ }, this.mutableBounds)) continue
          const moved = route.route.map(
            (point, index): Point =>
              via.pointIndices.includes(index) ? { ...point, x, y } : point,
          )
          yield {
            routeIndex: selected.routeIndex,
            route: rebuildVias({ ...route, route: moved }),
          }
        }
      }
    }
  }

  private *generateCandidates(): Generator<Candidate> {
    yield* this.generateExistingViaCandidates()
    for (const allowLayerChanges of this.input.allowLayerChanges === true
      ? this.input.traceOnlyFirst === false
        ? [true]
        : [false, true]
      : [false]) {
      let traceCandidates = 0
      for (const candidate of this.generateCandidatesForMode(
        allowLayerChanges,
      )) {
        if (!allowLayerChanges) {
          const previous = this.routes[candidate.routeIndex]!
          if (
            this.input.movableVias?.length
              ? !this.preservesViaPermissions(
                  candidate.routeIndex,
                  candidate.route,
                )
              : getViaGeometryKey(candidate.route) !==
                getViaGeometryKey(previous)
          )
            continue
          if (
            this.input.allowLayerChanges === true &&
            traceCandidates++ >=
              Math.min(512, Math.floor(this.maxCandidates / 4))
          )
            break
        }
        yield candidate
      }
    }
  }

  private *generateCandidatesForMode(
    allowLayerChanges: boolean,
  ): Generator<Candidate> {
    const errors = this.score!.errors
    const locations = errors.flatMap((e) => {
      const center = e.center ?? e.pcb_center
      return center ? [center] : []
    })
    const targets: RepairTarget[] = []
    for (let ri = 0; ri < this.routes.length; ri++) {
      const route = this.routes[ri]!
      if (
        route.jumpers?.length ||
        route.route.some((p) => p.toNextSegmentType || p.insideJumperPad)
      )
        continue
      for (let pi = 1; pi < route.route.length; pi++) {
        const a = route.route[pi - 1]!,
          b = route.route[pi]!
        if (a.toNextSegmentType || a.insideJumperPad || b.insideJumperPad)
          continue
        let distance = Infinity,
          t = 0.5
        const dx = b.x - a.x,
          dy = b.y - a.y,
          length2 = dx * dx + dy * dy
        for (const p of locations) {
          const ct = length2
            ? Math.max(
                0,
                Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2),
              )
            : 0
          const d = Math.hypot(p.x - a.x - ct * dx, p.y - a.y - ct * dy)
          if (d < distance) {
            distance = d
            t = ct
          }
        }
        if (distance < 1.5) targets.push({ ri, pi, distance, t })
      }
    }
    targets.sort(
      (a, b) => a.distance - b.distance || a.ri - b.ri || a.pi - b.pi,
    )
    // Try same-layer paths first, keeping every existing via in place.
    yield* this.generateClearanceCandidates(targets, allowLayerChanges)
    // Replace a short polyline span as a unit, so a dense sequence of tiny
    // segments does not trap the search at a single bend.
    const spanned = new Set<string>()
    for (const { ri, pi } of targets.slice(0, 80)) {
      const route = this.routes[ri]!
      for (const reach of [2, 4, 8, 16]) {
        const lo = Math.max(0, pi - reach),
          hi = Math.min(route.route.length - 1, pi + reach)
        const key = `${ri}:${lo}:${hi}`
        if (spanned.has(key)) continue
        spanned.add(key)
        const a = route.route[lo]!,
          b = route.route[hi]!
        if (
          a.z !== b.z ||
          !inside(a, this.mutableBounds) ||
          !inside(b, this.mutableBounds)
        )
          continue
        if (route.route.slice(lo + 1, hi).some((p) => this.isLocked(ri, p)))
          continue
        const widths = new Set(
          route.route
            .slice(lo, hi + 1)
            .map(
              (p) =>
                (p as Point & { traceThickness?: number }).traceThickness ??
                route.traceThickness,
            ),
        )
        if (widths.size !== 1) continue
        const traceThickness = [...widths][0]!
        const dx = b.x - a.x,
          dy = b.y - a.y,
          length = Math.hypot(dx, dy)
        if (length < 0.1) continue
        yield {
          routeIndex: ri,
          route: rebuildVias({
            ...route,
            route: [...route.route.slice(0, lo + 1), ...route.route.slice(hi)],
          }),
        }
        for (const offset of [0.15, -0.15, 0.35, -0.35, 0.7, -0.7, 1.5, -1.5]) {
          for (const ramp of [0.2, 0]) {
            const left = {
              x: a.x + dx * ramp - (dy / length) * offset,
              y: a.y + dy * ramp + (dx / length) * offset,
              z: a.z,
              traceThickness,
            }
            const right = {
              x: a.x + dx * (1 - ramp) - (dy / length) * offset,
              y: a.y + dy * (1 - ramp) + (dx / length) * offset,
              z: a.z,
              traceThickness,
            }
            if (
              !inside(left, this.mutableBounds) ||
              !inside(right, this.mutableBounds)
            )
              continue
            yield {
              routeIndex: ri,
              route: rebuildVias({
                ...route,
                route: [
                  ...route.route.slice(0, lo + 1),
                  left,
                  right,
                  ...route.route.slice(hi),
                ],
              }),
            }
          }
        }
        if (allowLayerChanges && length > route.viaDiameter * 2 + 0.3) {
          for (let z = 0; z < this.input.srj.layerCount; z++) {
            if (z === a.z) continue
            const left = {
              x: a.x + dx * 0.2,
              y: a.y + dy * 0.2,
              z: a.z,
              traceThickness,
            }
            const right = {
              x: a.x + dx * 0.8,
              y: a.y + dy * 0.8,
              z: a.z,
              traceThickness,
            }
            yield {
              routeIndex: ri,
              route: rebuildVias({
                ...route,
                route: [
                  ...route.route.slice(0, lo + 1),
                  left,
                  { ...left, z },
                  { ...right, z },
                  right,
                  ...route.route.slice(hi),
                ],
              }),
            }
          }
        }
      }
    }
    const movedPoints = new Set<string>()
    for (const { ri, pi, t } of targets) {
      const route = this.routes[ri]!
      const a = route.route[pi - 1]!,
        b = route.route[pi]!
      // Move a via stack atomically, or a free bend, preserving every fixed anchor.
      for (const index of [pi - 1, pi]) {
        const p = route.route[index]!
        const key = `${ri}:${p.x}:${p.y}`
        if (movedPoints.has(key)) continue
        movedPoints.add(key)
        const group = route.route
          .map((q, i) => (q.x === p.x && q.y === p.y ? i : -1))
          .filter((i) => i >= 0)
        if (group.some((i) => this.isLocked(ri, route.route[i]!))) continue
        for (const amount of [0.025, 0.05, 0.1, 0.2, 0.35, 0.5, 0.8, 1.2]) {
          for (let direction = 0; direction < 16; direction++) {
            const dx = amount * Math.cos((direction * Math.PI) / 8)
            const dy = amount * Math.sin((direction * Math.PI) / 8)
            const moved = route.route.map((q, i) =>
              group.includes(i) ? { ...q, x: q.x + dx, y: q.y + dy } : q,
            )
            if (group.some((i) => !inside(moved[i]!, this.mutableBounds)))
              continue
            yield {
              routeIndex: ri,
              route: rebuildVias({ ...route, route: moved }),
            }
          }
        }
      }
      const withinMutableBounds = (p: Point): boolean =>
        p.x >= this.mutableBounds.minX - 1e-8 &&
        p.x <= this.mutableBounds.maxX + 1e-8 &&
        p.y >= this.mutableBounds.minY - 1e-8 &&
        p.y <= this.mutableBounds.maxY + 1e-8
      if (a.z !== b.z || !withinMutableBounds(a) || !withinMutableBounds(b))
        continue
      const dx = b.x - a.x,
        dy = b.y - a.y,
        length = Math.hypot(dx, dy)
      if (length < 0.02) continue
      const traceThickness = Math.max(
        (a as Point & { traceThickness?: number }).traceThickness ??
          route.traceThickness,
        (b as Point & { traceThickness?: number }).traceThickness ??
          route.traceThickness,
      )
      const ux = dx / length,
        uy = dy / length
      // Add a local dogleg without translating either segment endpoint.
      for (const radius of [0.4, 0.8, 1.5, 3]) {
        const start = Math.max(0, t * length - radius),
          end = Math.min(length, t * length + radius)
        for (const offset of [0.12, -0.12, 0.25, -0.25, 0.5, -0.5, 1, -1]) {
          const left = {
            x: a.x + ux * start - uy * offset,
            y: a.y + uy * start + ux * offset,
            z: a.z,
            traceThickness,
          }
          const right = {
            x: a.x + ux * end - uy * offset,
            y: a.y + uy * end + ux * offset,
            z: a.z,
            traceThickness,
          }
          if (
            !inside(left, this.mutableBounds) ||
            !inside(right, this.mutableBounds)
          )
            continue
          yield {
            routeIndex: ri,
            route: {
              ...route,
              route: [
                ...route.route.slice(0, pi),
                left,
                right,
                ...route.route.slice(pi),
              ],
            },
          }
        }
        // A local bridge can resolve an unavoidable crossing on the current layer.
        if (!allowLayerChanges || end - start < route.viaDiameter + 0.15)
          continue
        const left = {
          x: a.x + ux * start,
          y: a.y + uy * start,
          z: a.z,
          traceThickness,
        }
        const right = {
          x: a.x + ux * end,
          y: a.y + uy * end,
          z: a.z,
          traceThickness,
        }
        if (
          !inside(left, this.mutableBounds) ||
          !inside(right, this.mutableBounds)
        )
          continue
        for (let z = 0; z < this.input.srj.layerCount; z++) {
          if (z === a.z) continue
          const points = [left, { ...left, z }, { ...right, z }, right]
          yield {
            routeIndex: ri,
            route: rebuildVias({
              ...route,
              route: [
                ...route.route.slice(0, pi),
                ...points,
                ...route.route.slice(pi),
              ],
            }),
          }
        }
      }
    }
  }

  override _step(): void {
    if (!this.score) {
      this.score = this.evaluate(this.routes)
      this.stats = {
        initialErrorCount: this.score.count,
        finalErrorCount: this.score.count,
        candidates: 0,
        accepted: 0,
      }
      this.candidates = this.generateCandidates()
    }
    if (this.score.count === 0 || this.evaluated >= this.maxCandidates) {
      if (this.bestAdjustment) {
        this.routes = this.bestAdjustment.routes
        this.score = this.bestAdjustment.score
        this.accepted++
        this.bestAdjustment = null
        this.stats = {
          ...this.stats,
          finalErrorCount: this.score.count,
          accepted: this.accepted,
        }
      }
      this.solved = true
      return
    }
    const next = this.candidates!.next()
    if (next.done) {
      if (this.bestAdjustment) {
        this.routes = this.bestAdjustment.routes
        this.score = this.bestAdjustment.score
        this.bestAdjustment = null
        this.accepted++
        this.candidates = this.generateCandidates()
      } else this.solved = true
      return
    }
    // Every generator shares the same physical-via acceptance invariant,
    // including atomic moves that can otherwise collapse neighboring stacks.
    if (
      (this.input.allowLayerChanges !== true ||
        this.input.movableVias?.length) &&
      !this.preservesViaPermissions(next.value.routeIndex, next.value.route)
    )
      return
    const candidate = this.routes.slice()
    candidate[next.value.routeIndex] = next.value.route
    const score = this.evaluate(candidate)
    this.evaluated++
    const preservesViaPadClearance =
      getNewViaPadViolations({
        srj: this.input.srj,
        previousRoutes: this.input.routes,
        routes: candidate,
        viaClearance: this.input.viaClearance,
      }).length === 0
    const preservesFixedObstacles = [...score.fixedViolations].every(
      ([key, severity]) =>
        this.score!.fixedViolations.has(key) &&
        severity <= this.score!.fixedViolations.get(key)! + REGION_EPSILON,
    )
    if (
      preservesViaPadClearance &&
      preservesFixedObstacles &&
      score.count < this.score.count
    ) {
      this.routes = candidate
      this.score = score
      this.accepted++
      this.bestAdjustment = null
      this.candidates = this.generateCandidates()
    } else if (
      preservesFixedObstacles &&
      preservesViaPadClearance &&
      score.count === this.score.count &&
      score.severity <
        (this.bestAdjustment?.score.severity ?? this.score.severity) - 1e-6
    ) {
      // Compare a whole sweep of equal-count proposals before committing, so
      // tiny improvements cannot repeatedly restart and starve later moves.
      this.bestAdjustment = { routes: candidate, score }
    }
    this.stats = {
      ...this.stats,
      finalErrorCount: this.score.count,
      candidates: this.evaluated,
      accepted: this.accepted,
    }
    this.progress = this.evaluated / this.maxCandidates
  }

  override getConstructorParams(): [Repair04SolverInput] {
    return [structuredClone(this.input)]
  }

  override getOutput(): HighDensityRoute[] {
    if (!this.solved || this.failed)
      throw new Error("repair04: getOutput requires a completed solve")
    return structuredClone(this.routes)
  }

  override visualize(): GraphicsObject {
    const b = this.input.bounds
    const inner = this.mutableBounds
    return {
      title: "repair04 — fixed boundary, local copper repair",
      rects: [
        {
          center: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
          width: b.maxX - b.minX,
          height: b.maxY - b.minY,
          stroke: "#64748b",
          fill: "rgba(148,163,184,0.15)",
        },
        {
          center: {
            x: (inner.minX + inner.maxX) / 2,
            y: (inner.minY + inner.maxY) / 2,
          },
          width: inner.maxX - inner.minX,
          height: inner.maxY - inner.minY,
          stroke: "#0891b2",
          fill: "transparent",
        },
        ...this.input.srj.obstacles.map((obstacle) => ({
          center: obstacle.center,
          width: obstacle.width,
          height: obstacle.height,
          ccwRotationDegrees: obstacle.ccwRotationDegrees,
          fill: "rgba(239,68,68,0.22)",
          stroke: "#b91c1c",
          layer: `z${obstacle.layers.map((layer) => (layer === "top" ? 0 : layer === "bottom" ? this.input.srj.layerCount - 1 : Number(layer.slice(5)))).join(",")}`,
        })),
      ],
      lines: this.routes.flatMap((r) =>
        r.route.slice(1).flatMap((p, i) =>
          p.z === r.route[i]!.z
            ? [
                {
                  points: [r.route[i]!, p],
                  strokeColor: p.z === 0 ? "#dc2626" : "rgba(37,99,235,0.65)",
                  strokeWidth:
                    (p as Point & { traceThickness?: number }).traceThickness ??
                    r.traceThickness,
                  ...(p.z === 0 ? {} : { strokeDash: [0.2, 0.12] }),
                  layer: `z${p.z}`,
                },
              ]
            : [],
        ),
      ),
      circles: this.routes.flatMap((r) =>
        r.vias.map((v) => {
          const zs = r.route
            .filter((p) => p.x === v.x && p.y === v.y)
            .map((p) => p.z)
          const min = Math.min(...zs),
            max = Math.max(...zs)
          return {
            center: v,
            radius: r.viaDiameter / 2,
            fill: "rgba(37,99,235,0.65)",
            stroke: "#1e40af",
            layer: `z${Array.from({ length: max - min + 1 }, (_, i) => min + i).join(",")}`,
          }
        }),
      ),
      points: this.lockedPoints
        .flat()
        .map((p) => ({ ...p, color: "#0f172a", layer: `z${p.z}` })),
    }
  }
}
