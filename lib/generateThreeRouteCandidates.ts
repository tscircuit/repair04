import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import {
  findClearancePath,
  type ClearancePathSearchStats,
} from "./findClearancePath"
import type { FixedObstacleViolation } from "./getFixedObstacleViolations"
import type { Bounds, RepairRoutePoint } from "./repairRegionTypes"

type Span = {
  ri: number
  a: number
  b: number
  z: number
  width: number
  distance: number
  viaEnds: number
}
type Replacement = { routeIndex: number; route: HighDensityRoute }
type Input = {
  srj: SimpleRouteJson
  routes: HighDensityRoute[]
  bounds: Bounds
  violations: readonly FixedObstacleViolation[]
  isLocked: (routeIndex: number, pointIndex: number) => boolean
  traceClearance: number
  viaClearance: number
  maxSearchCalls: number
  remainingNodes: () => number
  onSearch: (stats: ClearancePathSearchStats) => void
}

/** Restore every removed span before yielding an atomic same-layer candidate. */
export function* generateThreeRouteCandidates(
  input: Input,
): Generator<Replacement[]> {
  const { routes } = input
  const violations = input.violations
    .filter((v): boolean => v.kind === "wire")
    .sort(
      (a, b): number =>
        b.severity - a.severity ||
        a.routeIndex - b.routeIndex ||
        a.obstacleIndex - b.obstacleIndex,
    )
  if (
    !violations.length ||
    input.maxSearchCalls <= 0 ||
    input.remainingNodes() <= 0
  )
    return
  const spans: Span[] = []
  let calls = 0
  const distance = (
    p: { x: number; y: number },
    a: RepairRoutePoint,
    b: RepairRoutePoint,
  ): number => {
    const dx = b.x - a.x,
      dy = b.y - a.y
    const length2 = dx * dx + dy * dy
    const t = length2
      ? Math.max(
          0,
          Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2),
        )
      : 0
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
  }
  const viaAt = (route: HighDensityRoute, index: number): boolean => {
    const point = route.route[index]!
    const before = route.route[index - 1]
    const after = route.route[index + 1]
    return (
      (before !== undefined && before.z !== point.z) ||
      (after !== undefined && after.z !== point.z)
    )
  }
  const inMutableClosure = (point: RepairRoutePoint): boolean => {
    const b = input.bounds
    return (
      point.x >= b.minX - 1e-8 &&
      point.x <= b.maxX + 1e-8 &&
      point.y >= b.minY - 1e-8 &&
      point.y <= b.maxY + 1e-8
    )
  }
  for (let ri = 0; ri < routes.length; ri++) {
    const route = routes[ri]!
    if (
      route.jumpers?.length ||
      route.route.some((p): boolean =>
        Boolean(p.toNextSegmentType || p.insideJumperPad),
      )
    )
      continue
    const locked = (index: number): boolean =>
      input.isLocked(ri, index) || viaAt(route, index)
    for (let a = 0; a < route.route.length - 1; ) {
      let b = a + 1
      if (route.route[a]!.z !== route.route[b]!.z) {
        a = b
        continue
      }
      while (
        b < route.route.length - 1 &&
        !locked(b) &&
        route.route[b + 1]!.z === route.route[a]!.z
      )
        b++
      const width =
        (route.route[a] as RepairRoutePoint).traceThickness ??
        route.traceThickness
      if (
        b > a &&
        inMutableClosure(route.route[a]!) &&
        inMutableClosure(route.route[b]!) &&
        route.route
          .slice(a, b + 1)
          .every(
            (p): boolean =>
              ((p as RepairRoutePoint).traceThickness ??
                route.traceThickness) === width,
          )
      ) {
        spans.push({
          ri,
          a,
          b,
          z: route.route[a]!.z,
          width,
          distance: Infinity,
          viaEnds: Number(viaAt(route, a)) + Number(viaAt(route, b)),
        })
      }
      a = b
    }
  }
  const attempted = new Set<string>()
  for (const violation of violations) {
    for (const span of spans) {
      span.distance = Infinity
      const route = routes[span.ri]!
      for (let i = span.a + 1; i <= span.b; i++)
        span.distance = Math.min(
          span.distance,
          distance(violation.center, route.route[i - 1]!, route.route[i]!),
        )
    }
    const target = spans
      .filter((span): boolean => span.ri === violation.routeIndex)
      .sort((a, b): number => a.distance - b.distance || a.a - b.a)[0]
    if (!target || target.distance > 0.5) continue
    const targetRoute = routes[target.ri]!
    const companions = spans
      .filter(
        (span): boolean =>
          span.ri !== target.ri &&
          span.z === target.z &&
          span.distance < 1.5 &&
          routes[span.ri]!.connectionName !== targetRoute.connectionName &&
          (!targetRoute.rootConnectionName ||
            routes[span.ri]!.rootConnectionName !==
              targetRoute.rootConnectionName),
      )
      .sort(
        (a, b): number => a.distance - b.distance || a.ri - b.ri || a.a - b.a,
      )
    const first = companions[0],
      second = companions.find((span): boolean => span.ri !== first?.ri)
    if (!first || !second) continue
    const selected = [target, first, second]
    const key = selected
      .map((span): string => `${span.ri}:${span.a}:${span.b}`)
      .join("|")
    if (attempted.has(key)) continue
    attempted.add(key)
    const constrained = first.viaEnds >= second.viaEnds ? 1 : 2,
      other = 3 - constrained
    const orders = [
      [constrained, 0, other],
      [0, 1, 2],
      [0, 2, 1],
      [1, 2, 0],
      [2, 1, 0],
      [other, 0, constrained],
    ]
    const tried = new Set<string>()
    for (const order of orders) {
      if (tried.has(order.join())) continue
      tried.add(order.join())
      const working = routes.map((route): HighDensityRoute => ({ ...route }))
      for (const span of selected) {
        const route = routes[span.ri]!
        working[span.ri] = { ...route, route: route.route.slice(0, span.a + 1) }
        working.push({ ...route, route: route.route.slice(span.b) })
      }
      let complete = true
      for (const index of order) {
        if (calls >= input.maxSearchCalls || input.remainingNodes() <= 0) return
        const span = selected[index]!,
          route = routes[span.ri]!
        const stats: ClearancePathSearchStats = {
          nodesPopped: 0,
          completionReason: "no-path",
        }
        const path = findClearancePath({
          srj: input.srj,
          routes: working,
          routeIndex: span.ri,
          start: route.route[span.b]!,
          end: route.route[span.a]!,
          bounds: input.bounds,
          traceThickness: span.width,
          traceClearance: input.traceClearance,
          viaClearance: input.viaClearance,
          gridSize: Math.max(0.025, span.width / 4),
          allowLayerChanges: false,
          maxNodes: Math.min(30000, input.remainingNodes()),
          stats,
        })
        calls++
        input.onSearch(stats)
        if (!path) {
          complete = false
          break
        }
        path.reverse()
        working[span.ri] = {
          ...route,
          route: [
            ...route.route.slice(0, span.a),
            ...path,
            ...route.route.slice(span.b + 1),
          ],
        }
        working[routes.length + index]!.route = []
      }
      if (complete)
        yield selected.map(
          (span): Replacement => ({
            routeIndex: span.ri,
            route: working[span.ri]!,
          }),
        )
    }
  }
}
