import { expect, test } from "bun:test"
import { Repair04Solver } from "../lib/Repair04Solver"
import { makeBudgetInput, makeBudgetRoute } from "./fixtures/workBudgetFixture"

test("null clearance searches consume cumulative nodes and stop before any unscored later proposal", (): void => {
  const input = makeBudgetInput([
    makeBudgetRoute("inside", [
      [-0.1, 0],
      [0.1, 0],
    ]),
    makeBudgetRoute("crossing", [
      [-4, 1],
      [4, 1],
    ]),
  ])
  input.srj.obstacles.push({
    type: "rect",
    center: { x: 0, y: 0 },
    width: 0.5,
    height: 20,
    layers: ["top"],
    connectedTo: ["pcb_smtpad_wall"],
  })
  const solver = new Repair04Solver({
    ...input,
    maxPathSearchNodes: 25,
    maxCandidateAttempts: 100,
  })
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.stats.completionReason).toBe("path-search-node-limit")
  expect(solver.stats.pathSearchCalls).toBe(2)
  expect(solver.stats.pathSearchNodes).toBe(25)
  expect(solver.stats.candidateAttempts).toBe(0)
  expect(solver.stats.candidates).toBe(0)
  expect(solver.stats.finalErrorCount).toBeGreaterThan(0)
  expect(solver.getOutput()).toEqual(input.routes)
})
