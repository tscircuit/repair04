import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { Repair04Solver, type Repair04SolverInput } from "../lib/Repair04Solver"

type SolverAccess = {
  evaluate(routes: HighDensityRoute[]): unknown
  generateCandidates(): Generator<{
    routeIndex: number
    route: HighDensityRoute
  }>
}

test("hard via-pad rejects retain the exact budget and geometry without repeated indexed scoring or skipped validation", (): void => {
  const bounds = { minX: -5, minY: -5, maxX: 5, maxY: 5 }
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.15,
    viaDiameter: 0.3,
    vias: [{ x: 0, y: 0 }],
    route: [
      { x: -0.3, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0.3, y: 0, z: 1 },
    ],
  }
  const input: Repair04SolverInput = {
    bounds,
    boundaryMargin: 0.25,
    routes: [route],
    lockedPointIndices: [[true, false, false, true]],
    maxCandidates: 64,
    movableVias: [{ routeIndex: 0, viaIndex: 0 }],
    srj: {
      bounds,
      layerCount: 2,
      minTraceWidth: 0.15,
      connections: [],
      obstacles: [
        {
          type: "rect",
          center: { x: 0, y: 0 },
          width: 2,
          height: 2,
          layers: ["top", "bottom"],
          connectedTo: ["pcb_smtpad_foreign"],
        },
      ],
    },
  }
  const solver = new Repair04Solver(input)
  const access = solver as unknown as SolverAccess
  const evaluate = access.evaluate.bind(access)
  let indexedScores = 0
  access.evaluate = (routes): unknown => {
    indexedScores++
    return evaluate(routes)
  }
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.stats.candidates).toBe(64)
  expect(solver.stats.accepted).toBe(0)
  expect(solver.stats.finalErrorCount).toBe(solver.stats.initialErrorCount)
  expect(solver.getOutput()).toEqual([route])
  expect(indexedScores).toBe(1)

  const invalid = new Repair04Solver(input)
  const invalidAccess = invalid as unknown as SolverAccess
  invalidAccess.generateCandidates = function* (): Generator<{
    routeIndex: number
    route: HighDensityRoute
  }> {
    yield {
      routeIndex: 0,
      route: {
        ...route,
        route: route.route.map((point, index) =>
          index === 1 || index === 2 ? { ...point, x: Number.NaN } : point,
        ),
        vias: [{ x: 0.025, y: 0 }],
      },
    }
  }
  // Invalid physical via geometry cannot be concealed by the rejection shortcut.
  expect((): void => invalid.step()).toThrow()
})
