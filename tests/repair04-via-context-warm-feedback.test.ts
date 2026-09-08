import { expect, test } from "bun:test"
import { createViaBlockerFixture } from "./fixtures/createViaBlockerFixture"

test("cached baseline eligibility never bypasses fresh moved-score and permission guards", (): void => {
  const { solver, selected, candidate } = createViaBlockerFixture()
  const context = {}
  const first = [
    ...solver.generateViaBlockerCandidates(selected, candidate, context),
  ]
  expect(first).toHaveLength(1)
  const calls = solver.pathSearchCalls,
    nodes = solver.pathSearchNodes
  solver.evaluate = (): never => {
    throw new Error("Reuse shared-step score only")
  }
  const cases = [
    { ...candidate, evaluatedScore: undefined },
    { ...candidate, routeIndex: 1 },
    {
      ...candidate,
      additionalRoutes: [{ routeIndex: 1, route: solver.routes[1] }],
    },
    {
      ...candidate,
      evaluatedScore: {
        ...candidate.evaluatedScore,
        errors: [
          ...candidate.evaluatedScore.errors,
          { type: "future_via_error", pcb_via_id: "via_0" },
        ],
      },
    },
    {
      ...candidate,
      evaluatedScore: {
        ...candidate.evaluatedScore,
        fixedViolations: new Map([["unexpected-fixed-contact", 0.1]]),
      },
    },
  ]
  for (const invalid of cases) {
    expect([
      ...solver.generateViaBlockerCandidates(selected, invalid, context),
    ]).toEqual([])
    expect(solver.pathSearchCalls).toBe(calls)
    expect(solver.pathSearchNodes).toBe(nodes)
  }
  solver.input.movableVias = []
  expect([
    ...solver.generateViaBlockerCandidates(selected, candidate, context),
  ]).toEqual([])
  expect(solver.pathSearchCalls).toBe(calls)
})
