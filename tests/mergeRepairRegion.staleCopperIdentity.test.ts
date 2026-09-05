import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { extractRepairRegion } from "../lib/extractRepairRegion"
import { mergeRepairRegion } from "../lib/mergeRepairRegion"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("rejects changed source net, trace/via width, or local via geometry after extraction", () => {
  const mutations: Array<(route: HighDensityRoute) => void> = [
    (route) => {
      route.connectionName = "changed-connection"
    },
    (route) => {
      route.rootConnectionName = "changed-net"
    },
    (route) => {
      route.traceThickness = 0.8
    },
    (route) => {
      route.viaDiameter = 0.8
    },
    (route) => {
      route.vias[0]!.x = 0.2
    },
  ]
  for (const mutate of mutations) {
    const input = regionSafetyFixture()
    input.routes[0]!.route = [
      { x: -100, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 100, y: 0, z: 1 },
    ]
    input.routes[0]!.vias = [{ x: 0, y: 0 }]
    const region = extractRepairRegion(input)
    const repairedRoutes = structuredClone(region.routes)
    repairedRoutes[0]!.route.splice(2, 0, { x: -1, y: 1, z: 0 })
    mutate(input.routes[0]!)
    expect(() =>
      mergeRepairRegion({ routes: input.routes, region, repairedRoutes }),
    ).toThrow("stale source geometry")
  }
})
