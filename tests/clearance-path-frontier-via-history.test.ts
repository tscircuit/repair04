import { expect, test } from "bun:test"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import {
  findClearancePath,
  type ClearancePathInput,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"

test("frontier via histories preserve paths, callbacks, and pop limits", (): void => {
  const bounds = { minX: -4, maxX: 4, minY: -4, maxY: 4 }
  for (const heuristicWeight of [1, 3]) {
    for (const maxNodes of [3, 1000]) {
      for (const penalty of [3, Infinity]) {
        for (const endLayer of [0, 1, 3]) {
          const start = { x: -3, y: 0, z: 0 }
          const end = { x: 3, y: 0, z: endLayer }
          const input: ClearancePathInput = {
            srj: {
              bounds,
              connections: [],
              obstacles: [],
              layerCount: 4,
              minTraceWidth: 0.1,
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
            start,
            end,
            bounds,
            traceThickness: 0.1,
            traceClearance: 0.1,
            viaClearance: 0.1,
            gridSize: 1,
            heuristicWeight,
            maxNodes,
          }
          const outputs: Array<RepairRoutePoint[] | null> = []
          const work: ClearancePathSearchStats[] = []
          const queries: Array<Array<[RepairRoutePoint, RepairRoutePoint]>> = []
          for (const stepped of [false, true]) {
            const calls: Array<[RepairRoutePoint, RepairRoutePoint]> = []
            const stats: ClearancePathSearchStats = {
              nodesPopped: 0,
              completionReason: "no-path",
            }
            const args: ClearancePathInput = {
              ...input,
              stats,
              getAdditionalEdgeCost: (a, b): number => {
                calls.push([{ ...a }, { ...b }])
                return Math.min(a.x, b.x) <= 0 &&
                  Math.max(a.x, b.x) >= 0 &&
                  Math.min(Math.abs(a.y), Math.abs(b.y)) < 1
                  ? penalty
                  : 0
              },
            }
            if (stepped) {
              const solver = new FindClearancePathSolver(args)
              while (!solver.solved && !solver.failed) solver.step()
              expect(solver.failed).toBeFalse()
              outputs.push(solver.getOutput())
            } else outputs.push(findClearancePath(args))
            work.push(stats)
            queries.push(calls)
          }
          expect(outputs[1]).toEqual(outputs[0])
          expect(work[1]).toEqual(work[0])
          expect(queries[1]).toEqual(queries[0])
          expect(work[1]!.nodesPopped).toBeLessThanOrEqual(maxNodes)
        }
      }
    }
  }
})
