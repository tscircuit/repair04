import { expect, test } from "bun:test"
import { createViaBlockerFixture } from "./fixtures/createViaBlockerFixture"

test("via-blocker calls remain charged across generator restarts and limits", (): void => {
  const { solver, selected, candidate } = createViaBlockerFixture()
  solver.evaluate = (): never => {
    throw new Error("Reuse existing score")
  }
  for (let index = 0; index < 4; index++) {
    // Consume the generator without applying its route; each independent
    // proposal starts from the same actual cached, rejected via move.
    Array.from(solver.generateViaBlockerCandidates(selected, candidate))
  }
  expect(solver.viaBlockerPathSearchCalls).toBe(4)
  expect(solver.pathSearchCalls).toBe(4)
  const nodes = solver.pathSearchNodes
  expect(nodes).toBeGreaterThan(0)
  expect(nodes).toBeLessThanOrEqual(30000)
  solver.candidates = solver.generateCandidates()
  expect([...solver.generateViaBlockerCandidates(selected, candidate)]).toEqual(
    [],
  )
  expect(solver.viaBlockerPathSearchCalls).toBe(4)
  expect(solver.pathSearchNodes).toBe(nodes)

  const exhausted = createViaBlockerFixture({ maxNodes: 1 })
  Array.from(
    exhausted.solver.generateViaBlockerCandidates(
      exhausted.selected,
      exhausted.candidate,
    ),
  )
  expect(exhausted.solver.pathSearchNodes).toBe(1)
  expect(exhausted.solver.viaBlockerPathSearchCalls).toBe(1)
  exhausted.solver.candidates = exhausted.solver.generateCandidates()
  expect([
    ...exhausted.solver.generateViaBlockerCandidates(
      exhausted.selected,
      exhausted.candidate,
    ),
  ]).toEqual([])
  expect(exhausted.solver.pathSearchNodes).toBe(1)

  const attempts = createViaBlockerFixture({ maxAttempts: 1 })
  attempts.solver.step()
  expect(attempts.solver.candidateAttempts).toBe(1)
  attempts.solver.step()
  expect(attempts.solver.solved).toBe(true)
  expect(attempts.solver.candidateAttempts).toBe(1)
  expect(attempts.solver.viaBlockerPathSearchCalls).toBe(0)
  expect(attempts.solver.pathSearchNodes).toBe(0)
})
