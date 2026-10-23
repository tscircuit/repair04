import { expect, test } from "bun:test"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import {
  findClearancePath,
  type ClearancePathInput,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"

test("packed edge permissions preserve narrow grids, diagonals and via spans", (): void => {
  for (const nx of [1, 2, 3, 4, 11]) {
    for (const blindVias of [false, true]) {
      for (const heuristicWeight of [1, 3]) {
        for (const reverse of [false, true]) {
          const bounds = { minX: 0, maxX: nx, minY: 0, maxY: 8 }
          const endpoints = [
            { x: 0.5, y: 0.5, z: 0 },
            { x: nx - 0.5, y: 7.5, z: 2 },
          ]
          const [start, end] = reverse ? endpoints.reverse() : endpoints
          const input: ClearancePathInput = {
            srj: {
              bounds,
              layerCount: 3,
              minTraceWidth: 0.1,
              allowBlindAndBuriedVias: blindVias,
              connections: [],
              obstacles: [
                {
                  type: "rect",
                  center: { x: nx / 2, y: 4 },
                  width: Math.max(0.1, nx - 1),
                  height: 0.2,
                  layers: ["top"],
                  connectedTo: [],
                },
              ],
            },
            routes: [{ connectionName: "signal", traceThickness: 0.1, viaDiameter: 0.4, vias: [], route: [start!, end!] }],
            routeIndex: 0,
            start: start!,
            end: end!,
            bounds,
            gridSize: 1,
            traceThickness: 0.1,
            traceClearance: 0.1,
            viaClearance: 0.1,
            heuristicWeight,
            maxNodes: 500,
          }
          const outputs: Array<RepairRoutePoint[] | null> = []
          const counters: ClearancePathSearchStats[] = []
          const querySequences: string[][] = []
          for (const stepped of [false, true]) {
            const stats: ClearancePathSearchStats = { nodesPopped: 0, completionReason: "no-path" }
            const queries: string[] = []
            const args: ClearancePathInput = {
              ...input,
              stats,
              getAdditionalEdgeCost: (a, b): number => {
                queries.push(JSON.stringify([a, b]))
                return Math.abs((a.x + b.x) / 2 - nx / 2) < 1 &&
                  Math.abs((a.y + b.y) / 2 - 4) < 2 ? 0.25 : 0
              },
            }
            if (stepped) {
              const solver = new FindClearancePathSolver(args)
              solver.solve()
              expect(solver.failed).toBeFalse()
              outputs.push(solver.getOutput())
            } else outputs.push(findClearancePath(args))
            counters.push(stats)
            querySequences.push(queries)
          }
          expect(outputs[1]).toEqual(outputs[0])
          expect(counters[1]).toEqual(counters[0])
          expect(querySequences[1]).toEqual(querySequences[0])
        }
      }
    }
  }
})
