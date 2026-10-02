import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { Repair04Solver } from "../lib/Repair04Solver"
import { createCrossingPairInput } from "./fixtures/crossing-pair"
type Replacement = { routeIndex: number; route: HighDensityRoute }
type Candidate = Replacement & { additionalRoutes: Replacement[] }
type Access = {
  generateCandidates(): Generator<Candidate>
  evaluate(routes: HighDensityRoute[]): unknown
}

test("candidate memoization distinguishes changes to only the third route", (): void => {
  const input = createCrossingPairInput()
  input.routes.push({
    ...structuredClone(input.routes[1]!),
    connectionName: "c",
  })
  input.lockedPointIndices!.push([true, false, false, true])
  input.allowLayerChanges = false
  input.maxCandidateAttempts = 3
  const solver = new Repair04Solver(input),
    access = solver as unknown as Access
  const originalEvaluate = access.evaluate.bind(solver)
  let evaluations = 0
  access.evaluate = (routes: HighDensityRoute[]): unknown => {
    evaluations++
    return originalEvaluate(routes)
  }
  access.generateCandidates = function* (): Generator<Candidate> {
    for (const offset of [0.1, 0.1, 0.2]) {
      const partner = {
        ...input.routes[2]!,
        route: input.routes[2]!.route.map(
          (point, index): HighDensityRoute["route"][number] =>
            index === 1 || index === 2
              ? { ...point, y: point.y + offset }
              : point,
        ),
      }
      yield {
        routeIndex: 0,
        route: input.routes[0]!,
        additionalRoutes: [
          { routeIndex: 1, route: input.routes[1]! },
          { routeIndex: 2, route: partner },
        ],
      }
    }
  }
  solver.solve()
  expect(solver.stats.candidateAttempts).toBe(3)
  expect(evaluations).toBe(3)
  expect(solver.stats.accepted).toBe(0)
  expect(solver.getOutput()).toEqual(input.routes)
})
