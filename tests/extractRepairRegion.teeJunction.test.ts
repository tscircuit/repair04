import { expect, test } from "bun:test"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("inserts and locks a same-net tee attachment that was not an original trunk vertex", () => {
  const input = regionSafetyFixture()
  input.routes[0]!.route = [
    { x: -3, y: 0, z: 0 },
    { x: 3, y: 0, z: 0 },
  ]
  input.routes[1] = {
    ...input.routes[0]!,
    connectionName: "branch",
    rootConnectionName: "signal-net",
    route: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 3, z: 0 },
    ],
  }
  const region = extractRepairRegion(input)
  expect(region.routes[0]!.route).toEqual([
    { x: -3, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 3, y: 0, z: 0 },
  ])
  expect(region.lockedPointIndices[0]).toEqual([true, true, true])
  const disconnected = structuredClone(region.routes)
  disconnected[0]!.route[1]!.y = 1
  expect(() =>
    mergeRepairRegion({
      routes: input.routes,
      region,
      repairedRoutes: disconnected,
    }),
  ).toThrow("locked point")
  const connected = structuredClone(region.routes)
  connected[0]!.route.splice(1, 0, { x: -1, y: 1, z: 0 })
  const merged = mergeRepairRegion({
    routes: input.routes,
    region,
    repairedRoutes: connected,
  })
  expect(merged[0]!.route.some((point) => point.x === 0 && point.y === 0)).toBe(
    true,
  )
  expect(merged[1]).toBe(input.routes[1])
  input.routes[1]!.rootConnectionName = "different-net"
  expect(extractRepairRegion(input).routes[0]!.route).toHaveLength(2)
})
