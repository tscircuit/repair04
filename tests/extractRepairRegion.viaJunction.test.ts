import { expect, test } from "bun:test"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("locks an interior via stack and its same-net trunk copper attachment even when centers are offset", () => {
  const input = regionSafetyFixture()
  input.routes[0]!.route = [
    { x: -3, y: 0, z: 0 },
    { x: 3, y: 0, z: 0 },
  ]
  input.routes[1] = {
    ...input.routes[0]!,
    connectionName: "via-branch",
    rootConnectionName: "signal-net",
    viaDiameter: 0.4,
    route: [
      { x: -2, y: 0.15, z: 0 },
      { x: 0, y: 0.15, z: 0 },
      { x: 0, y: 0.15, z: 1 },
      { x: 2, y: 0.15, z: 1 },
    ],
    vias: [{ x: 0, y: 0.15 }],
  }
  const region = extractRepairRegion(input)
  const trunkJunction = region.routes[0]!.route.findIndex(
    (point) => point.x === 0 && point.y === 0,
  )
  expect(trunkJunction).toBeGreaterThan(-1)
  expect(region.lockedPointIndices[0]![trunkJunction]).toBe(true)
  for (const [index, point] of region.routes[1]!.route.entries()) {
    if (point.x === 0 && point.y === 0.15)
      expect(region.lockedPointIndices[1]![index]).toBe(true)
  }
  const disconnected = structuredClone(region.routes)
  for (const point of disconnected[1]!.route) if (point.x === 0) point.y = 1
  disconnected[1]!.vias[0]!.y = 1
  expect(() =>
    mergeRepairRegion({
      routes: input.routes,
      region,
      repairedRoutes: disconnected,
    }),
  ).toThrow("locked point")
})
