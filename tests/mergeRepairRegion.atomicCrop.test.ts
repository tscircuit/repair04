import { expect, test } from "bun:test"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("restores a cropped atomic token exactly when another interior wire span changes", () => {
  const input = regionSafetyFixture()
  input.routes[0]!.route = [
    { x: -20, y: 0, z: 0, toNextSegmentType: "through_obstacle" },
    { x: -2, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 20, y: 0, z: 0 },
  ]
  const region = extractRepairRegion(input)
  const repairedRoutes = structuredClone(region.routes)
  repairedRoutes[0]!.route.find((point) => point.x === 0)!.y = 1
  const merged = mergeRepairRegion({
    routes: input.routes,
    region,
    repairedRoutes,
  })
  expect(merged[0]!.route.slice(0, 2)).toEqual(
    input.routes[0]!.route.slice(0, 2),
  )
  expect(
    merged[0]!.route.filter(
      (point) => point.toNextSegmentType === "through_obstacle",
    ),
  ).toHaveLength(1)
})
