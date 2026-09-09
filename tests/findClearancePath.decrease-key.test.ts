import { expect, test } from "bun:test"
import { findClearancePath } from "../lib/findClearancePath"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"

test("decreasing queued priorities reaches a legal detour within actual pop limits", (): void => {
  const bounds = { minX: -5, minY: -5, maxX: 5, maxY: 5 }
  const start = { x: -4, y: 0, z: 0 },
    end = { x: 4, y: 0, z: 0 }
  const route = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.4,
    vias: [],
    route: [start, end],
  }
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
    routes: [route],
    routeIndex: 0,
    start,
    end,
    bounds,
    traceThickness: 0.1,
    traceClearance: 0.1,
    viaClearance: 0.12,
    gridSize: 1,
    allowLayerChanges: false,
    maxNodes: 35,
    stats: { nodesPopped: 0, completionReason: "no-path" },
  }
  const path = findClearancePath(input)
  expect(path).not.toBeNull()
  expect(input.stats).toEqual({ nodesPopped: 35, completionReason: "found" })
  expect(path![0]).toEqual(start)
  expect(path!.at(-1)).toEqual(end)
  expect(
    getFixedObstacleViolations({
      srj: input.srj,
      routes: [{ ...route, route: path! }],
    }),
  ).toEqual([])
  expect(findClearancePath({ ...input, maxNodes: 34 })).toBeNull()
  expect(input.stats).toEqual({ nodesPopped: 34, completionReason: "node-limit" })
  expect(route.route).toEqual([start, end])
})
