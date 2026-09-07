import { expect, test } from "bun:test"
import { createViaBlockerFixture } from "./fixtures/createViaBlockerFixture"

test("a via move without shared-step score feedback cannot start a coupled search", (): void => {
  const { solver, selected, candidate } = createViaBlockerFixture()
  expect(solver.score.count).toBe(1)
  expect(candidate.evaluatedScore.count).toBe(1)
  expect(solver.score.errors[0].pcb_trace_id).toBe("repair04_1")
  expect(candidate.evaluatedScore.errors[0].pcb_trace_id).toBe("repair04_2")
  delete candidate.evaluatedScore
  solver.evaluate = (): never => {
    throw new Error("Missing feedback must not trigger another DRC evaluation")
  }
  solver.engine.evaluate = (): never => {
    throw new Error("Missing feedback must not trigger another indexed evaluation")
  }
  expect([...solver.generateViaBlockerCandidates(selected, candidate)]).toEqual([])
  expect(solver.viaBlockerPathSearchCalls).toBe(0)
  expect(solver.pathSearchCalls).toBe(0)
  expect(solver.pathSearchNodes).toBe(0)
})
