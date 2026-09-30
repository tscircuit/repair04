import { expect, spyOn, test } from "bun:test"
import { findClearancePath } from "../lib/findClearancePath"

test("unimprovable neighbors skip edge lengths without changing the path or pop limit", (): void => {
  const bounds = { minX: -5, minY: -5, maxX: 5, maxY: 5 }
  const start = { x: -4, y: 0, z: 0 }
  const end = { x: 4, y: 0, z: 0 }
  const input: Parameters<typeof findClearancePath>[0] = {
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
    stats: { nodesPopped: 0, completionReason: "no-path" },
  }
  for (const maxNodes of [34, 35]) {
    const length = spyOn(Math, "hypot")
    try {
      const path = findClearancePath({ ...input, maxNodes })
      // Captured from the unchanged search: 34 pops exhaust the budget and
      // 35 find this exact detour. Only redundant length calculations disappear.
      expect(path).toEqual(
        maxNodes === 34
          ? null
          : [
              start,
              { x: 0.5, y: -3.5, z: 0, traceThickness: 0.1 },
              { x: 2.5, y: -2.5, z: 0, traceThickness: 0.1 },
              end,
            ],
      )
      expect(input.stats).toEqual({
        nodesPopped: maxNodes,
        completionReason: maxNodes === 34 ? "node-limit" : "found",
      })
      // The previous implementation made 393 and 394 calls, respectively.
      expect(length.mock.calls.length).toBeLessThan(maxNodes === 34 ? 393 : 394)
      expect(input.routes[0]!.route).toEqual([start, end])
    } finally {
      length.mockRestore()
    }
  }
})
