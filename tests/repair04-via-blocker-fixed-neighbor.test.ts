import { expect, test } from "bun:test"
import { Repair04Solver, type Repair04SolverInput } from "../lib/Repair04Solver"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"

test("coupled via search waits for the original neighbor's fixed-wire contact to clear", (): void => {
  const bounds = { minX: -5, minY: -5, maxX: 5, maxY: 5 }
  const input: Repair04SolverInput = {
    bounds,
    boundaryMargin: 0.5,
    srj: {
      bounds,
      layerCount: 2,
      minTraceWidth: 0.1,
      obstacles: [],
      connections: [],
    },
    routes: [
      {
        connectionName: "via-owner",
        traceThickness: 0.1,
        viaDiameter: 0.3,
        vias: [{ x: 0, y: 0 }],
        route: [
          { x: -1, y: -1, z: 0 },
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 1 },
          { x: 1, y: -1, z: 1 },
        ],
      },
      {
        connectionName: "original-neighbor",
        traceThickness: 0.1,
        viaDiameter: 0.3,
        vias: [],
        route: [
          { x: -0.25, y: -0.2, z: 1 },
          { x: -0.25, y: 0.2, z: 1 },
        ],
      },
      {
        connectionName: "new-neighbor",
        traceThickness: 0.1,
        viaDiameter: 0.3,
        vias: [],
        route: [
          { x: 0.325, y: -2, z: 0 },
          { x: 0.325, y: 2, z: 0 },
        ],
      },
    ],
    lockedPointIndices: [
      [true, false, false, true],
      [true, true],
      [true, true],
    ],
    movableVias: [{ routeIndex: 0, viaIndex: 0 }],
    allowLayerChanges: false,
    maxCandidateAttempts: 512,
    maxPathSearchNodes: 120000,
  }
  input.srj.obstacles.push({
    type: "rect",
    center: { x: -0.25, y: 0.16 },
    width: 0.04,
    height: 0.04,
    layers: ["bottom"],
    connectedTo: [],
  })
  expect(
    getFixedObstacleViolations(input).some(
      (violation): boolean =>
        violation.kind === "wire" && violation.routeIndex === 1,
    ),
  ).toBe(true)
  const solver = new Repair04Solver(input)
  const access = solver as unknown as {
    generateCandidates(): Generator<{
      routeIndex: number
      route: (typeof input.routes)[number]
    }>
    generateViaBlockerCandidates(
      selected: { routeIndex: number; viaIndex: number },
      candidate: { routeIndex: number; route: (typeof input.routes)[number] },
    ): Generator<{ routeIndex: number; route: (typeof input.routes)[number] }>
  }
  access.generateCandidates = function* (): Generator<{
    routeIndex: number
    route: (typeof input.routes)[number]
  }> {
    const moved = structuredClone(input.routes[0]!)
    moved.vias[0]!.x = 0.05
    moved.route[1]!.x = 0.05
    moved.route[2]!.x = 0.05
    const candidate = { routeIndex: 0, route: moved }
    yield candidate
    yield* access.generateViaBlockerCandidates(
      { routeIndex: 0, viaIndex: 0 },
      candidate,
    )
  }
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(
    (solver as unknown as { viaBlockerPathSearchCalls: number })
      .viaBlockerPathSearchCalls,
  ).toBe(0)
})
