import { expect, test } from "bun:test"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("rejects replacing a through-obstacle segment with a wire detour", () => {
  const input = regionSafetyFixture()
  input.routes[0]!.route = [
    { x: -2, y: 0, z: 0, toNextSegmentType: "through_obstacle" },
    { x: 2, y: 0, z: 0 },
  ]
  const region = extractRepairRegion(input)
  const repairedRoutes = structuredClone(region.routes)
  repairedRoutes[0]!.route.splice(1, 0, { x: 0, y: 1, z: 0 })
  expect(() =>
    mergeRepairRegion({ routes: input.routes, region, repairedRoutes }),
  ).toThrow("atomic jumper or through-obstacle span")
})
