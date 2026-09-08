import { expect, test } from "bun:test"
import { pointToSegmentDistance } from "@tscircuit/math-utils"
import type { HighDensityRoute, SimpleRouteJson } from "high-density-repair03/lib"
import { negotiateTraceClearance } from "../lib/negotiateTraceClearance"

test("negotiation keeps fixed junction sites hard while their neighboring spans are movable", (): void => {
  const bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 }
  const srj: SimpleRouteJson = {
    bounds,
    layerCount: 1,
    minTraceWidth: 0.1,
    connections: [],
    obstacles: [],
  }
  const routes: HighDensityRoute[] = [{
    connectionName: "fixed-junction",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [],
    route: [{ x: -0.05, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0.05, y: 0, z: 0 }],
  }, {
    connectionName: "moving",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [],
    route: [{ x: 0, y: -0.3, z: 0 }, { x: 0.4, y: -0.3, z: 0 },
      { x: 0.4, y: 0.3, z: 0 }, { x: 0, y: 0.3, z: 0 }],
  }]
  const result = negotiateTraceClearance({
    srj,
    routes,
    bounds,
    dirtyRouteIndices: [1],
    isLocked: (ri, pi): boolean => ri === 0 || pi === 0 || pi === 3,
    allowLayerChanges: false,
    traceClearance: 0.1,
    viaClearance: 0.1,
    maxPathSearchNodes: 30000,
    maxPathSearchCalls: 1,
  })
  expect(result.routes[0]).toEqual(routes[0])
  const path = result.routes[1]!.route
  for (const anchor of routes[0]!.route) {
    for (let index = 1; index < path.length; index++) {
      expect(pointToSegmentDistance(anchor, path[index - 1]!, path[index]!)).toBeGreaterThanOrEqual(0.2 - 1e-8)
    }
  }
  expect(result.pathSearchCalls).toBe(1)
  expect(result.unresolvedSpanCount).toBe(0)
})
