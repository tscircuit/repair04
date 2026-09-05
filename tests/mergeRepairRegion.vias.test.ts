import { expect, test } from "bun:test"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("allows an interior layer detour only when via positions remain connected", () => {
  const input = regionSafetyFixture()
  const region = extractRepairRegion(input)
  const repairedRoutes = structuredClone(region.routes)
  repairedRoutes[0]!.route.splice(
    2,
    1,
    { x: -1, y: 0, z: 0 },
    { x: -1, y: 0, z: 1 },
    { x: 1, y: 0, z: 1 },
    { x: 1, y: 0, z: 0 },
  )
  repairedRoutes[0]!.vias = [
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ]
  const merged = mergeRepairRegion({
    routes: input.routes,
    region,
    repairedRoutes,
  })
  expect(merged[0]!.vias).toEqual(repairedRoutes[0]!.vias)
  repairedRoutes[0]!.route[3]!.y = 0.1
  expect(() =>
    mergeRepairRegion({ routes: input.routes, region, repairedRoutes }),
  ).toThrow("disconnected or missing via")
})
