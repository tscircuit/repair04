import { expect, test } from "bun:test"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("locks both interior sides of a same-net crossing when no endpoint copper reaches the junction", () => {
  const input = regionSafetyFixture()
  input.routes[0]!.traceThickness = 0.15
  input.routes[0]!.route = [
    { x: -4, y: 0, z: 0 },
    { x: 4, y: 0, z: 0 },
  ]
  input.routes[1] = {
    ...input.routes[0]!,
    connectionName: "crossing",
    rootConnectionName: "signal-net",
    route: [
      { x: 0, y: -0.2, z: 0 },
      { x: 0, y: 0.2, z: 0 },
    ],
  }
  const region = extractRepairRegion(input)
  for (let routeIndex = 0; routeIndex < 2; routeIndex += 1) {
    const junctionIndex = region.routes[routeIndex]!.route.findIndex(
      (point) => Math.hypot(point.x, point.y) < 1e-8,
    )
    expect(junctionIndex).toBeGreaterThan(-1)
    expect(region.lockedPointIndices[routeIndex]![junctionIndex]).toBe(true)
  }
  const disconnected = structuredClone(region.routes)
  disconnected[0]!.route.find(
    (point) => Math.hypot(point.x, point.y) < 1e-8,
  )!.y = 0.7
  expect(() =>
    mergeRepairRegion({
      routes: input.routes,
      region,
      repairedRoutes: disconnected,
    }),
  ).toThrow("locked point")
})
