import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { getRepairJunctionAnchors } from "../lib/getRepairJunctionAnchors"

test("exact immutable route endpoints prove connectivity without port metadata", (): void => {
  const bounds = { minX: -1, maxX: 4, minY: -2, maxY: 2 }
  const srj = {
    layerCount: 2,
    minTraceWidth: 0.1,
    bounds,
    obstacles: [],
    connections: [],
  }
  const routes: HighDensityRoute[] = [-1, 1].map((side, index) => ({
    connectionName: `branch-${index}`,
    rootConnectionName: "shared-net",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [],
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: side, z: 0 },
      { x: 3, y: -side, z: 0 },
    ],
  }))
  const count = (input: HighDensityRoute[]): number =>
    getRepairJunctionAnchors(srj, input, bounds).reduce(
      (sum, anchors) =>
        sum + anchors.segmentTimes.size + anchors.viaPositions.length,
      0,
    )
  expect(count(routes)).toBe(0)
  // Nearby copper or equal XY on another layer does not prove that the fixed
  // endpoint itself provides the connection: retain the interior crossing.
  const nearby = structuredClone(routes)
  nearby[1]!.route[0]!.y = 0.01
  expect(count(nearby)).toBeGreaterThan(0)
  const otherLayer = structuredClone(routes)
  otherLayer[1]!.route.unshift({ x: 0, y: 0, z: 1 })
  expect(count(otherLayer)).toBeGreaterThan(0)
  const foreign = structuredClone(routes)
  foreign[1]!.rootConnectionName = "foreign-net"
  expect(count(foreign)).toBe(0)
})
