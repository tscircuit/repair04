import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { Repair04Solver } from "../lib/Repair04Solver"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("every generated near-boundary bridge keeps new vias inside and satisfies the merge contract", () => {
  const input = regionSafetyFixture()
  input.routes[0]!.route = [
    { x: -100, y: 0, z: 0 },
    { x: 100, y: 0, z: 0 },
  ]
  const region = extractRepairRegion(input)
  const solver = new Repair04Solver({
    allowLayerChanges: true,
    srj: region.srj,
    routes: region.routes,
    bounds: region.bounds,
    boundaryMargin: region.boundaryMargin,
    lockedPointIndices: region.lockedPointIndices,
  })
  const inspect = solver as unknown as {
    score: {
      count: number
      severity: number
      errors: Array<{ center: { x: number; y: number } }>
    }
    generateCandidates(): Generator<{
      routeIndex: number
      route: HighDensityRoute
    }>
  }
  inspect.score = {
    count: 1,
    severity: 1,
    errors: [{ center: { x: -3.9, y: 0 } }],
  }
  let candidateCount = 0
  let bridgeCount = 0
  for (const candidate of inspect.generateCandidates()) {
    candidateCount += 1
    for (const via of candidate.route.vias) {
      bridgeCount += 1
      expect(via.x).toBeGreaterThan(region.mutableBounds.minX)
      expect(via.x).toBeLessThan(region.mutableBounds.maxX)
      expect(via.y).toBeGreaterThan(region.mutableBounds.minY)
      expect(via.y).toBeLessThan(region.mutableBounds.maxY)
    }
    const repairedRoutes = region.routes.slice()
    repairedRoutes[candidate.routeIndex] = candidate.route
    expect(() =>
      mergeRepairRegion({ routes: input.routes, region, repairedRoutes }),
    ).not.toThrow()
  }
  expect(candidateCount).toBeGreaterThan(0)
  expect(bridgeCount).toBeGreaterThan(0)
})
