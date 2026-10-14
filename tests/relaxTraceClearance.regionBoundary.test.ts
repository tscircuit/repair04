import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import {
  RelaxTraceClearanceSolver,
  extractRepairRegion,
  mergeRepairRegion,
} from "../lib"

test("clearance projection keeps mutable copper out of the fixed boundary collar", (): void => {
  const bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 }
  const routes: HighDensityRoute[] = [-4.45, -4.25].map((x, index) => ({
    connectionName: `signal-${index}`,
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [],
    route: [
      { x: -6, y: -3, z: 0 },
      { x, y: -2, z: 0 },
      { x, y: 2, z: 0 },
      { x: -6, y: 3, z: 0 },
    ],
  }))
  const srj: SimpleRouteJson = {
    bounds: { minX: -10, maxX: 10, minY: -10, maxY: 10 },
    layerCount: 2,
    minTraceWidth: 0.1,
    minViaDiameter: 0.3,
    defaultObstacleMargin: 0.2,
    connections: routes.map((route) => ({
      name: route.connectionName,
      pointsToConnect: [],
    })),
    obstacles: [],
  }
  const region = extractRepairRegion({ srj, routes, bounds })
  const solver = new RelaxTraceClearanceSolver({
    ...region,
    traceClearance: 0.2,
  })
  solver.solve()

  expect(solver.failed).toBe(false)
  expect(solver.getOutput()).not.toEqual(region.routes)
  expect(() =>
    mergeRepairRegion({
      routes,
      region,
      repairedRoutes: solver.getOutput(),
    }),
  ).not.toThrow()
})
