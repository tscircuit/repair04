import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { Repair04Solver, extractRepairRegion, mergeRepairRegion } from "../lib"

test("an immutable bridge can cross the mutable collar without being split", (): void => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: -8, y: 0, z: 0, pcb_port_id: "start" },
      {
        x: 4,
        y: 0,
        z: 0,
        toNextSegmentType: "through_obstacle",
      },
      { x: 5, y: 1, z: 1 },
      { x: 8, y: 1, z: 1, pcb_port_id: "end" },
    ],
    vias: [],
  }
  Object.assign(route.route[1]!, {
    toNextSegmentCircuitJsonMetadata: { pcb_plated_hole_id: "bridge" },
  })
  const original = structuredClone(route)
  const srj: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: 0.1,
    bounds: { minX: -10, maxX: 10, minY: -10, maxY: 10 },
    obstacles: [],
    connections: [{ name: "signal", pointsToConnect: [] }],
  }
  const region = extractRepairRegion({
    srj,
    routes: [route],
    bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
  })
  const bridgeIndex = region.routes[0]!.route.findIndex(
    (point): boolean => point.toNextSegmentType === "through_obstacle",
  )
  expect(region.routes[0]!.route[bridgeIndex]).toEqual(route.route[1])
  expect(region.routes[0]!.route[bridgeIndex + 1]).toEqual(route.route[2])
  expect(
    region.lockedPointIndices[0]!.slice(bridgeIndex, bridgeIndex + 2),
  ).toEqual([true, true])
  const solver = new Repair04Solver(region)
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.stats.finalErrorCount).toBe(0)
  expect(
    mergeRepairRegion({
      routes: [route],
      region,
      repairedRoutes: solver.getOutput(),
    }),
  ).toEqual([original])
  expect(route).toEqual(original)

  const unlocked = structuredClone(region)
  unlocked.lockedPointIndices[0]![bridgeIndex + 1] = false
  expect((): Repair04Solver => new Repair04Solver(unlocked)).toThrow(
    "boundary crossings require fixed cut points",
  )
  const ordinary = structuredClone(region)
  ordinary.routes[0]!.route[bridgeIndex]!.toNextSegmentType = undefined
  expect((): Repair04Solver => new Repair04Solver(ordinary)).toThrow(
    "boundary crossings require fixed cut points",
  )
})
