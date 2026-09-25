import { expect, test } from "bun:test"
import { findClearancePath } from "../lib/findClearancePath"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import type { SimpleRouteJson } from "../lib/holeClearanceTypes"
import type { HighDensityRoute } from "high-density-repair03/lib"

test("hole margin is independent of pad margin and leaves physical geometry unchanged", (): void => {
  for (const clearance of [0.05, 0.2, 0.5]) {
    const srj: SimpleRouteJson = {
      layerCount: 2, minTraceWidth: 0.2, minTraceToPadEdgeClearance: 0.35,
      minTraceToHoleEdgeClearance: clearance,
      bounds: { minX: -4, maxX: 4, minY: -4, maxY: 4 }, connections: [],
      obstacles: [{
        type: "rect", isHole: true, shape: "circle", center: { x: 0, y: 0 },
        width: 2, height: 2, layers: ["top", "bottom"], connectedTo: [],
      }],
    }
    const route: HighDensityRoute = {
      connectionName: "signal", traceThickness: 0.2, viaDiameter: 0.4, vias: [],
      route: [{ x: -3, y: 1.1 + clearance, z: 0 }, { x: 3, y: 1.1 + clearance, z: 0 }],
    }
    expect(getFixedObstacleViolations({ srj, routes: [route] })).toHaveLength(0)
    route.route.forEach((p) => { p.y -= 0.01 })
    expect(getFixedObstacleViolations({ srj, routes: [route] })).toHaveLength(1)
    const before = JSON.stringify(srj)
    const path = findClearancePath({
      srj, routes: [route], routeIndex: 0,
      start: route.route[0]!, end: route.route[1]!, bounds: srj.bounds,
      traceThickness: 0.2, traceClearance: 0.1, viaClearance: 0.1,
      allowLayerChanges: false, gridSize: 0.025,
    })
    expect(path).not.toBeNull()
    expect(getFixedObstacleViolations({ srj, routes: [{ ...route, route: path! }] })).toHaveLength(0)
    expect(JSON.stringify(srj)).toBe(before)
    srj.obstacles[0]!.isHole = false
    const violations = getFixedObstacleViolations({ srj, routes: [route] })
    expect(violations.length > 0).toBe(clearance < 0.36)
  }
})
