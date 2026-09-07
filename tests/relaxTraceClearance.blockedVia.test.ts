import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { getNewViaPadViolations, relaxTraceClearance } from "../lib"
import type { RepairRegionInput } from "../lib/repairRegionTypes"

test("an infeasible wire constraint cannot push a clear via into its own solder pad", (): void => {
  const routes: HighDensityRoute[] = [{
    connectionName: "pad-owner", traceThickness: 0.1, viaDiameter: 0.3,
    route: [{ x: -3, y: -1, z: 0 }, { x: -0.4, y: 0, z: 0 },
      { x: -0.4, y: 0, z: 1 }, { x: 3, y: -1, z: 1 }],
    vias: [{ x: -0.4, y: 0 }],
  }, {
    connectionName: "fixed-wire", traceThickness: 0.1, viaDiameter: 0.3,
    route: [{ x: -0.58, y: -2, z: 0 }, { x: -0.58, y: 2, z: 0 }], vias: [],
  }]
  const bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 }
  const input: RepairRegionInput = {
    srj: { layerCount: 2, minTraceWidth: 0.1, bounds,
      obstacles: [{ type: "rect", center: { x: 0, y: 0 }, width: 0.25, height: 0.25,
        layers: ["top"], connectedTo: ["pad-owner", "pcb_smtpad_own"] }],
      connections: routes.map((route) => ({ name: route.connectionName, pointsToConnect: [] })) },
    routes, bounds, boundaryMargin: 0.5,
    lockedPointIndices: [[true, false, false, true], [true, true]],
  }
  const output = relaxTraceClearance({ ...input, allowViaMovement: true })
  expect(output[1]).toEqual(routes[1])
  expect(output[0]!.vias[0]!.x).toBeLessThanOrEqual(-0.375)
  expect(getNewViaPadViolations({ srj: input.srj, previousRoutes: routes, routes: output })).toEqual([])
})
