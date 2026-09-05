import { expect, test } from "bun:test"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("unchanged extracted geometry merges byte-for-byte without inserting crop terminals", () => {
  const input = regionSafetyFixture()
  const region = extractRepairRegion(input)
  const merged = mergeRepairRegion({
    routes: input.routes,
    region,
    repairedRoutes: structuredClone(region.routes),
  })
  expect(JSON.stringify(merged)).toBe(JSON.stringify(input.routes))
  expect(merged[0]).toBe(input.routes[0])
  expect(merged[1]).toBe(input.routes[1])
})
