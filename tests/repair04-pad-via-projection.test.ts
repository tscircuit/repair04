import { expect, test } from "bun:test"
import type { HighDensityRoute, SimpleRouteJson } from "high-density-repair03/lib"
import {
  Repair04Solver,
  extractRepairRegion,
  getFixedObstacleViolations,
  getNewViaPadViolations,
  getRepairViaGeometry,
  mergeRepairRegion,
} from "../lib"

test("a pad-contact via moves directly to a legal envelope face without rerouting its terminals", (): void => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: -3, y: 0, z: 1, pcb_port_id: "start" },
      { x: -0.45, y: 0, z: 1 },
      { x: -0.45, y: 0, z: 0 },
      { x: 0, y: 0.3, z: 0, pcb_port_id: "end" },
    ],
    vias: [{ x: -0.45, y: 0 }],
  }
  const srj: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: 0.1,
    bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
    connections: [{ name: "signal", pointsToConnect: [] }],
    obstacles: [
      {
        type: "rect",
        center: { x: 0, y: 0.3 },
        width: 0.8,
        height: 0.2,
        layers: ["top"],
        connectedTo: ["signal", "end"],
      },
      {
        type: "rect",
        center: { x: 0, y: -0.2 },
        width: 0.8,
        height: 0.2,
        layers: ["top"],
        connectedTo: ["foreign"],
      },
    ],
  }
  const region = extractRepairRegion({ srj, routes: [route], bounds: srj.bounds })
  const before = structuredClone(region)
  const solver = new Repair04Solver({
    ...region,
    allowLayerChanges: true,
    maxCandidates: 4,
    maxPathSearchNodes: 1000,
  })
  solver.solve()
  const output = solver.getOutput()
  expect(solver.stats.initialErrorCount).toBeGreaterThan(0)
  expect(solver.stats.finalErrorCount).toBe(0)
  expect(solver.stats.pathSearchCalls).toBe(0)
  expect(
    getNewViaPadViolations({
      srj,
      previousRoutes: region.routes.map(
        (route): HighDensityRoute => ({ ...route, route: [], vias: [] }),
      ),
      routes: output,
    }),
  ).toEqual([])
  expect(getFixedObstacleViolations({ srj, routes: output })).toEqual([])
  const merged = mergeRepairRegion({
    routes: [route],
    region,
    repairedRoutes: output,
  })[0]!
  expect(merged.route[0]).toEqual(route.route[0])
  expect(merged.route.at(-1)).toEqual(route.route.at(-1))
  expect(merged.route).toHaveLength(route.route.length)
  expect(
    getRepairViaGeometry(merged, 2).map((via): number[] => via.layerSequence),
  ).toEqual([[1, 0]])
  expect(region).toEqual(before)
})
