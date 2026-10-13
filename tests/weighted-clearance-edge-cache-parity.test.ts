import { expect, test } from "bun:test"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import {
  findClearancePath,
  type ClearancePathInput,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"

test("settled clearance keeps paths and edge queries", (): void => {
  const bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 }
  const start = { x: -4, y: 0, z: 0 }
  const end = { x: 4, y: 0, z: 3 }
  for (const heuristicWeight of [1, 3]) {
    for (const allowBlindAndBuriedVias of [false, true]) {
      for (const gridSize of [0.5, 0.009]) {
        const input: ClearancePathInput = {
          srj: {
            bounds,
            layerCount: 4,
            allowBlindAndBuriedVias,
            minTraceWidth: 0.1,
            connections: [],
            obstacles: [
              {
                type: "rect",
                center: { x: 0, y: 0 },
                width: 1.8,
                height: 5,
                ccwRotationDegrees: 15,
                layers: ["top", "inner1", "inner2", "bottom"],
                connectedTo: ["fixed"],
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
          start,
          end,
          bounds,
          traceThickness: 0.1,
          traceClearance: 0.1,
          viaClearance: 0.1,
          gridSize,
          heuristicWeight,
          maxNodes: 1000,
        }
        const paths: Array<RepairRoutePoint[] | null> = []
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
              return b.y > a.y ? 0.25 : 0
            },
          }
          if (stepped) {
            const solver = new FindClearancePathSolver(args)
            while (!solver.solved && !solver.failed) solver.step()
            expect(solver.failed).toBeFalse()
            paths.push(solver.getOutput())
          } else paths.push(findClearancePath(args))
          work.push(stats)
          queries.push(calls)
        }
        expect(paths[1]).toEqual(paths[0])
        expect(work[1]).toEqual(work[0])
        expect(queries[1]).toEqual(queries[0])
        expect(work[1]!.nodesPopped).toBeLessThanOrEqual(1000)
      }
    }
  }
})
