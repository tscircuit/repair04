import { expect, test } from "bun:test"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("splices an interior detour and preserves the original endpoints and unrelated routes", () => {
  const input = regionSafetyFixture()
  const before = structuredClone(input.routes)
  const region = extractRepairRegion(input)
  const repairedRoutes = structuredClone(region.routes)
  repairedRoutes[0]!.route.splice(
    2,
    1,
    { x: -1, y: 1, z: 0 },
    { x: 1, y: 1, z: 0 },
  )
  const merged = mergeRepairRegion({
    routes: input.routes,
    region,
    repairedRoutes,
  })
  expect(merged[0]!.route[0]).toEqual(before[0]!.route[0])
  expect(merged[0]!.route.at(-1)).toEqual(before[0]!.route.at(-1))
  expect(merged[0]!.route.some((point) => point.x === 1 && point.y === 1)).toBe(
    true,
  )
  expect(merged[1]).toBe(input.routes[1])
  expect(input.routes).toEqual(before)
})
