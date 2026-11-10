import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { RelaxTraceClearanceSolver } from "../lib/RelaxTraceClearanceSolver"
import { relaxTraceClearance } from "../lib/relaxTraceClearance"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"

test("clear copper around a round pad is not pushed out of its physical channel", (): void => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.0889,
    viaDiameter: 0.28,
    route: [
      { x: 0.4, y: 0.2, z: 0 },
      { x: 0.2, y: 0.2, z: 0 },
      { x: 0.2, y: 0.4, z: 0 },
    ],
    vias: [],
  }
  const srj: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: 0.0889,
    bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 },
    connections: [{ name: "signal", pointsToConnect: [] }],
    obstacles: [
      {
        type: "rect",
        shape: "circle",
        center: { x: 0, y: 0 },
        width: 0.23,
        height: 0.23,
        layers: ["top"],
        connectedTo: ["ground"],
      },
    ],
    minTraceToPadEdgeClearance: 0.089,
  }
  const input = {
    srj,
    routes: [route],
    bounds: srj.bounds,
    traceClearance: 0.089,
    boundaryMargin: 0,
    lockedPointIndices: [[true, false, true]],
  }
  const solver = new RelaxTraceClearanceSolver(input)
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(relaxTraceClearance(input)).toEqual(solver.getOutput())
  expect(solver.getOutput()[0]!.route).toEqual(route.route)
  expect(
    getFixedObstacleViolations({ srj, routes: solver.getOutput() }),
  ).toHaveLength(0)
})
