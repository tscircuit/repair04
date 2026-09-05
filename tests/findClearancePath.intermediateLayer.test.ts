import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { findClearancePath } from "../lib/findClearancePath"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"

test("clearance-search vias clear rotated copper on every intermediate layer", () => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.2,
    viaDiameter: 0.6,
    vias: [],
    route: [
      { x: -4, y: 0, z: 0, pcb_port_id: "start" },
      { x: 4, y: 0, z: 0, pcb_port_id: "end" },
    ],
  }
  const srj: SimpleRouteJson = {
    layerCount: 3,
    minTraceWidth: 0.2,
    bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
    connections: [],
    obstacles: [
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 0.4,
        height: 12,
        connectedTo: ["foreign-wall"],
        layers: ["top", "inner1"],
        zLayers: [0, 1],
      },
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 12,
        height: 2,
        ccwRotationDegrees: 15,
        connectedTo: ["foreign-middle-copper"],
        layers: ["inner1"],
        zLayers: [1],
      },
    ],
  }
  const path = findClearancePath({
    srj,
    routes: [route],
    routeIndex: 0,
    start: route.route[0]!,
    end: route.route[1]!,
    bounds: srj.bounds,
    traceThickness: route.traceThickness,
    traceClearance: 0.1,
    viaClearance: 0.1,
  })
  expect(path).not.toBeNull()
  expect(path![0]).toEqual(route.route[0])
  expect(path!.at(-1)).toEqual(route.route[1])
  expect(path!.some((point) => point.z === 2)).toBe(true)
  let viaCount = 0
  for (let index = 1; index < path!.length; index += 1) {
    const a = path![index - 1]!,
      b = path![index]!
    expect(b.x).toBeGreaterThan(srj.bounds.minX)
    expect(b.x).toBeLessThan(srj.bounds.maxX)
    expect(b.y).toBeGreaterThan(srj.bounds.minY)
    expect(b.y).toBeLessThan(srj.bounds.maxY)
    if (index < path!.length - 1) expect(b.traceThickness).toBe(0.2)
    if (a.z === b.z) continue
    viaCount += 1
    expect({ x: a.x, y: a.y }).toEqual({ x: b.x, y: b.y })
    // Both possible transition pairs cross layer 1. Check the inverse-rotated
    // rectangle edge with the full 0.3 mm via radius and 0.1 mm clearance.
    const localY = -b.x * Math.sin(Math.PI / 12) + b.y * Math.cos(Math.PI / 12)
    expect(Math.abs(localY)).toBeGreaterThanOrEqual(1.4)
  }
  expect(viaCount).toBeGreaterThanOrEqual(2)
  expect(
    getFixedObstacleViolations({ srj, routes: [{ ...route, route: path! }] }),
  ).toHaveLength(0)
})
