import { expect, test } from "bun:test"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("rejects moved boundary anchors and new collar detours even when all locked anchors remain", () => {
  const input = regionSafetyFixture()
  const region = extractRepairRegion(input)
  const moved = structuredClone(region.routes)
  moved[0]!.route[1]!.y += 0.01
  expect(() =>
    mergeRepairRegion({ routes: input.routes, region, repairedRoutes: moved }),
  ).toThrow("locked point")
  const detour = structuredClone(region.routes)
  detour[0]!.route.splice(1, 0, { x: -5, y: 0.1, z: 0 })
  expect(() =>
    mergeRepairRegion({ routes: input.routes, region, repairedRoutes: detour }),
  ).toThrow("fixed boundary collar")
})
