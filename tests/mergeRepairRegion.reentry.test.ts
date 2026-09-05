import { expect, test } from "bun:test"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("splices multiple reentries into the same original route in source order", () => {
  const input = regionSafetyFixture()
  input.routes[0]!.route = [
    { x: -20, y: -1, z: 0 },
    { x: 0, y: -1, z: 0 },
    { x: 20, y: -1, z: 0 },
    { x: 20, y: 1, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: -20, y: 1, z: 0 },
  ]
  const region = extractRepairRegion(input)
  expect(region.routes).toHaveLength(2)
  const repairedRoutes = structuredClone(region.routes)
  repairedRoutes[0]!.route[2]!.y = -2
  repairedRoutes[1]!.route[2]!.y = 2
  const merged = mergeRepairRegion({
    routes: input.routes,
    region,
    repairedRoutes,
  })
  expect(merged[0]!.route.filter((point) => point.x === 20)).toEqual([
    { x: 20, y: -1, z: 0 },
    { x: 20, y: 1, z: 0 },
  ])
  expect(
    merged[0]!.route.filter((point) => point.x === 0).map((point) => point.y),
  ).toEqual([-2, 2])
})
