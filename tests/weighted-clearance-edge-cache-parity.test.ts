import { expect, test } from "bun:test"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import {
  findClearancePath,
  type ClearancePathInput,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"

test("settled searches preserve paths, callbacks, and work without an edge cache", (): void => {
  const start = { x: -3, y: 0, z: 0 }
  for (const bounds of [
    { minX: -4, maxX: 4, minY: -4, maxY: 4 },
    { minX: -256, maxX: 256, minY: -256, maxY: 256 },
    { minX: -100_000, maxX: 100_000, minY: -100_000, maxY: 100_000 },
  ]) {
    for (const heuristicWeight of [1, 1.5, 3]) {
      for (const allowBlindAndBuriedVias of [false, true]) {
        for (const maxNodes of [3, 1000]) {
          for (const endLayer of [0, 1, 3]) {
            for (const penalty of [3, Infinity]) {
              const end = { x: 3, y: 0, z: endLayer }
              const input: ClearancePathInput = {
                srj: {
                  bounds,
                  connections: [],
                  obstacles: [
                    {
                      type: "rect",
                      center: { x: 0, y: 0 },
                      width: 0.2,
                      height: 3,
                      ccwRotationDegrees: 17,
                      layers: ["top", "inner2"],
                      connectedTo: ["pad"],
                    },
                  ],
                  layerCount: 4,
                  minTraceWidth: 0.1,
                  allowBlindAndBuriedVias,
                },
                routes: [
                  {
                    connectionName: "signal",
                    traceThickness: 0.1,
                    viaDiameter: 0.3,
                    vias: [],
                    route: [start, end],
                  },
                  {
                    connectionName: "other-via",
                    traceThickness: 0.1,
                    viaDiameter: 0.3,
                    vias: [{ x: 1, y: 0.5 }],
                    route: [
                      { x: 1, y: 0.5, z: 0 },
                      { x: 1, y: 0.5, z: 1 },
                    ],
                  },
                ],
                routeIndex: 0,
                start,
                end,
                bounds,
                traceThickness: 0.1,
                traceClearance: 0.1,
                viaClearance: 0.1,
                gridSize: 0.5,
                maxNodes,
                heuristicWeight,
              }
              const outputs: Array<RepairRoutePoint[] | null> = []
              const work: ClearancePathSearchStats[] = []
              const queries: Array<
                Array<[RepairRoutePoint, RepairRoutePoint]>
              > = []
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
                  solver.solve()
                  expect(solver.failed).toBeFalse()
                  outputs.push(solver.getOutput())
                } else outputs.push(findClearancePath(args))
                work.push(stats)
                queries.push(calls)
              }
              expect(outputs[1]).toEqual(outputs[0])
              expect(work[1]).toEqual(work[0])
              expect(queries[1]).toEqual(queries[0])
            }
          }
        }
      }
    }
  }
})
