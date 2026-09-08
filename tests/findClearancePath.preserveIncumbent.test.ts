import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import {
  findClearancePath,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"

test("a feasible incumbent retains every vertex without consuming A* nodes", (): void => {
  const bounds = { minX: -3, maxX: 3, minY: -3, maxY: 3 }
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [],
    route: [
      { x: -2, y: 0, z: 0 },
      { x: -1, y: 0.8, z: 0, pcb_port_id: "midpoint-anchor" },
      { x: 0, y: 0.8, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
  }
  const srj: SimpleRouteJson = {
    bounds,
    layerCount: 1,
    minTraceWidth: 0.1,
    connections: [],
    obstacles: [],
  }
  const original = structuredClone(route.route)
  const stats: ClearancePathSearchStats = {
    nodesPopped: 7,
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
    maxNodes: 1,
    existingPath: route.route,
    stats,
  })
  expect(output).toEqual(original)
  expect(output).not.toBe(route.route)
  expect(output![1]).not.toBe(route.route[1])
  expect(route.route).toEqual(original)
  expect(stats).toEqual({ nodesPopped: 0, completionReason: "found" })
})
