import { expect, test } from "bun:test"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import {
  findClearancePath,
  type ClearancePathInput,
} from "../lib/findClearancePath"

test("zero-cost cell zero reconstructs its children", (): void => {
  const bounds = { minX: -1, maxX: 1, minY: -1, maxY: 1 }
  const start = { x: -0.5, y: -0.5, z: 0 }
  const end = { x: 0.5, y: 0.5, z: 1 }
  for (const heuristicWeight of [1, 3]) {
    const input: ClearancePathInput = {
      srj: {
        bounds,
        layerCount: 2,
        minTraceWidth: 0.1,
        connections: [],
        obstacles: [],
      },
      routes: [
        {
          connectionName: "signal",
          traceThickness: 0.1,
          viaDiameter: 0.3,
          route: [start, end],
          vias: [],
        },
      ],
      routeIndex: 0,
      start,
      end,
      bounds,
      traceThickness: 0.1,
      traceClearance: 0.1,
      viaClearance: 0.1,
      gridSize: 1,
      heuristicWeight,
      maxNodes: 100,
    }
    const solver = new FindClearancePathSolver(input)
    solver.solve()
    expect(solver.failed).toBeFalse()
    expect(solver.getOutput()).not.toBeNull()
    expect(solver.getOutput()).toEqual(findClearancePath(input))
    expect(solver.getOutput()![0]).toEqual(start)
    expect(solver.getOutput()!.at(-1)).toEqual(end)
  }
})
