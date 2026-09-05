import { expect, test } from "bun:test"
import { findClearancePath } from "../lib/findClearancePath"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"

test("clearance search navigates staggered barriers while preserving fixed endpoints and width", () => {
  const route: HighDensityRoute = {
    connectionName: "a",
    traceThickness: 0.2,
    viaDiameter: 0.6,
    vias: [],
    route: [
      { x: -4, y: 0, z: 0, pcb_port_id: "start" },
      { x: 4, y: 0, z: 0, pcb_port_id: "end" },
    ],
  }
  const srj: SimpleRouteJson = {
    layerCount: 1,
    minTraceWidth: 0.2,
    bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
    connections: [],
    obstacles: [-1.5, 1.5].map((x, i) => ({
      type: "rect",
      center: { x, y: i === 0 ? -1.5 : 1.5 },
      width: 0.5,
      height: 6,
      connectedTo: ["foreign"],
      layers: ["top"],
      zLayers: [0],
    })),
  }
  const before = structuredClone(route)
  const path = findClearancePath({
    srj,
    routes: [route],
    routeIndex: 0,
    start: route.route[0]!,
    end: route.route[1]!,
    bounds: srj.bounds,
    traceThickness: 0.2,
    traceClearance: 0.1,
    viaClearance: 0.1,
  })
  expect(path).not.toBeNull()
  expect(path![0]).toEqual(route.route[0])
  expect(path!.at(-1)).toEqual(route.route[1])
  expect(path!.some((p) => p.y > 1.7)).toBe(true)
  expect(path!.some((p) => p.y < -1.7)).toBe(true)
  expect(
    getFixedObstacleViolations({ srj, routes: [{ ...route, route: path! }] }),
  ).toHaveLength(0)
  expect(route).toEqual(before)
})
