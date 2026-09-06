import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import {
  Repair04Solver,
  extractRepairRegion,
  getNewViaPadViolations,
  getRepairViaGeometry,
  mergeRepairRegion,
} from "../lib"

test("layer repair sees an existing same-net via in a pad without requiring selected-via permissions", (): void => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: -8, y: 0, z: 0, pcb_port_id: "start" },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 8, y: 0, z: 1, pcb_port_id: "end" },
    ],
    vias: [{ x: 0, y: 0 }],
  }
  const srj: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: 0.1,
    bounds: { minX: -10, maxX: 10, minY: -10, maxY: 10 },
    connections: [{ name: "signal", pointsToConnect: [] }],
    obstacles: [
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 1,
        height: 1,
        layers: ["top"],
        connectedTo: ["signal", "pcb_smtpad_own"],
      },
    ],
  }
  const region = extractRepairRegion({
    srj,
    routes: [route],
    bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
  })
  const solver = new Repair04Solver({
    ...region,
    allowLayerChanges: true,
    traceOnlyFirst: false,
    maxCandidates: 512,
  })
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.stats.initialErrorCount).toBe(1)
  expect(solver.stats.finalErrorCount).toBe(0)
  const repaired = solver.getOutput()
  const viaOrdinals = getRepairViaGeometry(repaired[0]!, 2).map(
    (_, viaIndex): { routeIndex: number; viaIndex: number } => ({
      routeIndex: 0,
      viaIndex,
    }),
  )
  expect(viaOrdinals.length).toBeGreaterThan(0)
  expect(
    getNewViaPadViolations({
      srj: region.srj,
      previousRoutes: region.routes,
      routes: repaired,
      includeExistingVias: viaOrdinals,
    }),
  ).toEqual([])
  const merged = mergeRepairRegion({
    routes: [route],
    region,
    repairedRoutes: repaired,
  })[0]!
  expect(merged.route[0]).toEqual(route.route[0])
  expect(merged.route.at(-1)).toEqual(route.route.at(-1))
  expect(merged.traceThickness).toBe(route.traceThickness)
  region.routes[0]!.route.forEach((point, index): void => {
    if (region.lockedPointIndices[0]![index])
      expect(repaired[0]!.route).toContainEqual(point)
  })
})
