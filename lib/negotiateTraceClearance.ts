import { segmentToSegmentMinDistance } from "@tscircuit/math-utils"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import {
  findClearancePath,
  type ClearancePathSearchStats,
} from "./findClearancePath"
import { getNetRepresentatives } from "./getFixedObstacleViolations"
import { REGION_EPSILON } from "./repairRegionGeometry"
import type { Bounds, RepairRoutePoint } from "./repairRegionTypes"

type Span = {
  routeIndex: number
  mutable: boolean
  route: HighDensityRoute
}
type Copper = {
  a: RepairRoutePoint
  b: RepairRoutePoint
  radius: number
  minZ: number
  maxZ: number
  spanIndex: number
  owner: string
  visited: number
  immutable: boolean
}
export type NegotiatedClearanceInput = {
  srj: SimpleRouteJson
  routes: HighDensityRoute[]
  bounds: Bounds
  dirtyRouteIndices: readonly number[]
  isLocked: (routeIndex: number, pointIndex: number) => boolean
  allowLayerChanges: boolean
  traceClearance: number
  viaClearance: number
  /** Physical drill diameter; absent information reserves the copper diameter. */
  viaHoleDiameter?: number
  maxPathSearchNodes: number
  maxPathSearchCalls: number
  onSearch?: (stats: ClearancePathSearchStats) => void
}
export type NegotiatedClearanceResult = {
  routes: HighDensityRoute[]
  pathSearchNodes: number
  pathSearchCalls: number
  unresolvedSpanCount: number
}

function withPoints(
  route: HighDensityRoute,
  points: RepairRoutePoint[],
): HighDensityRoute {
  const vias: HighDensityRoute["vias"] = []
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!,
      b = points[index]!
    if (a.z === b.z || a.toNextSegmentType === "through_obstacle") continue
    if (a.x !== b.x || a.y !== b.y)
      throw new Error("repair04: negotiated via endpoints must coincide")
    if (!vias.some((via): boolean => via.x === b.x && via.y === b.y))
      vias.push({ x: b.x, y: b.y })
  }
  return { ...route, route: points, vias }
}

/**
 * Negotiate space between movable spans while pads and immutable copper stay
 * hard constraints. Temporary track contacts are search state, not accepted
 * repairs; the caller must score and validate the returned routes atomically.
 */
export function negotiateTraceClearance(
  input: NegotiatedClearanceInput,
): NegotiatedClearanceResult {
  for (const value of [input.maxPathSearchNodes, input.maxPathSearchCalls]) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error(
        "repair04: negotiated work budgets must be nonnegative integers",
      )
  }
  if (
    input.viaHoleDiameter !== undefined &&
    (!Number.isFinite(input.viaHoleDiameter) ||
      input.viaHoleDiameter <= 0 ||
      input.routes.some(
        (route): boolean => input.viaHoleDiameter! > route.viaDiameter,
      ))
  )
    throw new Error(
      "repair04: via hole diameter must be positive and fit the copper",
    )
  const inside = (point: RepairRoutePoint): boolean =>
    point.x >= input.bounds.minX - REGION_EPSILON &&
    point.x <= input.bounds.maxX + REGION_EPSILON &&
    point.y >= input.bounds.minY - REGION_EPSILON &&
    point.y <= input.bounds.maxY + REGION_EPSILON
  const spans: Span[] = []
  const byRoute: number[][] = input.routes.map((): number[] => [])
  for (let ri = 0; ri < input.routes.length; ri++) {
    const route = input.routes[ri]!
    const points: RepairRoutePoint[] = route.route
    const anchors = points.flatMap((point, pi): number[] => {
      const previous = points[pi - 1],
        next = points[pi + 1]
      const width = point.traceThickness ?? route.traceThickness
      const widthChanges =
        (previous &&
          (previous.traceThickness ?? route.traceThickness) !== width) ||
        (next && (next.traceThickness ?? route.traceThickness) !== width)
      const fixedVia =
        (previous &&
          previous.z !== point.z &&
          (!input.allowLayerChanges ||
            input.isLocked(ri, pi) ||
            input.isLocked(ri, pi - 1))) ||
        (next &&
          next.z !== point.z &&
          (!input.allowLayerChanges ||
            input.isLocked(ri, pi) ||
            input.isLocked(ri, pi + 1)))
      return pi === 0 ||
        pi === points.length - 1 ||
        input.isLocked(ri, pi) ||
        point.pcb_port_id ||
        point.toNextSegmentType ||
        point.insideJumperPad ||
        widthChanges ||
        fixedVia
        ? [pi]
        : []
    })
    for (let ai = 1; ai < anchors.length; ai++) {
      const fragment = points.slice(anchors[ai - 1], anchors[ai]! + 1)
      const width = fragment[0]!.traceThickness ?? route.traceThickness
      const hasMutableInterior = fragment
        .slice(1)
        .every((point, pi): boolean => {
          const previous = fragment[pi]!
          const x = (previous.x + point.x) / 2
          const y = (previous.y + point.y) / 2
          return (
            x > input.bounds.minX + REGION_EPSILON * 4 &&
            x < input.bounds.maxX - REGION_EPSILON * 4 &&
            y > input.bounds.minY + REGION_EPSILON * 4 &&
            y < input.bounds.maxY - REGION_EPSILON * 4
          )
        })
      const preservesLockedVias = fragment
        .slice(1)
        .every((point, pi): boolean => {
          const previous = fragment[pi]!
          const sourceIndex = anchors[ai - 1]! + pi
          return (
            previous.z === point.z ||
            (!input.isLocked(ri, sourceIndex) &&
              !input.isLocked(ri, sourceIndex + 1))
          )
        })
      const mutable =
        fragment.every(inside) &&
        hasMutableInterior &&
        preservesLockedVias &&
        !route.jumpers?.length &&
        fragment.every(
          (point): boolean =>
            !point.toNextSegmentType &&
            !point.insideJumperPad &&
            (point.traceThickness ?? route.traceThickness) === width,
        ) &&
        (input.allowLayerChanges ||
          fragment.every((point): boolean => point.z === fragment[0]!.z))
      byRoute[ri]!.push(spans.length)
      spans.push({
        routeIndex: ri,
        mutable: Boolean(mutable),
        route: withPoints({ ...route, traceThickness: width }, fragment),
      })
    }
  }
  const current = spans.map((span): HighDensityRoute => span.route)
  const fixed = spans
    .filter((span): boolean => !span.mutable)
    .map((span): HighDensityRoute => span.route)
  const nets = getNetRepresentatives(input.srj, input.routes)
  const owner = (route: HighDensityRoute): string =>
    nets.get(route.connectionName) ?? route.connectionName
  // Span interiors can be displaced, but their fixed anchor sites cannot.
  // Reserve each physical site once even when several same-net branches meet.
  const fixedSites = new Set<string>()
  for (const span of spans) {
    for (const point of [
      span.route.route[0]!,
      span.route.route.at(-1)!,
    ] as RepairRoutePoint[]) {
      const width = point.traceThickness ?? span.route.traceThickness
      const key = `${owner(span.route)}|${point.x}|${point.y}|${point.z}|${width}`
      if (fixedSites.has(key)) continue
      fixedSites.add(key)
      const site = { x: point.x, y: point.y, z: point.z }
      fixed.push({
        ...span.route,
        traceThickness: width,
        route: [site, site],
        vias: [],
      })
    }
  }
  // The normalized penetration kernel integrates to one across a
  // perpendicular crossing. Weight it by the displaced span's routing cost,
  // so crossing a long track does not appear cheaper merely because it is thin.
  const weights = spans.map(({ route }): number => {
    let length = 0
    for (let index = 1; index < route.route.length; index++) {
      const a = route.route[index - 1]!,
        b = route.route[index]!
      length += a.z === b.z ? Math.hypot(a.x - b.x, a.y - b.y) : 1
    }
    return length
  })
  const frozen = new Set<number>()
  const dirty = new Set(input.dirtyRouteIndices)
  const queue: number[] = []
  const queued = new Set<number>()
  const enqueue = (index: number): void => {
    if (queued.has(index) || frozen.has(index) || !spans[index]!.mutable) return
    queued.add(index)
    queue.push(index)
  }
  spans.forEach((span, index): void => {
    if (dirty.has(span.routeIndex)) enqueue(index)
  })
  let pathSearchNodes = 0,
    pathSearchCalls = 0,
    cursor = 0
  while (
    cursor < queue.length &&
    pathSearchNodes < input.maxPathSearchNodes &&
    pathSearchCalls < input.maxPathSearchCalls
  ) {
    const index = queue[cursor++]!
    queued.delete(index)
    const route = current[index]!
    const selectedOwner = owner(route)
    const cells = new Map<number, Map<number, Copper[]>>()
    for (let si = 0; si < spans.length; si++) {
      if (si === index) continue
      const other = current[si]!,
        otherOwner = owner(other)
      for (let pi = 1; pi < other.route.length; pi++) {
        const a = other.route[pi - 1]! as RepairRoutePoint,
          b = other.route[pi]! as RepairRoutePoint
        if (a.toNextSegmentType === "through_obstacle") continue
        // Same-net wires can share copper. Distinct drill holes still require
        // clearance, including holes in otherwise immutable spans.
        const immutable = !spans[si]!.mutable || frozen.has(si)
        if (a.z === b.z && (otherOwner === selectedOwner || immutable)) continue
        const radius =
          (a.z !== b.z
            ? other.viaDiameter
            : Math.max(
                a.traceThickness ?? other.traceThickness,
                b.traceThickness ?? other.traceThickness,
              )) / 2
        const copper: Copper = {
          a,
          b,
          radius,
          minZ: Math.min(a.z, b.z),
          maxZ: Math.max(a.z, b.z),
          spanIndex: si,
          owner: otherOwner,
          visited: 0,
          immutable,
        }
        for (
          let x = Math.floor(Math.min(a.x, b.x) - radius);
          x <= Math.floor(Math.max(a.x, b.x) + radius);
          x++
        ) {
          let column = cells.get(x)
          if (!column) {
            column = new Map()
            cells.set(x, column)
          }
          for (
            let y = Math.floor(Math.min(a.y, b.y) - radius);
            y <= Math.floor(Math.max(a.y, b.y) + radius);
            y++
          ) {
            const bucket = column.get(y)
            if (bucket) bucket.push(copper)
            else column.set(y, [copper])
          }
        }
      }
    }
    let queryId = 0
    const query = (
      a: RepairRoutePoint,
      b: RepairRoutePoint,
    ): Array<{ copper: Copper; ratio: number }> => {
      const via = a.z !== b.z
      const reach =
        (via ? route.viaDiameter : route.traceThickness) / 2 +
        Math.max(input.traceClearance, input.viaClearance)
      const hits: Array<{ copper: Copper; ratio: number }> = []
      const id = ++queryId
      for (
        let x = Math.floor(Math.min(a.x, b.x) - reach);
        x <= Math.floor(Math.max(a.x, b.x) + reach);
        x++
      ) {
        const column = cells.get(x)
        if (!column) continue
        for (
          let y = Math.floor(Math.min(a.y, b.y) - reach);
          y <= Math.floor(Math.max(a.y, b.y) + reach);
          y++
        ) {
          const bucket = column.get(y)
          if (!bucket) continue
          for (const copper of bucket) {
            if (copper.visited === id) continue
            copper.visited = id
            const bothVias = via && copper.minZ !== copper.maxZ
            const sharedLayers =
              copper.minZ <= Math.max(a.z, b.z) &&
              copper.maxZ >= Math.min(a.z, b.z)
            if (!sharedLayers && !bothVias) continue
            if (copper.immutable && !bothVias) continue
            if (
              copper.owner === selectedOwner &&
              (!bothVias || (a.x === copper.a.x && a.y === copper.a.y))
            )
              continue
            const copperDistance =
              (via ? route.viaDiameter : route.traceThickness) / 2 +
              (bothVias ? input.viaClearance : input.traceClearance) +
              copper.radius
            const drillDistance =
              (input.viaHoleDiameter ?? route.viaDiameter) / 2 +
              (input.viaHoleDiameter ?? copper.radius * 2) / 2 +
              input.viaClearance
            // Drill spacing applies even when the connected copper spans do
            // not share layers. Same-net copper may overlap, distinct holes may not.
            const required = bothVias
              ? sharedLayers && copper.owner !== selectedOwner
                ? Math.max(copperDistance, drillDistance)
                : drillDistance
              : copperDistance
            const distance = segmentToSegmentMinDistance(
              a,
              b,
              copper.a,
              copper.b,
            )
            if (distance < required - REGION_EPSILON)
              hits.push({
                copper,
                ratio: (required - distance) / (required * required),
              })
          }
        }
      }
      return hits
    }
    const getAdditionalEdgeCost = (
      a: RepairRoutePoint,
      b: RepairRoutePoint,
    ): number => {
      const x = (a.x + b.x) / 2
      const y = (a.y + b.y) / 2
      if (
        x <= input.bounds.minX + REGION_EPSILON * 4 ||
        x >= input.bounds.maxX - REGION_EPSILON * 4 ||
        y <= input.bounds.minY + REGION_EPSILON * 4 ||
        y >= input.bounds.maxY - REGION_EPSILON * 4
      )
        return Infinity
      const costs = new Map<string, number>()
      for (const { copper, ratio } of query(a, b)) {
        if (copper.owner === selectedOwner || copper.immutable) return Infinity
        costs.set(
          copper.owner,
          Math.max(
            costs.get(copper.owner) ?? 0,
            ratio * weights[copper.spanIndex]!,
          ),
        )
      }
      let total = 0
      for (const cost of costs.values()) total += cost
      return (a.z === b.z ? Math.hypot(a.x - b.x, a.y - b.y) : 1) * total
    }
    const stats: ClearancePathSearchStats = {
      nodesPopped: 0,
      completionReason: "no-path",
    }
    const path = findClearancePath({
      srj: input.srj,
      routes: [...fixed, route],
      routeIndex: fixed.length,
      start: route.route[0]!,
      end: route.route.at(-1)!,
      bounds: input.bounds,
      traceThickness: route.traceThickness,
      traceClearance: input.traceClearance,
      viaClearance: input.viaClearance,
      gridSize: Math.min(0.1, route.traceThickness / 2),
      allowLayerChanges: input.allowLayerChanges,
      maxNodes: input.maxPathSearchNodes - pathSearchNodes,
      stats,
      getAdditionalEdgeCost,
    })
    pathSearchCalls++
    pathSearchNodes += stats.nodesPopped
    input.onSearch?.(stats)
    if (!path) {
      frozen.add(index)
      fixed.push(route)
      continue
    }
    current[index] = withPoints(route, path)
    const conflicts = new Set<number>()
    for (let pi = 1; pi < path.length; pi++)
      for (const { copper } of query(path[pi - 1]!, path[pi]!))
        conflicts.add(copper.spanIndex)
    for (const other of [...conflicts].sort((a, b): number => a - b)) {
      weights[other]!++
      enqueue(other)
    }
    if (conflicts.size) {
      weights[index]!++
      enqueue(index)
    }
  }
  return {
    routes: input.routes.map((route, ri): HighDensityRoute => {
      if (!byRoute[ri]!.length) return route
      const points = byRoute[ri]!.flatMap((si, index): RepairRoutePoint[] =>
        index === 0 ? current[si]!.route : current[si]!.route.slice(1),
      )
      return withPoints(route, points)
    }),
    pathSearchNodes,
    pathSearchCalls,
    unresolvedSpanCount: queued.size + frozen.size,
  }
}
