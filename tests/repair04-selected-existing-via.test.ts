import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import {
  Repair04Solver,
  extractRepairRegion,
  mergeRepairRegion,
  getNewViaPadViolations,
  getRepairViaGeometry,
} from "../lib"

test("an explicitly selected existing via leaves its own pad while all other vias and fixed contacts stay exact", (): void => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    rootConnectionName: "signal-net",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: -8, y: 0, z: 0, pcb_port_id: "start" },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 3, y: 0, z: 1 },
      { x: 3, y: 0, z: 0 },
      { x: 8, y: 0, z: 0, pcb_port_id: "end" },
    ],
    vias: [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ],
  }
  const srj: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: 0.1,
    bounds: { minX: -10, maxX: 10, minY: -10, maxY: 10 },
    connections: [
      { name: "signal", rootConnectionName: "signal-net", pointsToConnect: [] },
    ],
    obstacles: [
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 1,
        height: 1,
        layers: ["top"],
        connectedTo: ["signal-net", "pcb_smtpad_own"],
      },
    ],
  }
  const region = extractRepairRegion({
    srj,
    routes: [route],
    bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
  })
  const selected = [{ routeIndex: 0, viaIndex: 0 }]
  expect(
    getNewViaPadViolations({
      srj: region.srj,
      previousRoutes: region.routes,
      routes: region.routes,
      includeExistingVias: selected,
    }),
  ).toHaveLength(1)
  const solver = new Repair04Solver({
    ...region,
    maxCandidates: 512,
    allowLayerChanges: false,
    movableVias: selected,
  })
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.stats.finalErrorCount).toBe(0)
  const after = solver.getOutput()
  expect(
    getNewViaPadViolations({
      srj: region.srj,
      previousRoutes: region.routes,
      routes: after,
      includeExistingVias: selected,
    }),
  ).toEqual([])
  const merged = mergeRepairRegion({
    routes: [route],
    region,
    repairedRoutes: after,
  })[0]!
  const beforeVias = getRepairViaGeometry(route, 2)
  const afterVias = getRepairViaGeometry(merged, 2)
  expect(afterVias).toHaveLength(beforeVias.length)
  expect(afterVias[0]!.identity).not.toBe(beforeVias[0]!.identity)
  expect(afterVias[1]!.identity).toBe(beforeVias[1]!.identity)
  expect(afterVias.map((via): number[] => via.layerSequence)).toEqual(
    beforeVias.map((via): number[] => via.layerSequence),
  )
  expect(merged.viaDiameter).toBe(route.viaDiameter)
  expect(merged.traceThickness).toBe(route.traceThickness)
  expect(merged.route[0]).toEqual(route.route[0])
  expect(merged.route.at(-1)).toEqual(route.route.at(-1))
  region.routes[0]!.route.forEach((point, index): void => {
    if (region.lockedPointIndices[0]![index])
      expect(after[0]!.route).toContainEqual(point)
  })
})
