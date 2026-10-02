import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import {
  findClearancePath,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"

test("preserving an incumbent cannot bypass disabled layer changes", (): void => {
  const bounds = { minX: -3, maxX: 3, minY: -3, maxY: 3 }
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ],
    route: [
      { x: -2, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: -1, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
  }
  const srj: SimpleRouteJson = {
    bounds,
    layerCount: 2,
    minTraceWidth: 0.1,
    connections: [],
    obstacles: [],
  }
  const stats: ClearancePathSearchStats = {
    nodesPopped: 0,
    completionReason: "no-path",
  }
  const output = findClearancePath({
    srj,
    routes: [route],
    routeIndex: 0,
    bounds,
    start: route.route[0]!,
    end: route.route.at(-1)!,
    traceThickness: 0.1,
    traceClearance: 0.1,
    viaClearance: 0.1,
    allowLayerChanges: false,
    maxNodes: 30000,
    existingPath: route.route,
    stats,
  })
  expect(output).not.toBeNull()
  expect(output!.every((point): boolean => point.z === 0)).toBe(true)
  expect(stats.nodesPopped).toBeGreaterThan(0)
})
