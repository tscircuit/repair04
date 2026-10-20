import { expect, test } from "bun:test"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import {
  findClearancePath,
  type ClearancePathInput,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"

type EdgeQuery = [RepairRoutePoint, RepairRoutePoint]

test("settled edges preserve paths and callback order", (): void => {
  for (const width of [1, 2, 3, 8]) {
    const bounds = { minX: 0, maxX: width, minY: 0, maxY: 8 }
    for (const heuristicWeight of [1, 3]) {
      for (const maxNodes of [3, 1000]) {
        for (const penalty of [3, Infinity]) {
          for (const endLayer of [0, 1]) {
            const start = { x: 0.5, y: 0.5, z: 0 }
            const end = { x: width - 0.5, y: 7.5, z: endLayer }
            const input: ClearancePathInput = {
              srj: {
                bounds,
                connections: [],
                allowBlindAndBuriedVias: heuristicWeight === 3,
                obstacles: [
                  {
                    type: "rect",
                    center: { x: width / 2, y: 4 },
                    width: Math.max(0.1, width - 2),
                    height: 0.5,
                    ccwRotationDegrees: 17,
                    layers: ["top"],
                    connectedTo: [],
                  },
                ],
                layerCount: 2,
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
            const queries: Array<Array<EdgeQuery>> = []
            for (const stepped of [false, true]) {
              const calls: Array<EdgeQuery> = []
              const stats: ClearancePathSearchStats = {
                nodesPopped: 0,
                completionReason: "no-path",
              }
              const args: ClearancePathInput = {
                ...input,
                stats,
                getAdditionalEdgeCost: (a, b): number => {
                  calls.push([{ ...a }, { ...b }])
                  return Math.min(a.x, b.x) <= width / 2 &&
                    Math.max(a.x, b.x) >= width / 2 &&
                    Math.min(Math.abs(a.y - 5), Math.abs(b.y - 5)) < 1
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
  }
})
