import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { findClearancePath } from "../lib/findClearancePath"

test("a larger pad clearance does not incorrectly close a legal trace corridor", () => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.6,
    vias: [],
    route: [
      { x: -4, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    ],
  }
  const routes: HighDensityRoute[] = [
    route,
    ...[-0.3, 0.3].map((y) => ({
      ...route,
      connectionName: `foreign-${y}`,
      route: [
        { x: -4.8, y, z: 0 },
        { x: 4.8, y, z: 0 },
      ],
    })),
  ]
  const srj: SimpleRouteJson = {
    layerCount: 1,
    minTraceWidth: 0.1,
    minTraceToPadEdgeClearance: 0.25,
    bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
    obstacles: [],
    connections: [],
  }
  const path = findClearancePath({
    srj,
    routes,
    routeIndex: 0,
    start: route.route[0]!,
    end: route.route[1]!,
    bounds: srj.bounds,
    traceThickness: 0.1,
    traceClearance: 0.1,
    viaClearance: 0.1,
  })
  expect(path).not.toBeNull()
  expect(path![0]).toEqual(route.route[0])
  expect(path!.at(-1)).toEqual(route.route[1])
  expect(path!.every((p) => Math.abs(p.y) < 0.1)).toBe(true)
})
