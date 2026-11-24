import { expect, test } from "bun:test"
import { findClearancePath } from "../lib/findClearancePath"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"

test("finds a clear path when the search bounds are smaller than one grid cell", () => {
  const bounds = { minX: 0, maxX: 0.2, minY: 0, maxY: 0.2 }
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.05,
    viaDiameter: 0.1,
    vias: [],
    route: [
      { x: 0.02, y: 0.1, z: 0 },
      { x: 0.18, y: 0.1, z: 0 },
    ],
  }
  const srj: SimpleRouteJson = {
    layerCount: 1,
    minTraceWidth: 0.05,
    bounds,
    connections: [],
    obstacles: [],
  }

  const path = findClearancePath({
    srj,
    routes: [route],
    routeIndex: 0,
    start: route.route[0]!,
    end: route.route[1]!,
    bounds,
    traceThickness: 0.05,
    traceClearance: 0.01,
    viaClearance: 0.01,
    gridSize: 0.5,
    allowLayerChanges: false,
  })

  expect(path).not.toBeNull()
  expect(path![0]).toEqual(route.route[0])
  expect(path!.at(-1)).toEqual(route.route[1])
})
