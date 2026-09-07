import { expect, test } from "bun:test"
import { pointToSegmentDistance } from "@tscircuit/math-utils"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { getNewViaPadViolations, relaxTraceClearance } from "../lib"
import type { RepairRegionInput } from "../lib/repairRegionTypes"

test("clearance projection keeps an existing pad via and its shared junction fixed", (): void => {
  const routes: HighDensityRoute[] = [{
    connectionName: "via-owner", rootConnectionName: "shared-net", traceThickness: 0.1, viaDiameter: 0.3,
    route: [{ x: -3, y: -1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 3, y: -1, z: 1 }],
    vias: [{ x: 0, y: 0 }],
  }, {
    connectionName: "shared-branch", rootConnectionName: "shared-net", traceThickness: 0.1, viaDiameter: 0.3,
    route: [{ x: 0, y: 0, z: 0 }, { x: -2, y: -2, z: 0 }], vias: [],
  }, {
    connectionName: "foreign", traceThickness: 0.1, viaDiameter: 0.3,
    route: [{ x: -3, y: 0.7, z: 0 }, { x: -1, y: 0.26, z: 0 }, { x: 1, y: 0.26, z: 0 }, { x: 3, y: 0.7, z: 0 }], vias: [],
  }]
  const bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 }
  const input: RepairRegionInput = {
    srj: { layerCount: 2, minTraceWidth: 0.1, bounds,
      obstacles: [{ type: "rect", center: { x: 0, y: 0 }, width: 0.3, height: 0.3,
        layers: ["top"], connectedTo: ["via-owner", "pcb_smtpad_own"] }],
      connections: routes.map((route) => ({ name: route.connectionName,
        rootConnectionName: route.rootConnectionName, pointsToConnect: [] })) },
    routes, bounds, boundaryMargin: 0.5,
    lockedPointIndices: [[true, false, false, true], [false, true], [true, false, false, true]],
  }
  const output = relaxTraceClearance({ ...input, allowViaMovement: true })
  expect(output[0]!.vias).toEqual(routes[0]!.vias)
  expect(output[0]!.route[1]).toEqual(routes[0]!.route[1])
  expect(output[0]!.route[2]).toEqual(routes[0]!.route[2])
  expect(output[1]!.route[0]).toEqual(routes[1]!.route[0])
  expect(pointToSegmentDistance({ x: 0, y: 0 }, output[2]!.route[1]!, output[2]!.route[2]!) - 0.2).toBeGreaterThanOrEqual(0.1099)
  expect(getNewViaPadViolations({ srj: input.srj, previousRoutes: routes, routes: output })).toEqual([])
})
