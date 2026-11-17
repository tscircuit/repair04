import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import {
  Repair04Solver,
  getNewViaPadViolations,
  getRepairViaGeometry,
} from "../lib"

test("drill repair refreshes overlapping pad contacts and preserves all unselected copper within its budget", (): void => {
  const srj: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: 0.1,
    bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
    connections: [{ name: "signal", pointsToConnect: [] }],
    obstacles: [0, 0.25].map((x) => ({
      type: "rect",
      shape: "circle",
      center: { x, y: 0 },
      width: 0.4,
      height: 0.4,
      layers: ["top"],
      connectedTo: ["signal", `pcb_smtpad_${x}`],
    })),
  }
  const routes: HighDensityRoute[] = [
    {
      connectionName: "signal",
      traceThickness: 0.1,
      viaDiameter: 0.6,
      vias: [
        { x: 0.125, y: 0 },
        { x: 3, y: 1 },
      ],
      route: [
        { x: 0, y: 0, z: 0, pcb_port_id: "start" },
        { x: 0.125, y: 0, z: 0 },
        { x: 0.125, y: 0, z: 1 },
        { x: 3, y: 1, z: 1 },
        { x: 3, y: 1, z: 0 },
        { x: 4, y: 1, z: 0, pcb_port_id: "end" },
      ],
    },
  ]
  const original = structuredClone({ srj, routes })
  const movableVias = [{ routeIndex: 0, viaIndex: 0 }]
  const evaluation = {
    srj,
    previousRoutes: routes,
    routes,
    includeExistingVias: movableVias,
    sameNetViaHoleDiameter: 0.2,
  }
  expect(getNewViaPadViolations(evaluation)).toHaveLength(2)
  const solver = new Repair04Solver({
    srj,
    routes,
    bounds: srj.bounds,
    boundaryMargin: 0.01,
    lockedPointIndices: [[true, false, false, true, true, true]],
    movableVias,
    padDrillRepair: { holeDiameter: 0.2 },
    maxCandidates: 64,
    maxCandidateAttempts: 64,
  })
  solver.solve()
  expect(solver.failed).toBe(false)
  const after = solver.getOutput()
  expect(getNewViaPadViolations({ ...evaluation, routes: after })).toEqual([])
  expect(solver.stats.accepted).toBeGreaterThan(0)
  expect(solver.stats.candidates).toBeLessThanOrEqual(64)
  expect(solver.stats.pathSearchNodes).toBe(0)
  expect(solver.stats.pathSearchCalls).toBe(0)
  expect(after[0]!.route).toHaveLength(routes[0]!.route.length)
  for (const index of [0, 3, 4, 5]) {
    expect(after[0]!.route[index]).toEqual(routes[0]!.route[index])
  }
  expect(getRepairViaGeometry(after[0]!, 2)[1]).toEqual(
    getRepairViaGeometry(routes[0]!, 2)[1],
  )
  expect({ srj, routes }).toEqual(original)
})
