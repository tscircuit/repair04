import { expect, test } from "bun:test"
import { Repair04Solver, type Repair04SolverInput } from "../lib/Repair04Solver"

test("fixed-obstacle rejection preserves proposal accounting without evaluating indexed DRC", (): void => {
  const bounds = { minX: -5, minY: -5, maxX: 5, maxY: 5 }
  const input: Repair04SolverInput = {
    bounds, boundaryMargin: 0.5, lockedPointIndices: [[true, true], [true, true]],
    srj: { bounds, layerCount: 2, minTraceWidth: 0.2, connections: [], obstacles: [
      { type: "rect", center: { x: 0, y: 0 }, width: 1, height: 1, layers: ["top"], connectedTo: [] },
    ] },
    routes: [-1, -0.9].map((y, i): Repair04SolverInput["routes"][number] => ({
      connectionName: `net${i}`, traceThickness: 0.2, viaDiameter: 0.3, vias: [],
      route: [{ x: -4, y, z: 0 }, { x: 4, y, z: 0 }],
    })),
    maxCandidates: 1, maxCandidateAttempts: 1,
  }
  const solver = new Repair04Solver(input)
  const internal = solver as unknown as {
    generateCandidates: () => Generator<{ routeIndex: number; route: Repair04SolverInput["routes"][number] }>
    evaluate: (...args: unknown[]) => unknown
  }
  const proposal = { routeIndex: 0, route: { ...input.routes[0]!, route: [
    input.routes[0]!.route[0]!, { x: 0, y: 0, z: 0 }, input.routes[0]!.route[1]!,
  ] }, evaluatedScore: undefined as unknown }
  internal.generateCandidates = function* (): ReturnType<typeof internal.generateCandidates> {
    yield proposal
  }
  const evaluate = internal.evaluate.bind(solver)
  let indexedEvaluations = 0
  internal.evaluate = (...args: unknown[]): unknown => {
    indexedEvaluations++
    return evaluate(...args)
  }
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.solved).toBe(true)
  expect(solver.stats.initialErrorCount).toBeGreaterThan(0)
  expect(solver.stats.finalErrorCount).toBe(solver.stats.initialErrorCount)
  expect(solver.stats.candidates).toBe(1)
  expect(solver.stats.candidateAttempts).toBe(1)
  expect(indexedEvaluations).toBe(1)
  expect(proposal.evaluatedScore).toBeUndefined()
  expect(solver.getOutput()).toEqual(input.routes)

  const existingContact: Repair04SolverInput = {
    ...input, lockedPointIndices: [[true, true]],
    srj: { ...input.srj, obstacles: [{ ...input.srj.obstacles[0]!, layers: ["top", "bottom"] }] },
    routes: [{ ...input.routes[0]!, route: [{ x: -4, y: -0.6, z: 0 }, { x: 4, y: -0.6, z: 0 }] }],
    maxCandidates: 4, maxCandidateAttempts: 4,
  }
  const improving = new Repair04Solver(existingContact)
  const access = improving as unknown as typeof internal
  const endpoints = existingContact.routes[0]!.route
  const worse = { routeIndex: 0, route: { ...existingContact.routes[0]!, route: [
    endpoints[0]!, { x: 0, y: 0, z: 0 }, endpoints[1]!,
  ] }, evaluatedScore: undefined as unknown }
  const clear = { routeIndex: 0, route: { ...existingContact.routes[0]!, route: [
    endpoints[0]!, { x: -3, y: -1, z: 0 }, { x: 3, y: -1, z: 0 }, endpoints[1]!,
  ] }, evaluatedScore: undefined as unknown }
  access.generateCandidates = function* (): ReturnType<typeof internal.generateCandidates> {
    yield worse
    yield clear
  }
  const evaluateImprovement = access.evaluate.bind(improving)
  let improvingEvaluations = 0
  access.evaluate = (...args: unknown[]): unknown => {
    improvingEvaluations++
    return evaluateImprovement(...args)
  }
  improving.solve()
  expect(improving.failed).toBe(false)
  expect(improving.stats.initialErrorCount).toBeGreaterThan(0)
  expect(improving.stats.finalErrorCount).toBe(0)
  expect(improving.stats.candidateAttempts).toBe(2)
  expect(improving.stats.candidates).toBe(2)
  expect(improving.stats.accepted).toBe(1)
  expect(worse.evaluatedScore).toBeUndefined()
  expect(clear.evaluatedScore).toBeDefined()
  expect(improvingEvaluations).toBe(2)
  expect(improving.getOutput()).toEqual([clear.route])
})
