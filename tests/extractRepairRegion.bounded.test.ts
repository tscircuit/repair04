import { expect, test } from "bun:test"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("clips long traversing copper, retains a clearance halo, and strips embedded full-board state", () => {
  const input = regionSafetyFixture()
  Object.assign(input.srj, {
    sourceCircuitJson: [{ sentinel: "full-board" }],
    sourceKicadPcb: "full-source",
  })
  const region = extractRepairRegion(input)
  expect(region.routes).toHaveLength(1)
  expect(region.routes[0]!.route[0]).toEqual({ x: -5.5, y: 0, z: 0 })
  expect(region.routes[0]!.route.at(-1)).toEqual({ x: 5.5, y: 0, z: 0 })
  expect(region.lockedPointIndices[0]).toEqual([true, true, false, true, true])
  expect(region.srj.obstacles.map((obstacle) => obstacle.obstacleId)).toEqual([
    "near-copper",
  ])
  expect(JSON.stringify(region)).not.toContain("full-board")
  expect(JSON.stringify(region)).not.toContain("full-source")
  expect(region.srj.connections[0]!.rootConnectionName).toBe("signal-net")
  expect(region.srj.connections[0]!.pointsToConnect).toHaveLength(2)
  expect(() =>
    extractRepairRegion({ ...input, bounds: { ...input.bounds, maxX: 4 } }),
  ).toThrow("at least 10 mm by 10 mm")
})
