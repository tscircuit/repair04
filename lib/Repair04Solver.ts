import { generateThreeRouteCandidates } from "./generateThreeRouteCandidates"
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
import {
  createFixedObstacleViolationEvaluator,
  type FixedObstacleViolation,
} from "./getFixedObstacleViolations"
import { normalizeRepairTrace } from "./normalizeRepairTrace"
import {
  findClearancePath,
  type ClearancePathSearchStats,
} from "./findClearancePath"
import {
  createNewViaPadViolationEvaluator,
  type NewViaPadViolation,
} from "./getNewViaPadViolations"
import {
  getRepairViaGeometry,
  type RepairViaGeometry,
} from "./getRepairViaGeometry"

type Point = HighDensityRoute["route"][number]
type RouteReplacement = { routeIndex: number; route: HighDensityRoute }
type Candidate = RouteReplacement & {
  additionalRoutes?: RouteReplacement[]
  evaluatedScore?: Score
}
type ViaBlockerContext = {
  oldIds?: Set<string>
  oldContacts?: Set<string>
  oldNeighborFixed?: boolean
}
type RepairTarget = { ri: number; pi: number; distance: number; t: number }
type RouteCache = {
  trace?: SimplifiedPcbTrace
  fixedViolations?: FixedObstacleViolation[]
  scoredViaViolations?: NewViaPadViolation[]
  newViaViolations?: NewViaPadViolation[]
}
type Score = {
  count: number
  severity: number
  errors: AutoroutingDrcError[]
  fixedViolations: Map<string, number>
}
export type Repair04SolverInput = RepairRegionInput & {
  /** Deterministic candidate budget; each step evaluates at most one candidate. */
  maxCandidates?: number
  /** Maximum yielded proposals, including permission rejections; cumulative across accepted states. */
  maxCandidateAttempts?: number
  /** Total actual A* heap pops across all searches and accepted states. */
  maxPathSearchNodes?: number
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
  private candidateAttempts = 0
  private pathSearchNodes = 0
  private pathSearchCalls = 0
  private viaBlockerPathSearchCalls = 0
  private coupledPathSearchCalls = 0
  private threeRoutePathSearchCalls = 0
  private threeRoutePathSearchNodes = 0
  // Exact candidates can recur when radii clamp to the same segment endpoints.
  // Scores are valid only while every other route remains in the same state.
  private readonly candidateScores = new Map<string, Score>()
  // Only solver-owned clones and immutable candidate routes enter these caches.
  // A route may occur at multiple indices, so index-dependent IDs stay separate.
  private readonly routeCache = new WeakMap<
    HighDensityRoute,
    Map<number, RouteCache>
  >()
  private readonly fixedObstacleNetContext: HighDensityRoute[]
  private readonly fixedObstacleEvaluator: ReturnType<
    typeof createFixedObstacleViolationEvaluator
  >
  private readonly viaPadEvaluator: ReturnType<
    typeof createNewViaPadViolationEvaluator
  >
  private readonly viaGeometryCache = new WeakMap<
    HighDensityRoute,
    RepairViaGeometry[]
  >()

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
    this.viaPadEvaluator = createNewViaPadViolationEvaluator({
      srj: this.input.srj,
      viaClearance: this.input.viaClearance,
    })
    this.routes = structuredClone(input.routes)
    // Candidate generators preserve route ownership. Retain every alias when
    // checking one route, without repeatedly checking unchanged copper.
    this.fixedObstacleNetContext = this.input.routes.map(
      (route): HighDensityRoute => ({ ...route, route: [] }),
    )
    this.fixedObstacleEvaluator = createFixedObstacleViolationEvaluator({
      srj: this.input.srj,
      routes: this.fixedObstacleNetContext,
      traceClearance: this.input.traceClearance,
      viaClearance: this.input.viaClearance,
    })
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
        // An explicit fixed-metal bridge is indivisible even when its ends
        // occupy different layers. Extraction locks both ends rather than
        // inventing a trace/via cut inside that immutable conductor.
        if (
          route.route[i - 1]!.toNextSegmentType === "through_obstacle" &&
          input.lockedPointIndices[ri]![i - 1] &&
          input.lockedPointIndices[ri]![i]
        )
          continue
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
    for (const name of [
      "maxCandidateAttempts",
      "maxPathSearchNodes",
    ] as const) {
      const limit = input[name]
      if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1))
        throw new Error(`repair04: ${name} must be a positive safe integer`)
    }
    this.maxCandidates = input.maxCandidates ?? 8000
    if (!Number.isInteger(this.maxCandidates) || this.maxCandidates < 1) {
      throw new Error("repair04: maxCandidates must be a positive integer")
    }
    this.MAX_ITERATIONS = this.maxCandidates * 2 + 4
    this.engine = new AutoroutingDrcEngine(this.input.srj, {
      cacheStaticObstacleNetMembership: true,
      cacheImmutableTraceGeometry: true,
      useTransientDynamicQueryMarkers: true,
      useConservativeRectObstaclePrecheck: true,
      traceClearance: input.traceClearance ?? 0.1,
      viaClearance: input.viaClearance ?? 0.1,
      includeTraceViaOwnerMetadata: true,
    })
  }

  private getWorkLimitReason():
    | "candidate-attempt-limit"
    | "path-search-node-limit"
    | null {
    if (
      this.input.maxCandidateAttempts !== undefined &&
      this.candidateAttempts >= this.input.maxCandidateAttempts
    )
      return "candidate-attempt-limit"
    if (
      this.input.maxPathSearchNodes !== undefined &&
      this.pathSearchNodes >= this.input.maxPathSearchNodes
    )
      return "path-search-node-limit"
    return null
  }

  private updateWorkStats(completionReason?: string): void {
    if (
      this.input.maxCandidateAttempts === undefined &&
      this.input.maxPathSearchNodes === undefined
    )
      return
    this.stats = {
      ...this.stats,
      candidateAttempts: this.candidateAttempts,
      pathSearchNodes: this.pathSearchNodes,
      pathSearchCalls: this.pathSearchCalls,
      ...(completionReason === undefined ? {} : { completionReason }),
    }
  }

  private finishSearch(completionReason: string): void {
    if (this.bestAdjustment) {
      this.routes = this.bestAdjustment.routes
      this.candidateScores.clear()
      this.score = this.bestAdjustment.score
      this.accepted++
      this.bestAdjustment = null
      this.stats = {
        ...this.stats,
        finalErrorCount: this.score.count,
        accepted: this.accepted,
      }
    }
    this.updateWorkStats(completionReason)
    this.solved = true
  }

  private getRouteCache(
    routeIndex: number,
    route: HighDensityRoute,
  ): RouteCache {
    let byIndex = this.routeCache.get(route)
    if (!byIndex) {
      byIndex = new Map()
      this.routeCache.set(route, byIndex)
    }
    let cached = byIndex.get(routeIndex)
    if (!cached) {
      cached = {}
      byIndex.set(routeIndex, cached)
    }
    return cached
  }

  private getViaGeometry(route: HighDensityRoute): RepairViaGeometry[] {
    let geometry = this.viaGeometryCache.get(route)
    if (!geometry) {
      geometry = getRepairViaGeometry(route, this.input.srj.layerCount)
      this.viaGeometryCache.set(route, geometry)
    }
    return geometry
  }

  private getViaPadViolations(
    routes: HighDensityRoute[],
    scoreExisting: boolean,
  ): NewViaPadViolation[] {
    // Preserve the guard's validation even for an empty region.
    if (routes.length === 0)
      return this.viaPadEvaluator({
        previousRoutes: [],
        routes: [],
      })
    return routes.flatMap((route, routeIndex): NewViaPadViolation[] => {
      const cache = this.getRouteCache(routeIndex, route)
      const key = scoreExisting ? "scoredViaViolations" : "newViaViolations"
      if (!cache[key]) {
        const includeExistingVias = !scoreExisting
          ? []
          : this.input.allowLayerChanges === true &&
              !this.input.movableVias?.length
            ? this.getViaGeometry(route).flatMap(
                (via, viaIndex): { routeIndex: number; viaIndex: number }[] =>
                  via.pointIndices.every(
                    (index): boolean =>
                      !this.isLocked(routeIndex, route.route[index]!),
                  )
                    ? [{ routeIndex: 0, viaIndex }]
                    : [],
              )
            : (this.input.movableVias ?? [])
                .filter(
                  (selected): boolean => selected.routeIndex === routeIndex,
                )
                .map((selected): { routeIndex: number; viaIndex: number } => ({
                  routeIndex: 0,
                  viaIndex: selected.viaIndex,
                }))
        cache[key] = this.viaPadEvaluator({
          previousRoutes: [
            scoreExisting ? route : this.input.routes[routeIndex]!,
          ],
          routes: [route],
          includeExistingVias,
        }).map(
          (violation): NewViaPadViolation => ({
            ...violation,
            routeIndex,
            key: violation.key.replace(
              "new-via-pad:0:",
              `new-via-pad:${routeIndex}:`,
            ),
          }),
        )
      }
      return cache[key]!
    })
  }

  private getFixedViolations(
    routes: HighDensityRoute[],
  ): FixedObstacleViolation[] {
    if (routes.length === 0) return this.fixedObstacleEvaluator(routes)
    const missing = routes.flatMap((route, routeIndex): number[] =>
      this.getRouteCache(routeIndex, route).fixedViolations === undefined
        ? [routeIndex]
        : [],
    )
    if (missing.length) {
      const context = this.fixedObstacleNetContext.slice()
      for (const routeIndex of missing)
        context[routeIndex] = routes[routeIndex]!
      const violations = this.fixedObstacleEvaluator(context)
      // Prime all initial routes in one check; subsequent candidates normally
      // contain only one uncached route. Never retain rejected candidates.
      for (const routeIndex of missing)
        this.getRouteCache(routeIndex, routes[routeIndex]!).fixedViolations = []
      for (const violation of violations)
        this.getRouteCache(
          violation.routeIndex,
          routes[violation.routeIndex]!,
        ).fixedViolations!.push(violation)
    }
    // The uncached checker visits obstacles, then routes, then wire/via points.
    // Stable sorting restores that exact error order and severity summation.
    return routes
      .flatMap(
        (route, routeIndex): FixedObstacleViolation[] =>
          this.getRouteCache(routeIndex, route).fixedViolations!,
      )
      .sort(
        (a, b): number =>
          a.obstacleIndex - b.obstacleIndex || a.routeIndex - b.routeIndex,
      )
  }

  private evaluate(routes: HighDensityRoute[]): Score {
    const { errors } = this.engine.evaluate([
      ...this.fixedTraces,
      ...routes.map((route, routeIndex): SimplifiedPcbTrace => {
        const cache = this.getRouteCache(routeIndex, route)
        if (!cache.trace) {
          cache.trace = convertRepairRoutesToTraces(
            [route],
            this.input.srj.layerCount,
          )[0]!
          cache.trace.pcb_trace_id = `repair04_${routeIndex}`
        }
        return cache.trace
      }),
    ])
    const fixedViolations = new Map<string, number>()
    for (const violation of this.getFixedViolations(routes)) {
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
    for (const violation of this.getViaPadViolations(routes, true)) {
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

  private *generateTaperedSegmentCandidates(
    targets: RepairTarget[],
  ): Generator<Candidate> {
    // Uniform-width rerouting cannot preserve a taper. Translate a short run of
    // free bends together, keeping each width and both surrounding attachments.
    // At most eight windows, two offsets and eight directions share the normal
    // candidate budget; no path search or additional via permission is needed.
    const searched = new Set<string>()
    for (const { ri, pi } of targets) {
      if (
        !this.score!.errors.some(
          (error): boolean => error.pcb_trace_id === `repair04_${ri}`,
        )
      )
        continue
      const route = this.routes[ri]!
      for (const [lo, hi] of [
        [pi - 2, pi + 1],
        [pi - 2, pi],
        [pi - 1, pi + 1],
        [pi - 1, pi],
      ] as const) {
        if (searched.size >= 8) return
        if (lo <= 0 || hi >= route.route.length - 1) continue
        const key = `${ri}:${lo}:${hi}`
        if (searched.has(key)) continue
        const points = route.route.slice(lo, hi + 1)
        const layer = points[0]!.z
        if (
          !inside(route.route[lo - 1]!, this.mutableBounds) ||
          !inside(route.route[hi + 1]!, this.mutableBounds) ||
          route.route[lo - 1]!.z !== layer ||
          route.route[hi + 1]!.z !== layer ||
          points.some(
            (point): boolean =>
              point.z !== layer ||
              this.isLocked(ri, point) ||
              Boolean(
                (point as Point & { portPointId?: string }).portPointId,
              ) ||
              route.vias.some(
                (via): boolean => via.x === point.x && via.y === point.y,
              ),
          )
        )
          continue
        const widths = new Set(
          points.map(
            (point): number =>
              (point as Point & { traceThickness?: number }).traceThickness ??
              route.traceThickness,
          ),
        )
        if (widths.size < 2) continue
        searched.add(key)
        for (const amount of [0.1, 0.05]) {
          for (let direction = 0; direction < 8; direction++) {
            const dx = amount * Math.cos((direction * Math.PI) / 4)
            const dy = amount * Math.sin((direction * Math.PI) / 4)
            const moved = points.map(
              (point): Point => ({
                ...point,
                x: point.x + dx,
                y: point.y + dy,
              }),
            )
            if (
              moved.some((point): boolean => !inside(point, this.mutableBounds))
            )
              continue
            yield {
              routeIndex: ri,
              route: {
                ...route,
                route: [
                  ...route.route.slice(0, lo),
                  ...moved,
                  ...route.route.slice(hi + 1),
                ],
              },
            }
          }
        }
      }
    }
  }

  private *generateCrossingPairCandidates(): Generator<Candidate> {
    if (this.coupledPathSearchCalls >= 4 || this.getWorkLimitReason()) return
    type Segment = { ri: number; pi: number; a: Point; b: Point }
    const seen = new Set<string>()
    const crossingErrors = this.score!.errors.filter(
      (error) =>
        error.type === "pcb_trace_error" &&
        typeof error.actual_clearance === "number" &&
        error.actual_clearance < 0 &&
        error.center !== undefined,
    )
    for (const error of crossingErrors) {
      const center = error.center!
      const touching: Segment[] = []
      for (let ri = 0; ri < this.routes.length; ri++) {
        const route = this.routes[ri]!
        if (route.jumpers?.length) continue
        for (let pi = 1; pi < route.route.length; pi++) {
          const a = route.route[pi - 1]!,
            b = route.route[pi]!
          const dx = b.x - a.x,
            dy = b.y - a.y
          const length2 = dx * dx + dy * dy
          if (a.z !== b.z || length2 < 1e-12) continue
          const t = ((center.x - a.x) * dx + (center.y - a.y) * dy) / length2
          if (t < 0 || t > 1) continue
          if (
            Math.hypot(center.x - a.x - t * dx, center.y - a.y - t * dy) < 1e-6
          )
            touching.push({ ri, pi, a, b })
        }
      }
      for (let i = 0; i < touching.length; i++) {
        for (let j = i + 1; j < touching.length; j++) {
          let path = touching[i]!,
            block = touching[j]!
          if (path.ri === block.ri || path.a.z !== block.a.z) continue
          const errorId = error.pcb_trace_error_id
          if (
            errorId !== `overlap_repair04_${path.ri}_repair04_${block.ri}` &&
            errorId !== `overlap_repair04_${block.ri}_repair04_${path.ri}`
          )
            continue
          if (this.routes[path.ri]!.vias.length === 0)
            [path, block] = [block, path]
          const pathRoute = this.routes[path.ri]!,
            blockRoute = this.routes[block.ri]!
          if (pathRoute.vias.length === 0 || blockRoute.vias.length !== 0)
            continue
          const pairKey = `${path.ri}:${block.ri}`
          if (seen.has(pairKey)) continue
          seen.add(pairKey)
          let blockLo = block.pi - 1,
            blockHi = block.pi
          while (
            blockLo > 0 &&
            !this.isLocked(block.ri, blockRoute.route[blockLo]!)
          )
            blockLo--
          while (
            blockHi < blockRoute.route.length - 1 &&
            !this.isLocked(block.ri, blockRoute.route[blockHi]!)
          )
            blockHi++
          if (
            blockHi - blockLo > 64 ||
            blockHi - blockLo < 2 ||
            !inside(blockRoute.route[blockLo]!, this.mutableBounds) ||
            !inside(blockRoute.route[blockHi]!, this.mutableBounds)
          )
            continue
          const blockWidth =
            (blockRoute.route[blockLo] as Point & { traceThickness?: number })
              .traceThickness ?? blockRoute.traceThickness
          if (
            blockRoute.route
              .slice(blockLo, blockHi + 1)
              .some(
                (point) =>
                  point.z !== block.a.z ||
                  point.toNextSegmentType ||
                  point.insideJumperPad ||
                  ((point as Point & { traceThickness?: number })
                    .traceThickness ?? blockRoute.traceThickness) !==
                    blockWidth,
              )
          )
            continue
          const vias = this.getViaGeometry(pathRoute)
          const nearest = vias
            .map((via, viaIndex) => ({
              via,
              viaIndex,
              distance: Math.min(
                ...via.pointIndices.map((index) => Math.abs(index - path.pi)),
              ),
            }))
            .sort((a, b) => a.distance - b.distance)[0]
          if (
            !nearest ||
            nearest.via.pointIndices.some((index) =>
              this.isLocked(path.ri, pathRoute.route[index]!),
            ) ||
            (this.input.movableVias?.length &&
              !this.input.movableVias.some(
                (selected) =>
                  selected.routeIndex === path.ri &&
                  selected.viaIndex === nearest.viaIndex,
              ))
          )
            continue
          const lastViaIndex = Math.max(...nearest.via.pointIndices)
          let lo = path.pi - 1
          while (lo > 0 && !this.isLocked(path.ri, pathRoute.route[lo]!)) lo--
          if (lo >= Math.min(...nearest.via.pointIndices)) continue
          const dx = block.b.x - block.a.x, dy = block.b.y - block.a.y
          const axis = Math.abs(dy) >= Math.abs(dx) ? { x: 1, y: 0 } : { x: 0, y: 1 }
          const offset = 2 * (this.input.traceClearance ?? 0.1) + blockWidth
          for (const sign of [-1, 1]) {
            for (const after of [2, 1]) {
              if (this.coupledPathSearchCalls >= 4 || this.getWorkLimitReason()) return
              const hi = lastViaIndex + after
              if (hi >= pathRoute.route.length) continue
              if (pathRoute.route.slice(lo + 1, hi).some((point) => this.isLocked(path.ri, point))) continue
              if (!inside(pathRoute.route[lo]!, this.mutableBounds) || !inside(pathRoute.route[hi]!, this.mutableBounds)) continue
              const width = (pathRoute.route[lo] as Point & { traceThickness?: number }).traceThickness ?? pathRoute.traceThickness
              if (pathRoute.route.slice(lo, hi + 1).some((point) =>
                point.toNextSegmentType || point.insideJumperPad ||
                ((point as Point & { traceThickness?: number }).traceThickness ?? pathRoute.traceThickness) !== width
              )) continue
              const moved: HighDensityRoute = {
                ...blockRoute,
                route: blockRoute.route.map((point, index) => index > blockLo && index < blockHi
                  ? { ...point, x: point.x + sign * axis.x * offset, y: point.y + sign * axis.y * offset }
                  : point),
              }
              if (moved.route.some((point, index) => index > blockLo && index < blockHi && !inside(point, this.mutableBounds))) continue
              const context = this.routes.slice()
              context[block.ri] = moved
              const stats: ClearancePathSearchStats = { nodesPopped: 0, completionReason: "no-path" }
              const maxNodes = Math.min(30000, this.input.maxPathSearchNodes === undefined
                ? 30000 : this.input.maxPathSearchNodes - this.pathSearchNodes)
              if (maxNodes < 1) return
              const found = findClearancePath({
                srj: this.input.srj, routes: context, routeIndex: path.ri,
                start: pathRoute.route[lo]!, end: pathRoute.route[hi]!, bounds: this.mutableBounds,
                traceThickness: width, traceClearance: this.input.traceClearance ?? 0.1,
                viaClearance: this.input.viaClearance ?? 0.1,
                gridSize: width <= 0.1 ? width / 2 : 0.1,
                allowLayerChanges: true, maxNodes, stats,
              })
              this.coupledPathSearchCalls++
              this.pathSearchCalls++
              this.pathSearchNodes += stats.nodesPopped
              this.updateWorkStats()
              if (!found) continue
              const updated = rebuildVias({ ...pathRoute, route: [
                ...pathRoute.route.slice(0, lo), ...found, ...pathRoute.route.slice(hi + 1),
              ] })
              const afterVias = this.getViaGeometry(updated)
              if (afterVias.length !== vias.length || afterVias.some((via, index) =>
                via.diameter !== vias[index]!.diameter ||
                JSON.stringify(via.layerSequence) !== JSON.stringify(vias[index]!.layerSequence)
              )) continue
              yield { routeIndex: path.ri, route: updated, additionalRoutes: [{ routeIndex: block.ri, route: moved }] }
            }
          }
        }
      }
    }
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
      if (this.getWorkLimitReason() === "path-search-node-limit") return
      const searchStats: ClearancePathSearchStats = {
        nodesPopped: 0,
        completionReason: "no-path",
      }
      const path = findClearancePath({
        maxNodes:
          this.input.maxPathSearchNodes === undefined
            ? undefined
            : Math.min(
                30000,
                this.input.maxPathSearchNodes - this.pathSearchNodes,
              ),
        stats: searchStats,
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
      this.pathSearchCalls++
      this.pathSearchNodes += searchStats.nodesPopped
      this.updateWorkStats()
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
    const before = this.getViaGeometry(original)
    const after = this.getViaGeometry(route)
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

  private getIndexedViaIds(
    routeIndex: number,
    route: HighDensityRoute,
    via: RepairViaGeometry,
  ): Set<string> {
    const ids = new Set<string>()
    if (this.getViaGeometry(route).filter((v): boolean =>
      v.x === via.x && v.y === via.y && v.identity === via.identity,
    ).length !== 1) return ids
    const layerName = (z: number): string => z === 0 ? "top" :
      z === this.input.srj.layerCount - 1 ? "bottom" : `inner${z}`
    const keys = new Set<string>()
    for (let i = 1; i < via.layerSequence.length; i++) {
      keys.add(`${via.x},${via.y},${layerName(via.layerSequence[i - 1]!)},${layerName(via.layerSequence[i]!)}`)
    }
    const traces = this.routes.map((current, index): SimplifiedPcbTrace => {
      const cached = this.getRouteCache(index, index === routeIndex ? route : current).trace
      if (!cached) throw new Error("repair04: indexed via mapping requires an evaluated route")
      return cached
    })
    const seen = new Set<string>()
    for (const trace of [...this.fixedTraces, ...traces]) {
      for (const point of trace.route) {
        if (point.route_type !== "via") continue
        const key = `${point.x},${point.y},${point.from_layer},${point.to_layer}`
        if (seen.has(key)) continue
        const id = `via_${seen.size}`
        seen.add(key)
        if (trace === traces[routeIndex] && keys.has(key)) ids.add(id)
      }
    }
    // A coincident earlier fixed/foreign event owns the contact instead.
    return ids.size === keys.size ? ids : new Set<string>()
  }

  private *generateViaBlockerCandidates(
    selected: { routeIndex: number; viaIndex: number },
    candidate: Candidate,
    baselineContext: ViaBlockerContext = {},
  ): Generator<Candidate> {
    if (this.viaBlockerPathSearchCalls >= 4 || this.getWorkLimitReason()) return
    const movedScore = candidate.evaluatedScore
    if (!movedScore || !this.score || candidate.additionalRoutes?.length ||
      candidate.routeIndex !== selected.routeIndex) return
    if (!this.input.movableVias?.some((v): boolean =>
      v.routeIndex === selected.routeIndex && v.viaIndex === selected.viaIndex,
    ) || !this.preservesViaPermissions(selected.routeIndex, candidate.route)) return
    if ([...movedScore.fixedViolations].some(([key, severity]): boolean =>
      !this.score!.fixedViolations.has(key) ||
      severity > this.score!.fixedViolations.get(key)! + REGION_EPSILON,
    )) return
    const original = this.routes[selected.routeIndex]!
    const oldVia = this.getViaGeometry(original)[selected.viaIndex]!
    const movedVia = this.getViaGeometry(candidate.route)[selected.viaIndex]!
    const oldIds = baselineContext.oldIds ??= this.getIndexedViaIds(selected.routeIndex, original, oldVia)
    if (!oldIds.size) return
    const owner = `repair04_${selected.routeIndex}`
    const contactForeign = (error: AutoroutingDrcError, ids: Set<string>): string | undefined => {
      const viaId = error.pcb_via_id
      const foreign = error.pcb_trace_id
      if (error.type !== "pcb_trace_error" || typeof viaId !== "string" ||
        !ids.has(viaId) || typeof foreign !== "string" || foreign === owner ||
        error.pcb_trace_error_id !== `overlap_${foreign}_${viaId}` ||
        !Array.isArray(error.pcb_trace_ids) || error.pcb_trace_ids.length !== 2 ||
        !error.pcb_trace_ids.includes(owner) || !error.pcb_trace_ids.includes(foreign)) return undefined
      return foreign
    }
    const contacts = (errors: AutoroutingDrcError[], ids: Set<string>): Set<string> => {
      const found = new Set<string>()
      for (const error of errors) {
        const foreign = contactForeign(error, ids)
        if (foreign !== undefined) found.add(foreign)
      }
      return found
    }
    const oldContacts = baselineContext.oldContacts ??= contacts(this.score.errors, oldIds)
    if (!oldContacts.size) return
    // This current-copper eligibility is invariant across the selected via's
    // native offsets. Every accepted state starts a new generator context.
    const oldNeighborFixed = baselineContext.oldNeighborFixed ??= this.getFixedViolations(this.routes).some((violation): boolean =>
      violation.kind === "wire" &&
      oldContacts.has(`repair04_${violation.routeIndex}`),
    )
    if (oldNeighborFixed) return
    const movedIds = this.getIndexedViaIds(selected.routeIndex, candidate.route, movedVia)
    if (oldIds.size !== movedIds.size) return
    for (const error of movedScore.errors) {
      const referenced = [error.pcb_via_id,
        ...(Array.isArray(error.pcb_via_ids) ? error.pcb_via_ids : []),
        ...(Array.isArray(error.pcb_pad_ids) ? error.pcb_pad_ids : []),
      ]
      if (referenced.some((id): boolean => typeof id === "string" && movedIds.has(id)) &&
        contactForeign(error, movedIds) === undefined) return
    }
    const newContacts = contacts(movedScore.errors, movedIds)
    if (newContacts.size !== 1 ||
      [...newContacts].some((id): boolean => oldContacts.has(id))) return
    const id = [...newContacts][0]!
    if (!/^repair04_(0|[1-9][0-9]*)$/.test(id)) return
    const routeIndex = Number(id.slice("repair04_".length))
    const route = this.routes[routeIndex]
    if (!route || routeIndex === selected.routeIndex || route.jumpers?.length ||
      route.connectionName === original.connectionName ||
      (route.rootConnectionName && route.rootConnectionName === original.rootConnectionName) ||
      route.route.some((p): boolean => Boolean(p.toNextSegmentType || p.insideJumperPad))) return
    let pi = -1, nearest = Infinity
    for (let i = 1; i < route.route.length; i++) {
      const a = route.route[i - 1]!, b = route.route[i]!
      if (a.z !== b.z || a.z < movedVia.minZ || a.z > movedVia.maxZ) continue
      const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy
      const t = length2 ? Math.max(0, Math.min(1,
        ((movedVia.x - a.x) * dx + (movedVia.y - a.y) * dy) / length2,
      )) : 0
      const distance = Math.hypot(movedVia.x - a.x - t * dx, movedVia.y - a.y - t * dy)
      if (distance < nearest) { nearest = distance; pi = i }
    }
    if (pi < 1) return
    const isAnchor = (index: number): boolean => {
      const point = route.route[index]!
      return this.isLocked(routeIndex, point) ||
        (index > 0 && route.route[index - 1]!.z !== point.z) ||
        (index + 1 < route.route.length && route.route[index + 1]!.z !== point.z)
    }
    let lo = pi - 1, hi = pi
    while (lo > 0 && !isAnchor(lo)) lo--
    while (hi < route.route.length - 1 && !isAnchor(hi)) hi++
    const start = route.route[lo]!, end = route.route[hi]!
    const inMutableClosure = (point: Point): boolean =>
      point.x >= this.mutableBounds.minX - REGION_EPSILON &&
      point.x <= this.mutableBounds.maxX + REGION_EPSILON &&
      point.y >= this.mutableBounds.minY - REGION_EPSILON &&
      point.y <= this.mutableBounds.maxY + REGION_EPSILON
    if (start.z !== end.z || !inMutableClosure(start) || !inMutableClosure(end)) return
    const width = (start as Point & { traceThickness?: number }).traceThickness ?? route.traceThickness
    if (route.route.slice(lo, hi + 1).some((p): boolean =>
      ((p as Point & { traceThickness?: number }).traceThickness ?? route.traceThickness) !== width,
    )) return
    const maxNodes = Math.min(30000, this.input.maxPathSearchNodes === undefined
      ? 30000 : this.input.maxPathSearchNodes - this.pathSearchNodes)
    if (maxNodes < 1) return
    const context = this.routes.slice()
    context[selected.routeIndex] = candidate.route
    const stats: ClearancePathSearchStats = { nodesPopped: 0, completionReason: "no-path" }
    const path = findClearancePath({
      srj: this.input.srj, routes: context, routeIndex,
      start: end, end: start, bounds: this.mutableBounds,
      traceThickness: width, traceClearance: this.input.traceClearance ?? 0.1,
      viaClearance: this.input.viaClearance ?? 0.1,
      gridSize: Math.max(0.025, width / 4), allowLayerChanges: false, maxNodes, stats,
    })
    this.viaBlockerPathSearchCalls++
    this.pathSearchCalls++
    this.pathSearchNodes += stats.nodesPopped
    this.updateWorkStats()
    if (!path) return
    path.reverse()
    const replacement = { ...route, route: [
      ...route.route.slice(0, lo), ...path, ...route.route.slice(hi + 1),
    ] }
    if (getViaGeometryKey(replacement) !== getViaGeometryKey(route)) return
    yield {
      routeIndex: candidate.routeIndex,
      route: candidate.route,
      additionalRoutes: [{ routeIndex, route: replacement }],
    }
  }

  private *generatePadViaCandidates(): Generator<Candidate> {
    if (this.input.allowLayerChanges !== true || this.input.movableVias?.length)
      return
    const seen = new Set<string>()
    for (const contact of this.getViaPadViolations(this.routes, true)) {
      const route = this.routes[contact.routeIndex]!
      const via = this.getViaGeometry(route).find(
        (candidate): boolean =>
          candidate.x === contact.center.x && candidate.y === contact.center.y,
      )
      if (
        !via ||
        via.pointIndices.some((index): boolean =>
          this.isLocked(contact.routeIndex, route.route[index]!),
        )
      )
        continue
      const pad = this.input.srj.obstacles[contact.obstacleIndex]!
      const angle = ((pad.ccwRotationDegrees ?? 0) * Math.PI) / 180
      const cosine = Math.cos(angle)
      const sine = Math.sin(angle)
      const dx = via.x - pad.center.x
      const dy = via.y - pad.center.y
      const localX = dx * cosine + dy * sine
      const localY = -dx * sine + dy * cosine
      const margin =
        via.diameter / 2 +
        Math.max(
          this.input.viaClearance ?? 0.1,
          this.input.srj.defaultObstacleMargin ?? 0,
          this.input.srj.minViaEdgeToPadEdgeClearance ?? 0,
        )
      const halfWidth = pad.width / 2 + margin
      const halfHeight = pad.height / 2 + margin
      // Four envelope faces are direct clearance moves; the common physical
      // guards reject sites that meet another pad or damage fixed copper.
      const sites = [
        [-halfWidth, localY],
        [halfWidth, localY],
        [localX, -halfHeight],
        [localX, halfHeight],
      ]
        .map(([x, y]): Point => ({
          x: pad.center.x + x! * cosine - y! * sine,
          y: pad.center.y + x! * sine + y! * cosine,
          z: via.minZ,
        }))
        .sort(
          (a, b): number =>
            Math.hypot(a.x - via.x, a.y - via.y) -
            Math.hypot(b.x - via.x, b.y - via.y),
        )
      for (const site of sites) {
        const key = `${contact.routeIndex}:${via.identity}:${site.x}:${site.y}`
        if (seen.has(key) || !inside(site, this.mutableBounds)) continue
        seen.add(key)
        yield {
          routeIndex: contact.routeIndex,
          route: rebuildVias({
            ...route,
            route: route.route.map((point, index): Point =>
              via.pointIndices.includes(index)
                ? { ...point, x: site.x, y: site.y }
                : point,
            ),
          }),
        }
      }
    }
  }

  private *generateExistingViaCandidates(): Generator<Candidate> {
    for (const selected of this.input.movableVias ?? []) {
      const route = this.routes[selected.routeIndex]!
      const via = this.getViaGeometry(route)[selected.viaIndex]!
      if (
        via.pointIndices.some((index): boolean =>
          this.isLocked(selected.routeIndex, route.route[index]!),
        )
      )
        continue
      const context: ViaBlockerContext = {}
      for (const amount of [0.025, 0.05, 0.1, 0.2, 0.35, 0.5, 0.8, 1.2]) {
        for (let direction = 0; direction < 16; direction++) {
          const x = via.x + amount * Math.cos((direction * Math.PI) / 8)
          const y = via.y + amount * Math.sin((direction * Math.PI) / 8)
          if (!inside({ x, y, z: via.minZ }, this.mutableBounds)) continue
          const moved = route.route.map(
            (point, index): Point =>
              via.pointIndices.includes(index) ? { ...point, x, y } : point,
          )
          const candidate = {
            routeIndex: selected.routeIndex,
            route: rebuildVias({ ...route, route: moved }),
          }
          yield candidate
          // Shared _step has already scored this rejected move. Its cache is
          // discarded with any accepted geometry, so no extra DRC pass is needed.
          yield* this.generateViaBlockerCandidates(selected, candidate, context)
        }
      }
    }
  }

  private *generateCandidates(): Generator<Candidate> {
    yield* this.generatePadViaCandidates()
    yield* this.generateExistingViaCandidates()
    for (const allowLayerChanges of this.input.allowLayerChanges === true
      ? this.input.traceOnlyFirst === false
        ? [true]
        : [false, true]
      : [false]) {
      if (this.getWorkLimitReason() === "path-search-node-limit") return
      const planarLimit = this.input.allowLayerChanges === true
        ? Math.min(512, Math.floor(this.maxCandidates / 4))
        : Number.MAX_SAFE_INTEGER
      if (!allowLayerChanges && planarLimit === 0) continue
      let traceCandidates = 0
      for (const candidate of this.generateCandidatesForMode(
        allowLayerChanges,
      )) {
        if (!allowLayerChanges) {
          const replacements = [candidate, ...(candidate.additionalRoutes ?? [])]
          if (replacements.some(({ routeIndex, route }): boolean =>
            this.input.movableVias?.length
              ? !this.preservesViaPermissions(routeIndex, route)
              : getViaGeometryKey(route) !==
                getViaGeometryKey(this.routes[routeIndex]!),
          )) continue
          if (traceCandidates++ >= planarLimit) break
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
      if (!center) return []
      // Known indexed contacts belong to their named local routes. Other
      // contacts (for example via pairs) retain geometric localization.
      const ids = new Set([
        e.pcb_trace_id,
        ...(Array.isArray(e.pcb_trace_ids) ? e.pcb_trace_ids : []),
        ...(typeof e.pcb_trace_error_id === "string" ? e.pcb_trace_error_id.match(/repair04_\d+/g) ?? [] : []),
      ].filter((id): id is string => typeof id === "string" && /^repair04_\d+$/.test(id)))
      return [{ ...center, ids }]
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
          if (p.ids.size && !p.ids.has(`repair04_${ri}`)) continue
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
    if (this.threeRoutePathSearchCalls < 18 && !this.getWorkLimitReason()) {
      const replacements = generateThreeRouteCandidates({
        srj: this.input.srj, routes: this.routes, bounds: this.mutableBounds,
        violations: this.getFixedViolations(this.routes),
        isLocked: (ri, pi): boolean => this.isLocked(ri, this.routes[ri]!.route[pi]!),
        traceClearance: this.input.traceClearance ?? 0.1,
        viaClearance: this.input.viaClearance ?? 0.1,
        maxSearchCalls: 18 - this.threeRoutePathSearchCalls,
        remainingNodes: (): number => Math.min(
          500000 - this.threeRoutePathSearchNodes,
          this.input.maxPathSearchNodes === undefined ? Number.MAX_SAFE_INTEGER : this.input.maxPathSearchNodes - this.pathSearchNodes,
        ),
        onSearch: (stats): void => {
          this.threeRoutePathSearchCalls++
          this.threeRoutePathSearchNodes += stats.nodesPopped
          this.pathSearchCalls++
          this.pathSearchNodes += stats.nodesPopped
          this.updateWorkStats()
        },
      })
      for (const [first, ...additionalRoutes] of replacements) {
        if (first) yield { ...first, additionalRoutes }
      }
    }
    if (allowLayerChanges) yield* this.generateCrossingPairCandidates()
    yield* this.generateTaperedSegmentCandidates(targets)
    // Try same-layer paths first, keeping every existing via in place.
    yield* this.generateClearanceCandidates(targets, allowLayerChanges)
    if (this.getWorkLimitReason() === "path-search-node-limit") return
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
      this.updateWorkStats()
    }
    const workLimitReason = this.getWorkLimitReason()
    if (
      this.score.count === 0 ||
      this.evaluated >= this.maxCandidates ||
      workLimitReason
    ) {
      this.finishSearch(
        this.score.count === 0
          ? "clean"
          : this.evaluated >= this.maxCandidates
            ? "candidate-limit"
            : workLimitReason!,
      )
      return
    }
    const next = this.candidates!.next()
    if (next.done) {
      const exhausted = this.getWorkLimitReason()
      if (exhausted) {
        this.finishSearch(exhausted)
        return
      }
      if (this.bestAdjustment) {
        this.routes = this.bestAdjustment.routes
        this.candidateScores.clear()
        this.score = this.bestAdjustment.score
        this.bestAdjustment = null
        this.accepted++
        this.candidates = this.generateCandidates()
      } else {
        this.updateWorkStats("search-exhausted")
        this.solved = true
      }
      return
    }
    this.candidateAttempts++
    this.updateWorkStats()
    // Every generator shares the same physical-via acceptance invariant,
    // including atomic moves that can otherwise collapse neighboring stacks.
    const replacements = [next.value, ...(next.value.additionalRoutes ?? [])]
    if (
      (this.input.allowLayerChanges !== true || this.input.movableVias?.length) &&
      replacements.some(({ routeIndex, route }) => !this.preservesViaPermissions(routeIndex, route))
    ) return
    const candidate = this.routes.slice()
    for (const { routeIndex, route } of replacements) candidate[routeIndex] = route
    // Validate candidate copper even when the mandatory via-pad guard rejects
    // it. Rejected proposals cannot be accepted, so avoid rebuilding indexed DRC.
    const fixedViolations = new Map<string, number>()
    for (const violation of this.getFixedViolations(candidate)) {
      fixedViolations.set(violation.key, violation.severity)
    }
    const preservesFixedObstacles = [...fixedViolations].every(
      ([key, severity]): boolean =>
        this.score!.fixedViolations.has(key) &&
        severity <= this.score!.fixedViolations.get(key)! + REGION_EPSILON,
    )
    const preservesViaPadClearance =
      this.getViaPadViolations(candidate, false).length === 0
    let score: Score | undefined
    if (preservesViaPadClearance && preservesFixedObstacles) {
      const candidateKey = JSON.stringify([
        next.value.routeIndex,
        next.value.route,
        ...(next.value.additionalRoutes ?? []),
      ])
      score = this.candidateScores.get(candidateKey)
      if (!score) {
        score = this.evaluate(candidate)
        if (this.candidateScores.size >= 128)
          this.candidateScores.delete(this.candidateScores.keys().next().value!)
        this.candidateScores.set(candidateKey, score)
      }
    }
    next.value.evaluatedScore = score
    this.evaluated++
    if (
      score &&
      preservesViaPadClearance &&
      preservesFixedObstacles &&
      score.count < this.score.count
    ) {
      this.routes = candidate
      this.candidateScores.clear()
      this.score = score
      this.accepted++
      this.bestAdjustment = null
      this.candidates = this.generateCandidates()
    } else if (
      score &&
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
