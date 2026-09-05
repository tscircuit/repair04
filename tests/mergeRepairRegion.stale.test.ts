import { expect, test } from "bun:test"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("rejects stale interior source geometry even if crop intersections are unchanged", () => {
  const input = regionSafetyFixture()
  const region = extractRepairRegion(input)
  const repairedRoutes = structuredClone(region.routes)
  repairedRoutes[0]!.route[2]!.y = 1
  input.routes[0]!.route[1]!.y = -1
  expect(() =>
    mergeRepairRegion({ routes: input.routes, region, repairedRoutes }),
  ).toThrow("stale source geometry")
})
