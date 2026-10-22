import { expect, test } from "bun:test"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import {
  findClearancePath,
  type ClearancePathInput,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"

test("weighted edge-cache bypass preserves dense, sparse and via searches", (): void => {
  for (const extent of [6, 600, 100_000]) {
    for (const heuristicWeight of [1, 3]) {
      for (const allowBlindAndBuriedVias of [false, true]) {
        for (const endZ of [0, 1]) {
          const bounds = {
            minX: -extent,
            maxX: extent,
            minY: -extent,
            maxY: extent,
          }
          const start = { x: -4, y: 0, z: 0 }
          const end = { x: 4, y: 0, z: endZ }
          const input: ClearancePathInput = {
            srj: {
              layerCount: 4,
              allowBlindAndBuriedVias,
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
            heuristicWeight,
            maxNodes: 1000,
          }
          const outputs: Array<RepairRoutePoint[] | null> = []
          const work: ClearancePathSearchStats[] = []
          const callbacks: Array<Array<[RepairRoutePoint, RepairRoutePoint]>> =
            []
          for (const incremental of [false, true]) {
            const calls: Array<[RepairRoutePoint, RepairRoutePoint]> = []
            const stats: ClearancePathSearchStats = {
              nodesPopped: 0,
              completionReason: "no-path",
            }
            const search: ClearancePathInput = {
              ...input,
              stats,
              getAdditionalEdgeCost: (a, b): number => {
                calls.push([{ ...a }, { ...b }])
                return a.y > 0 || b.y > 0 ? 0.25 : 0
              },
            }
            if (incremental) {
              const solver = new FindClearancePathSolver(search)
              while (!solver.solved && !solver.failed) solver.step()
              expect(solver.failed).toBeFalse()
              outputs.push(solver.getOutput())
            } else {
              outputs.push(findClearancePath(search))
            }
            work.push(stats)
            callbacks.push(calls)
          }
          expect(work[0]!.nodesPopped).toBeGreaterThan(0)
          expect(work[0]!.completionReason).toBe("found")
          expect(outputs[1]).toEqual(outputs[0])
          expect(work[1]).toEqual(work[0])
          expect(callbacks[1]).toEqual(callbacks[0])
        }
      }
    }
  }
})
