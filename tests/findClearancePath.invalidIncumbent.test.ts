import { expect, test } from "bun:test"
import type { HighDensityRoute, SimpleRouteJson } from "high-density-repair03/lib"
import { findClearancePath } from "../lib/findClearancePath"

test("incumbents must preserve requested anchors and colocated via transitions", (): void => {
  const bounds = { minX: -3, maxX: 3, minY: -3, maxY: 3 }
  const route: HighDensityRoute = {
    connectionName: "signal", traceThickness: 0.1, viaDiameter: 0.3,
    vias: [], route: [{ x: -2, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }],
  }
  const srj: SimpleRouteJson = {
    bounds, layerCount: 2, minTraceWidth: 0.1, connections: [], obstacles: [],
  }
  const input = {
    srj, routes: [route], routeIndex: 0, bounds,
    start: route.route[0]!, end: route.route.at(-1)!,
    traceThickness: 0.1, traceClearance: 0.1, viaClearance: 0.1,
    allowLayerChanges: true, maxNodes: 30000,
  }
  expect((): void => {
    findClearancePath({ ...input, existingPath: [{ x: -1, y: 0, z: 0 }, route.route[1]!] })
  }).toThrow("must match its anchors")
  expect((): void => {
    findClearancePath({
      ...input,
      existingPath: [
        route.route[0]!,
        { x: 0, y: 0, z: 1 },
        { x: 1, y: 0, z: 0 },
        route.route[1]!,
      ],
    })
  }).toThrow("non-colocated layer transition")
})
