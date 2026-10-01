import { expect, spyOn, test } from "bun:test"
import {
  findClearancePath,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"

test("bounded grids avoid numeric state map writes without changing sparse paths or node limits", (): void => {
  const route = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.4,
    vias: [],
    route: [
      { x: -4, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    ],
  }
  for (const halfSize of [5, 5000]) {
    for (const maxNodes of [34, 35]) {
      const bounds = {
        minX: -halfSize,
        maxX: halfSize,
        minY: -halfSize,
        maxY: halfSize,
      }
      const stats: ClearancePathSearchStats = {
        nodesPopped: 0,
        completionReason: "no-path",
      }
      const writes = spyOn(Map.prototype, "set")
      let path: ReturnType<typeof findClearancePath>
      let numericWrites: number
      try {
        path = findClearancePath({
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
          routes: [route],
          routeIndex: 0,
          start: route.route[0]!,
          end: route.route[1]!,
          bounds,
          traceThickness: 0.1,
          traceClearance: 0.1,
          viaClearance: 0.12,
          gridSize: 1,
          allowLayerChanges: false,
          maxNodes,
          stats,
        })
        numericWrites = writes.mock.calls.filter(
          ([, value]): boolean => typeof value === "number",
        ).length
      } finally {
        writes.mockRestore()
      }
      expect(stats).toEqual({
        nodesPopped: maxNodes,
        completionReason: maxNodes === 34 ? "node-limit" : "found",
      })
      expect(path).toEqual(
        maxNodes === 34
          ? null
          : [
              route.route[0]!,
              { x: 0.5, y: -3.5, z: 0, traceThickness: 0.1 },
              { x: 2.5, y: -2.5, z: 0, traceThickness: 0.1 },
              route.route[1]!,
            ],
      )
      if (halfSize === 5) expect(numericWrites).toBe(0)
      else expect(numericWrites).toBeGreaterThan(0)
    }
  }
})
