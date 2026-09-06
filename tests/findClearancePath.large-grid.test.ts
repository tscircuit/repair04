import { expect, test } from "bun:test"
import {
  findClearancePath,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"

test("large grids preserve clearance paths when edge pairs exceed exact numeric key range", (): void => {
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
  for (const halfSize of [5, 3000, 4000, 5000]) {
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
    const path = findClearancePath({
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
      maxNodes: 4000,
      stats,
    })
    expect(path).toEqual([
      route.route[0]!,
      { x: 0.5, y: -3.5, z: 0, traceThickness: 0.1 },
      { x: 2.5, y: -2.5, z: 0, traceThickness: 0.1 },
      route.route[1]!,
    ])
    expect(stats).toEqual({ nodesPopped: 42, completionReason: "found" })
  }
})
