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

test("moving an ordinary via preserves both colocated and noncolocated atomic layer spans", (): void => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    rootConnectionName: "signal-net",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: -8, y: 2, z: 0, pcb_port_id: "start" },
      { x: -2, y: 2, z: 0, toNextSegmentType: "through_obstacle" },
      { x: -1.7, y: 2, z: 1 },
      { x: -1, y: 2, z: 1, toNextSegmentType: "through_obstacle" },
      { x: -1, y: 2, z: 2 },
      { x: 0, y: 0, z: 2 },
      { x: 0, y: 0, z: 3 },
      { x: 8, y: 0, z: 3, pcb_port_id: "end" },
    ],
    vias: [{ x: 0, y: 0 }],
  }
  const srj: SimpleRouteJson = {
    layerCount: 4,
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
        layers: ["bottom"],
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
  const solver = new Repair04Solver({
    ...region,
    movableVias: selected,
    allowLayerChanges: false,
    maxCandidates: 512,
  })
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.stats.initialErrorCount).toBe(1)
  expect(solver.stats.finalErrorCount).toBe(0)
  const repaired = solver.getOutput()
  expect(
    getNewViaPadViolations({
      srj: region.srj,
      previousRoutes: region.routes,
      routes: repaired,
      includeExistingVias: selected,
    }),
  ).toEqual([])
  const merged = mergeRepairRegion({
    routes: [route],
    region,
    repairedRoutes: repaired,
  })[0]!
  const afterVias = getRepairViaGeometry(merged, 4)
  expect(afterVias).toHaveLength(1)
  expect(afterVias[0]!.layerSequence).toEqual([2, 3])
  expect(afterVias[0]!.identity).not.toBe(
    getRepairViaGeometry(route, 4)[0]!.identity,
  )
  expect(merged.vias).toEqual([{ x: afterVias[0]!.x, y: afterVias[0]!.y }])
  for (const index of [1, 3]) {
    const startIndex = merged.route.findIndex(
      (point) => JSON.stringify(point) === JSON.stringify(route.route[index]),
    )
    expect(startIndex).toBeGreaterThanOrEqual(0)
    expect(merged.route[startIndex + 1]).toEqual(route.route[index + 1])
  }
  expect(merged.route[0]).toEqual(route.route[0])
  expect(merged.route.at(-1)).toEqual(route.route.at(-1))
  const inventedAtomic = structuredClone(repaired)
  const transition = inventedAtomic[0]!.route.findIndex(
    (point, index, points) =>
      index + 1 < points.length &&
      point.z !== points[index + 1]!.z &&
      !point.toNextSegmentType,
  )
  inventedAtomic[0]!.route[transition]!.toNextSegmentType = "through_obstacle"
  expect(() =>
    mergeRepairRegion({
      routes: [route],
      region,
      repairedRoutes: inventedAtomic,
    }),
  ).toThrow("invented through-obstacle span")
  region.routes[0]!.route.forEach((point, index) => {
    if (region.lockedPointIndices[0]![index])
      expect(repaired[0]!.route).toContainEqual(point)
  })
})
