import { segmentToSegmentMinDistance } from "@tscircuit/math-utils"
import { expect, test } from "bun:test"
import type { HighDensityRoute, SimpleRouteJson } from "high-density-repair03/lib"
import {
  findClearancePath,
  type ClearancePathSearchStats,
} from "../lib/findClearancePath"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"

test("clearance search pays congestion on the final edge to its terminal", (): void => {
  const start: RepairRoutePoint = { x: -2, y: 0, z: 0 }
  const end: RepairRoutePoint = { x: 0, y: 0, z: 0 }
  const crossingStart = { x: -0.15, y: -0.25 }
  const crossingEnd = { x: -0.15, y: 0.25 }
  const clearance = 0.1
  const srj: SimpleRouteJson = {
    layerCount: 1,
    minTraceWidth: 0.1,
    bounds: { minX: -3, maxX: 1, minY: -1, maxY: 1 },
    obstacles: [],
    connections: [],
  }
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [],
    route: [start, end],
  }
  // Use the negotiator's distance-weighted congestion kernel. The vertical
  // copper ends above and below the terminal, so a clear detour exists.
  const congestionCost = (
    a: RepairRoutePoint,
    b: RepairRoutePoint,
  ): number => {
    const distance = segmentToSegmentMinDistance(
      a,
      b,
      crossingStart,
      crossingEnd,
    )
    const penetration = Math.max(0, clearance - distance)
    const displacedRouteCost = 20
    return (
      (penetration / (clearance * clearance)) *
      displacedRouteCost *
      Math.hypot(b.x - a.x, b.y - a.y)
    )
  }
  const stats: ClearancePathSearchStats = {
    nodesPopped: 0,
    completionReason: "no-path",
  }
  const path = findClearancePath({
    srj,
    routes: [route],
    routeIndex: 0,
    start,
    end,
    bounds: srj.bounds,
    traceThickness: route.traceThickness,
    traceClearance: clearance,
    viaClearance: clearance,
    gridSize: 0.1,
    allowLayerChanges: false,
    maxNodes: 1000,
    stats,
    getAdditionalEdgeCost: congestionCost,
  })

  expect(path).not.toBeNull()
  expect(stats.completionReason).toBe("found")
  expect(stats.nodesPopped).toBeLessThanOrEqual(1000)
  expect(path![0]).toEqual(start)
  expect(path!.at(-1)).toEqual(end)
  for (let index = 1; index < path!.length; index++) {
    expect(congestionCost(path![index - 1]!, path![index]!)).toBe(0)
  }
  expect(route.route).toEqual([start, end])
})
