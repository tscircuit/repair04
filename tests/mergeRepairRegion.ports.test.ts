import { expect, test } from "bun:test"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("locks interior port points and original route endpoints even far from the crop boundary", () => {
  const input = regionSafetyFixture()
  input.routes[0]!.route = [
    { x: -2, y: 0, z: 0 },
    { x: 0, y: 0, z: 0, pcb_port_id: "interior-branch-port" },
    { x: 2, y: 0, z: 0 },
  ]
  const region = extractRepairRegion(input)
  expect(region.lockedPointIndices[0]).toEqual([true, true, true])
  const repairedRoutes = structuredClone(region.routes)
  repairedRoutes[0]!.route[1]!.y = 1
  expect(() =>
    mergeRepairRegion({ routes: input.routes, region, repairedRoutes }),
  ).toThrow("locked point")
})
