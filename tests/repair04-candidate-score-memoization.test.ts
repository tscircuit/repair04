import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { Repair04Solver, type Repair04SolverInput } from "../lib/Repair04Solver"

type Candidate = { routeIndex: number; route: HighDensityRoute }
type TestScore = {
  count: number
  severity: number
  errors: unknown[]
  fixedViolations: Map<string, number>
}
type SolverAccess = {
  routes: HighDensityRoute[]
  score: TestScore | null
  bestAdjustment: { routes: HighDensityRoute[]; score: TestScore } | null
  candidateScores: Map<string, TestScore>
  evaluate(routes: HighDensityRoute[]): TestScore
  generateCandidates(): Generator<Candidate>
}
type PairResult = {
  cached: Repair04Solver
  cachedEvaluations: number
  uncachedEvaluations: number
  acceptedStateChanges: number
}

function compareEveryStep(
  input: Repair04SolverInput,
  installGenerator?: (solver: SolverAccess) => void,
): PairResult {
  const cached = new Repair04Solver(input)
  const uncached = new Repair04Solver(input)
  const access = [cached, uncached].map(
    (solver): SolverAccess => solver as unknown as SolverAccess,
  )
  const evaluations = [0, 0]
  access.forEach((solver, index): void => {
    const evaluate = solver.evaluate.bind(solver)
    solver.evaluate = (routes): TestScore => {
      evaluations[index]!++
      return evaluate(routes)
    }
    installGenerator?.(solver)
  })
  let acceptedStateChanges = 0
  for (let step = 0; !cached.solved && !cached.failed; step++) {
    expect(step).toBeLessThan(20_000)
    const previousRoutes = access[0]!.routes
    // The comparison executes the same real evaluator and candidate stream,
    // but deliberately retains no score between steps.
    access[1]!.candidateScores.clear()
    cached.step()
    uncached.step()
    if (previousRoutes !== access[0]!.routes) acceptedStateChanges++
    expect(cached.solved === uncached.solved).toBe(true)
    expect(cached.failed === uncached.failed).toBe(true)
    expect(cached.iterations).toBe(uncached.iterations)
    expect(cached.stats).toEqual(uncached.stats)
    expect(access[0]!.routes).toEqual(access[1]!.routes)
    expect(access[0]!.score).toEqual(access[1]!.score)
    expect(access[0]!.bestAdjustment).toEqual(access[1]!.bestAdjustment)
    expect(access[0]!.candidateScores.size).toBeLessThanOrEqual(128)
  }
  expect(cached.failed).toBe(false)
  expect(cached.getOutput()).toEqual(uncached.getOutput())
  return {
    cached,
    cachedEvaluations: evaluations[0]!,
    uncachedEvaluations: evaluations[1]!,
    acceptedStateChanges,
  }
}

function createInput(routes: HighDensityRoute[]): Repair04SolverInput {
  const bounds = { minX: -5, minY: -5, maxX: 5, maxY: 5 }
  return {
    bounds,
    boundaryMargin: 0.25,
    routes,
    lockedPointIndices: routes.map((route): boolean[] =>
      route.route.map(
        (_, index): boolean => index === 0 || index === route.route.length - 1,
      ),
    ),
    maxCandidates: 4096,
    srj: {
      bounds,
      layerCount: 2,
      minTraceWidth: 0.1,
      connections: [],
      obstacles: [],
    },
  }
}

function makeRoute(
  connectionName: string,
  points: [number, number][],
): HighDensityRoute {
  return {
    connectionName,
    rootConnectionName: connectionName,
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [],
    route: points.map(
      ([x, y]): HighDensityRoute["route"][number] & {
        traceThickness: number
      } => ({
        x,
        y,
        z: 0,
        traceThickness: 0.1,
      }),
    ),
  }
}

test("duplicate score reuse preserves every search state and invalidates after count or severity improvements", (): void => {
  const shortRoute = makeRoute(
    "short",
    Array.from({ length: 7 }, (_, index): [number, number] => [
      -0.3 + index * 0.1,
      0,
    ]),
  )
  const blocked = createInput([shortRoute])
  blocked.srj.obstacles.push({
    type: "rect",
    center: { x: 0, y: 0 },
    width: 2,
    height: 2,
    layers: ["top", "bottom"],
    connectedTo: ["pcb_smtpad_foreign"],
  })
  const actualGenerator = compareEveryStep(blocked)
  expect(actualGenerator.cached.stats.candidates).toBeGreaterThan(500)
  expect(
    actualGenerator.uncachedEvaluations - actualGenerator.cachedEvaluations,
  ).toBeGreaterThan(100)

  const input = createInput([
    makeRoute("a", [
      [-1, 0],
      [0, 0],
      [1, 0],
    ]),
    makeRoute("b", [
      [-3, 0.5],
      [-2, 0.5],
      [2, 0.5],
      [3, 0.5],
    ]),
    makeRoute("c", [
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
  const movedA = makeRoute("a", [
    [-1, 0],
    [-0.8, 0.5],
    [0.8, 0.5],
    [1, 0],
  ])
  const movedB = makeRoute("b", [
    [-3, 0.5],
    [-2, 2],
    [2, 2],
    [3, 0.5],
  ])
  const interaction = compareEveryStep(input, (solver): void => {
    solver.generateCandidates = function* (): Generator<Candidate> {
      yield { routeIndex: 0, route: structuredClone(movedA) }
      yield { routeIndex: 0, route: structuredClone(movedA) }
      if (solver.routes[1]!.route[1]!.y === 0.5)
        yield { routeIndex: 1, route: structuredClone(movedB) }
    }
  })
  // The same A proposal initially crosses B. Once B moves, A must be scored
  // again against the changed copper and can then clear the remaining defect.
  expect(interaction.acceptedStateChanges).toBe(2)
  expect(interaction.cached.stats.finalErrorCount).toBe(0)
  expect(interaction.cached.stats.candidates).toBe(4)
  expect(interaction.cachedEvaluations).toBeLessThan(
    interaction.uncachedEvaluations,
  )

  for (const maxCandidates of [2, 8]) {
    const severityInput = createInput([
      makeRoute("a", [
        [-1, 0],
        [0, 0],
        [1, 0],
      ]),
      makeRoute("b", [
        [-2, 1],
        [0, 0.12],
        [2, 1],
      ]),
    ])
    severityInput.maxCandidates = maxCandidates
    const improved = makeRoute("a", [
      [-1, 0],
      [0, -0.02],
      [1, 0],
    ])
    const severity = compareEveryStep(severityInput, (solver): void => {
      solver.generateCandidates = function* (): Generator<Candidate> {
        if (solver.routes[0]!.route[1]!.y !== 0) return
        yield { routeIndex: 0, route: structuredClone(improved) }
        yield { routeIndex: 0, route: structuredClone(improved) }
      }
    })
    // Exercise both bestAdjustment commits: exhausted candidate budget and
    // exhausted generator, while preserving the real nonzero DRC issue.
    expect(severity.cached.stats.initialErrorCount).toBe(1)
    expect(severity.cached.stats.finalErrorCount).toBe(1)
    expect(severity.acceptedStateChanges).toBe(1)
    expect(severity.cachedEvaluations).toBeLessThan(
      severity.uncachedEvaluations,
    )
  }
})
