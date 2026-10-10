import { expect, test } from "bun:test"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import {
  findClearancePath,
  type ClearancePathInput,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"

test("dense storage boundary preserves detours and pop limits", (): void => {
  const start = { x: -4, y: 0, z: 0 }
  const end = { x: 4, y: 0, z: 0 }
  for (const maxY of [250, 251, 4000]) {
    const bounds = { minX: -500, maxX: 500, minY: -250, maxY }
    for (const maxNodes of [34, 35]) {
      const input: ClearancePathInput = {
        srj: {
          layerCount: 2,
          minTraceWidth: 0.1,
          bounds,
          connections: [],
          obstacles: [
            {
              type: "rect",
              center: { x: 0, y: 0 },
              width: 0.2,
              height: 6,
              ccwRotationDegrees: 17,
              layers: ["top"],
              connectedTo: [],
            },
          ],
        },
        routes: [
          {
            connectionName: "signal",
            traceThickness: 0.1,
            viaDiameter: 0.4,
            vias: [],
            route: [start, end],
          },
        ],
        routeIndex: 0,
        start,
        end,
        bounds,
        traceThickness: 0.1,
        traceClearance: 0.1,
        viaClearance: 0.12,
        gridSize: 1,
        allowLayerChanges: false,
        maxNodes,
      }
      const referenceStats: ClearancePathSearchStats = {
        nodesPopped: 0,
        completionReason: "no-path",
      }
      const stats: ClearancePathSearchStats = {
        nodesPopped: 0,
        completionReason: "no-path",
      }
      const reference = findClearancePath({ ...input, stats: referenceStats })
      const solver = new FindClearancePathSolver({ ...input, stats })
      while (!solver.solved && !solver.failed) solver.step()
      expect(solver.failed).toBeFalse()
      expect(solver.getOutput()).toEqual(reference)
      expect(stats).toEqual(referenceStats)
      expect(stats).toEqual({
        nodesPopped: maxNodes,
        completionReason: maxNodes === 35 ? "found" : "node-limit",
      })
      expect(solver.getOutput()).toEqual(
        maxNodes === 34
          ? null
          : [
              start,
              { x: 0.5, y: -3.5, z: 0, traceThickness: 0.1 },
              { x: 2.5, y: -2.5, z: 0, traceThickness: 0.1 },
              end,
            ],
      )
    }
  }
})
