import { expect, test } from "bun:test"
import {
  findClearancePath,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"

test("nonnegative congestion preserves detours and exact work accounting", (): void => {
  const bounds = { minX: -4, maxX: 4, minY: -4, maxY: 4 }
  const start = { x: -3, y: 0, z: 0 },
    end = { x: 3, y: 0, z: 0 }
  for (const penalty of [0, 3, Infinity]) {
    for (const maxNodes of [3, 1000]) {
      const stats: ClearancePathSearchStats = {
        nodesPopped: 0,
        completionReason: "no-path",
      }
      let queries = 0
      const path = findClearancePath({
        srj: {
          bounds,
          connections: [],
          obstacles: [],
          layerCount: 1,
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
        allowLayerChanges: false,
        maxNodes,
        stats,
        getAdditionalEdgeCost: (a, b): number => {
          queries++
          return Math.min(a.x, b.x) <= 0 &&
            Math.max(a.x, b.x) >= 0 &&
            Math.min(Math.abs(a.y), Math.abs(b.y)) < 1
            ? penalty
            : 0
        },
      })
      // These routes and pop counts are the published implementation's
      // results. Only unnecessary congestion queries should disappear.
      const limited = penalty !== 0 && maxNodes === 3
      const expected: RepairRoutePoint[] | null = limited
        ? null
        : penalty === 0
          ? [start, end]
          : [
              start,
              { x: -0.5, y: -1.5, z: 0, traceThickness: 0.1 },
              { x: 0.5, y: -1.5, z: 0, traceThickness: 0.1 },
              end,
            ]
      expect(path).toEqual(expected)
      expect(stats).toEqual({
        nodesPopped: penalty === 0 || limited ? 3 : 9,
        completionReason: limited ? "node-limit" : "found",
      })
      expect(queries).toBeLessThan(penalty === 0 ? 42 : limited ? 44 : 91)
    }
  }
})
