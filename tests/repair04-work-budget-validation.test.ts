import { expect, test } from "bun:test"
import { Repair04Solver } from "../lib/Repair04Solver"
import { findClearancePath } from "../lib/findClearancePath"
import { makeBudgetInput, makeBudgetRoute } from "./fixtures/workBudgetFixture"

test("invalid optional budgets throw before work and finite high limits preserve ordinary candidate caps", (): void => {
  const route = makeBudgetRoute("signal", [
      [-1, 0],
      [1, 0],
    ]),
    input = makeBudgetInput([route])
  for (const limit of [
    0,
    -1,
    0.5,
    Infinity,
    -Infinity,
    NaN,
    1e100,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    expect((): void => {
      new Repair04Solver({ ...input, maxCandidateAttempts: limit })
    }).toThrow("maxCandidateAttempts")
    expect((): void => {
      new Repair04Solver({ ...input, maxPathSearchNodes: limit })
    }).toThrow("maxPathSearchNodes")
    expect((): void => {
      findClearancePath({
        srj: input.srj,
        routes: input.routes,
        routeIndex: 0,
        start: route.route[0]!,
        end: route.route[1]!,
        bounds: input.bounds,
        traceThickness: 0.1,
        traceClearance: 0.1,
        viaClearance: 0.1,
        maxNodes: limit,
      })
    }).toThrow("maxNodes")
  }
  const solver = new Repair04Solver({
    ...input,
    maxCandidateAttempts: Number.MAX_SAFE_INTEGER,
    maxPathSearchNodes: Number.MAX_SAFE_INTEGER,
  })
  expect(solver.MAX_ITERATIONS).toBe(input.maxCandidates! * 2 + 4)
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.stats.completionReason).toBe("clean")
  expect(solver.stats.candidateAttempts).toBe(0)
  expect(solver.stats.pathSearchNodes).toBe(0)
})
