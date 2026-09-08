import { expect, test } from "bun:test"
import { Repair04Solver, type Repair04SolverInput } from "../lib/Repair04Solver"
import { getRepairViaGeometry } from "../lib/getRepairViaGeometry"

test("an ordinary selected-via move can atomically reroute its newly blocked foreign trace", (): void => {
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
  const solver = new Repair04Solver(input)
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.stats.initialErrorCount).toBe(1)
  expect(solver.stats.finalErrorCount).toBe(0)
  const calls = (solver as unknown as { viaBlockerPathSearchCalls: number })
    .viaBlockerPathSearchCalls
  expect(calls).toBeGreaterThan(0)
  expect(calls).toBeLessThanOrEqual(4)
  const output = solver.getOutput()
  expect(output[2]).not.toEqual(input.routes[2])
  expect(output[1]).toEqual(input.routes[1])
  for (let i = 0; i < output.length; i++) {
    expect(output[i]!.route[0]).toEqual(input.routes[i]!.route[0])
    expect(output[i]!.route.at(-1)).toEqual(input.routes[i]!.route.at(-1))
    expect(output[i]!.traceThickness).toBe(input.routes[i]!.traceThickness)
  }
  const vias = getRepairViaGeometry(output[0]!, 2)
  expect(vias).toHaveLength(1)
  expect(vias[0]!.layerSequence).toEqual([0, 1])
  expect(vias[0]!.diameter).toBe(0.3)
})
