import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { Repair04Solver } from "../lib/Repair04Solver"
import { makeBudgetInput, makeBudgetRoute } from "./fixtures/workBudgetFixture"
type Access = {
  routes: HighDensityRoute[]
  generateCandidates(): Generator<{
    routeIndex: number
    route: HighDensityRoute
  }>
}

test("work limits remain cumulative across locally accepted route changes", (): void => {
  const input = makeBudgetInput([
    makeBudgetRoute("a", [
      [-1, 0],
      [0, 0],
      [1, 0],
    ]),
    makeBudgetRoute("b", [
      [-3, 0.5],
      [-2, 0.5],
      [2, 0.5],
      [3, 0.5],
    ]),
    makeBudgetRoute("c", [
      [1.5, 0.2],
      [1.5, 0.8],
    ]),
  ])
  input.srj.obstacles.push({
    type: "rect",
    center: { x: 0, y: 0 },
    width: 0.2,
    height: 0.2,
    layers: ["top"],
    connectedTo: ["pcb_smtpad_foreign"],
  })
  const movedA = makeBudgetRoute("a", [
      [-1, 0],
      [-0.8, 0.5],
      [0.8, 0.5],
      [1, 0],
    ]),
    movedB = makeBudgetRoute("b", [
      [-3, 0.5],
      [-2, 2],
      [2, 2],
      [3, 0.5],
    ])
  const solver = new Repair04Solver({ ...input, maxCandidateAttempts: 3 })
  const access = solver as unknown as Access
  access.generateCandidates = function* (): Generator<{
    routeIndex: number
    route: HighDensityRoute
  }> {
    yield { routeIndex: 0, route: movedA }
    yield { routeIndex: 0, route: movedA }
    if (access.routes[1]!.route[1]!.y === 0.5)
      yield { routeIndex: 1, route: movedB }
  }
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.stats.candidateAttempts).toBe(3)
  expect(solver.stats.accepted).toBe(1)
  expect(solver.stats.completionReason).toBe("candidate-attempt-limit")
  expect(solver.getOutput()[0]).toEqual(input.routes[0])
  expect(solver.getOutput()[1]).toEqual(movedB)
  expect(solver.stats.finalErrorCount).toBeGreaterThan(0)

  const paths = makeBudgetInput([
    makeBudgetRoute("low", [
      [-4, -2],
      [4, -2],
    ]),
    makeBudgetRoute("high", [
      [-4, 2],
      [4, 2],
    ]),
  ])
  for (const y of [-2, 2])
    paths.srj.obstacles.push({
      type: "rect",
      center: { x: 0, y },
      width: 0.5,
      height: 0.5,
      layers: ["top"],
      connectedTo: [`pcb_smtpad_${y}`],
    })
  const measured = new Repair04Solver({ ...paths, maxPathSearchNodes: 100000 })
  measured.step()
  expect(measured.stats.accepted).toBe(1)
  expect(measured.stats.pathSearchCalls).toBe(1)
  const firstNodes = measured.stats.pathSearchNodes as number
  expect(firstNodes).toBeGreaterThan(1)
  const capped = new Repair04Solver({
    ...paths,
    maxPathSearchNodes: firstNodes + 1,
  })
  capped.solve()
  expect(capped.failed).toBe(false)
  expect(capped.stats.accepted).toBe(1)
  expect(capped.stats.pathSearchCalls).toBe(2)
  expect(capped.stats.pathSearchNodes).toBe(firstNodes + 1)
  expect(capped.stats.completionReason).toBe("path-search-node-limit")
  expect(capped.stats.finalErrorCount).toBeGreaterThan(0)
})
