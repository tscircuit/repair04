import { expect, test } from "bun:test"
import { segmentToSegmentMinDistance } from "@tscircuit/math-utils"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import {
  findClearancePath,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"

test("round plated-hole corners remain routable with the declared pad clearance", () => {
  for (const offset of [0, 12.345]) {
    const center = { x: offset, y: offset }
    const start = { x: offset - 3.05, y: offset - 3.05, z: 0 }
    const end = { x: offset - 2.9, y: offset - 3.05, z: 0 }
    const route: HighDensityRoute = {
      connectionName: "signal",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      route: [start, end],
      vias: [],
    }
    const srj: SimpleRouteJson = {
      layerCount: 2,
      minTraceWidth: 0.1,
      minTraceToPadEdgeClearance: 0.1,
      bounds: {
        minX: offset - 4,
        maxX: offset + 4,
        minY: offset - 4,
        maxY: offset + 4,
      },
      connections: [
        {
          name: "signal",
          pointsToConnect: [
            { ...start, layer: "top" },
            { ...end, layer: "top" },
          ],
        },
      ],
      obstacles: [
        {
          type: "oval",
          center,
          width: 6,
          height: 6,
          layers: ["top", "bottom"],
          connectedTo: ["ground"],
        },
      ],
    }
    const stats: ClearancePathSearchStats = {
      nodesPopped: 0,
      completionReason: "no-path",
    }
    const params = {
      srj,
      routes: [route],
      routeIndex: 0,
      start,
      end,
      bounds: srj.bounds,
      traceThickness: 0.1,
      traceClearance: 0.1,
      viaClearance: 0.1,
      allowLayerChanges: false,
      maxNodes: 1000,
      stats,
    }
    const path = findClearancePath(params)
    expect(path).not.toBeNull()
    expect(stats.completionReason).toBe("found")
    for (let i = 1; i < path!.length; i++) {
      expect(
        segmentToSegmentMinDistance(path![i - 1]!, path![i]!, center, center),
      ).toBeGreaterThanOrEqual(3.15 - 1e-8)
    }
    const squareSrj = {
      ...srj,
      obstacles: srj.obstacles.map((obstacle) => ({
        ...obstacle,
        type: "rect" as const,
      })),
    }
    expect(findClearancePath({ ...params, srj: squareSrj })).toBeNull()
    const smtSrj = {
      ...srj,
      obstacles: srj.obstacles.map((obstacle) => ({
        ...obstacle,
        layers: ["top"],
      })),
    }
    expect(findClearancePath({ ...params, srj: smtSrj })).toBeNull()
  }
})
