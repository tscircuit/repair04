import { expect, test } from "bun:test"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import {
  findClearancePath,
  type ClearancePathInput,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"

test("lazy dense costs preserve zero-cost roots, predecessors and search limits", (): void => {
  for (const layerCount of [1, 2]) {
    for (const heuristicWeight of [1, 1.5]) {
      for (const maxNodes of [1, 1000]) {
        for (const coincident of [false, true]) {
          const bounds = { minX: 0, minY: 0, maxX: 3, maxY: 3 }
          const start = { x: 0.25, y: 0.25, z: 0 }
          const end = coincident
            ? start
            : { x: 2.75, y: 2.75, z: layerCount - 1 }
          const input: ClearancePathInput = {
            srj: {
              bounds,
              layerCount,
              minTraceWidth: 0.1,
              connections: [],
              obstacles: [
                {
                  type: "rect",
                  center: { x: 1.5, y: 1.5 },
                  width: 0.5,
                  height: 0.5,
                  layers: ["top"],
                  connectedTo: ["foreign-pad"],
                },
              ],
            },
            routes: [
              {
                connectionName: "signal",
                traceThickness: 0.1,
                viaDiameter: 0.3,
                vias: [],
                route: [start, end],
              },
            ],
            routeIndex: 0,
            bounds,
            start,
            end,
            traceThickness: 0.1,
            traceClearance: 0.1,
            viaClearance: 0.1,
            gridSize: 0.5,
            heuristicWeight,
            maxNodes,
            getAdditionalEdgeCost: (a, b): number =>
              a.x === b.x && a.y === b.y && a.z === b.z ? 0 : 0.00001,
          }
          const expectedStats: ClearancePathSearchStats = {
            nodesPopped: 0,
            completionReason: "no-path",
          }
          const expected = findClearancePath({ ...input, stats: expectedStats })
          const solver = new FindClearancePathSolver(input)
          solver.solve()
          expect(solver.failed).toBe(false)
          expect(solver.getOutput()).toEqual(expected)
          expect(solver.stats).toEqual(expectedStats)
          expect(solver.stats.nodesPopped).toBeGreaterThan(0)
          if (coincident) expect(solver.getOutput()).toEqual([start, end])
        }
      }
    }
  }
})
