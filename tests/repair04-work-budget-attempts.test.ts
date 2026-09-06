import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { Repair04Solver } from "../lib/Repair04Solver"
import { makeBudgetInput } from "./fixtures/workBudgetFixture"
type Access = {
  generateCandidates(): Generator<{
    routeIndex: number
    route: HighDensityRoute
  }>
}

test("attempt limits include permission and hard-pad rejections without hiding malformed proposals", (): void => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [{ x: 0, y: 0 }],
    route: [
      { x: -0.3, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0.3, y: 0, z: 1 },
    ],
  }
  const base = makeBudgetInput([route])
  base.maxCandidateAttempts = 3
  base.srj.obstacles.push({
    type: "rect",
    center: { x: 0, y: 0 },
    width: 2,
    height: 2,
    layers: ["top", "bottom"],
    connectedTo: ["pcb_smtpad_foreign"],
  })
  for (const canMove of [false, true]) {
    const solver = new Repair04Solver({
      ...base,
      ...(canMove ? { movableVias: [{ routeIndex: 0, viaIndex: 0 }] } : {}),
    })
    let generated = 0
    ;(solver as unknown as Access).generateCandidates =
      function* (): Generator<{ routeIndex: number; route: HighDensityRoute }> {
        for (let index = 0; index < 4; index++) {
          generated++
          if (index === 3) throw Error("must stop before next proposal")
          yield {
            routeIndex: 0,
            route: {
              ...route,
              vias: [{ x: 0.025, y: 0 }],
              route: route.route.map(
                (point, pi): HighDensityRoute["route"][number] =>
                  pi === 1 || pi === 2 ? { ...point, x: 0.025 } : point,
              ),
            },
          }
        }
      }
    solver.solve()
    expect(solver.failed).toBe(false)
    expect(generated).toBe(3)
    expect(solver.stats.candidateAttempts).toBe(3)
    expect(solver.stats.candidates).toBe(canMove ? 3 : 0)
    expect(solver.stats.completionReason).toBe("candidate-attempt-limit")
    expect(solver.stats.accepted).toBe(0)
    expect(solver.getOutput()).toEqual([route])
  }
  const malformed = new Repair04Solver({
    ...base,
    movableVias: [{ routeIndex: 0, viaIndex: 0 }],
  })
  ;(malformed as unknown as Access).generateCandidates =
    function* (): Generator<{ routeIndex: number; route: HighDensityRoute }> {
      yield {
        routeIndex: 0,
        route: {
          ...route,
          route: route.route.map(
            (point, pi): HighDensityRoute["route"][number] =>
              pi === 1 || pi === 2 ? { ...point, x: NaN } : point,
          ),
        },
      }
    }
  expect((): void => malformed.step()).toThrow()
  expect(malformed.failed).toBe(true)
})
