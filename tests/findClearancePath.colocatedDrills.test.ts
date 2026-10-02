import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import {
  findClearancePath,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"

test("colocated layer transitions share one physical drill and dimensions stay validated", (): void => {
  const bounds = { minX: -2, maxX: 2, minY: -2, maxY: 2 }
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 2 },
      { x: 1, y: 0, z: 2 },
    ],
    vias: [{ x: 0, y: 0 }],
  }
  const srj: SimpleRouteJson = {
    bounds,
    layerCount: 3,
    minTraceWidth: 0.1,
    connections: [],
    obstacles: [],
  }
  const stats: ClearancePathSearchStats = {
    nodesPopped: 0,
    completionReason: "no-path",
  }
  const input = {
    srj,
    routes: [route],
    routeIndex: 0,
    bounds,
    start: route.route[0]!,
    end: route.route.at(-1)!,
    traceThickness: 0.1,
    traceClearance: 0.1,
    viaClearance: 0.1,
    viaHoleDiameter: 0.15,
    maxNodes: 1,
    existingPath: route.route,
    stats,
  }
  expect(findClearancePath(input)).toEqual(route.route)
  expect(stats.nodesPopped).toBe(0)
  for (const viaHoleDiameter of [0, -0.1, NaN, Infinity, 0.31]) {
    expect((): void => {
      findClearancePath({ ...input, viaHoleDiameter })
    }).toThrow("via hole diameter must be positive and fit the copper")
  }
})
