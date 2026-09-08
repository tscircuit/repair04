import { expect, test } from "bun:test"
import type { HighDensityRoute, SimpleRouteJson } from "high-density-repair03/lib"
import { negotiateTraceClearance } from "../lib/negotiateTraceClearance"

test("drill spacing applies to vias whose copper connects disjoint layers", (): void => {
  const bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 }
  const srj: SimpleRouteJson = {
    bounds,
    layerCount: 4,
    minTraceWidth: 0.1,
    connections: [],
    obstacles: [],
  }
  const routes: HighDensityRoute[] = [{
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [{ x: 0, y: 0 }],
    route: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }],
  }, {
    connectionName: "fixed-via",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [{ x: 0.05, y: 0 }],
    route: [{ x: 0.05, y: 0, z: 2 }, { x: 0.05, y: 0, z: 3 }],
  }]
  const result = negotiateTraceClearance({
    srj,
    routes,
    bounds,
    dirtyRouteIndices: [0],
    isLocked: (ri): boolean => ri === 1,
    allowLayerChanges: true,
    traceClearance: 0.1,
    viaClearance: 0.1,
    viaHoleDiameter: 0.15,
    maxPathSearchNodes: 120000,
    maxPathSearchCalls: 10,
  })
  expect(result.routes[1]).toEqual(routes[1])
  expect(result.routes[0]!.route[0]).toEqual(routes[0]!.route[0])
  expect(result.routes[0]!.route.at(-1)).toEqual(routes[0]!.route.at(-1))
  expect(result.routes[0]!.vias).toHaveLength(1)
  const via = result.routes[0]!.vias[0]!
  expect(Math.hypot(via.x - 0.05, via.y) - 0.15).toBeGreaterThanOrEqual(0.1 - 1e-8)
  expect(result.unresolvedSpanCount).toBe(0)
})
