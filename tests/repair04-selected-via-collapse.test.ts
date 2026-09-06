import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import {
  Repair04Solver,
  extractRepairRegion,
  getRepairViaGeometry,
} from "../lib"

test("selected via acceptance rejects a move that collapses two existing stacks", (): void => {
  const srj: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: 0.15,
    bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
    obstacles: [
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 0.2,
        height: 0.2,
        layers: ["top"],
        connectedTo: ["signal"],
      },
    ],
    connections: [{ name: "signal", pointsToConnect: [] }],
  }
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    vias: [
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
    ],
    route: [
      { x: -2, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0.5, y: 0, z: 1 },
      { x: 0.5, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ],
  }
  const region = extractRepairRegion({
    srj,
    routes: [route],
    bounds: srj.bounds,
  })
  const solver = new Repair04Solver({
    ...region,
    movableVias: [{ routeIndex: 0, viaIndex: 0 }],
    maxCandidates: 1000,
  })
  const collapse = structuredClone(region.routes[0]!)
  collapse.route[1]!.x = 0.5
  collapse.route[2]!.x = 0.5
  collapse.vias = [{ x: 0.5, y: 0 }]
  expect(getRepairViaGeometry(collapse, 2)).toHaveLength(1)
  expect(getRepairViaGeometry(region.routes[0]!, 2)).toHaveLength(2)
  // Exercise the common acceptance gate with a well-formed but physically
  // invalid proposal, independently of candidate ordering or local DRC score.
  solver.step()
  const access = solver as unknown as {
    candidates: Generator<{ routeIndex: number; route: HighDensityRoute }>
  }
  access.candidates = (function* (): Generator<{
    routeIndex: number
    route: HighDensityRoute
  }> {
    yield { routeIndex: 0, route: collapse }
  })()
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.getOutput()).toEqual(region.routes)
  expect(getRepairViaGeometry(solver.getOutput()[0]!, 2)).toHaveLength(2)
})
