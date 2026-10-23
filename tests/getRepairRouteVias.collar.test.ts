import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { getRepairRouteVias } from "../lib/getRepairRouteVias"

test("via rebuilding preserves fixed collar copper and updates mutable transitions", () => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.15,
    viaDiameter: 0.45,
    route: [
      { x: 0.5, y: 5, z: 3 },
      { x: 2.5, y: 5, z: 3 },
      { x: 2.5, y: 5, z: 0 },
      { x: 5, y: 5, z: 0 },
    ],
    vias: [
      { x: 0.5, y: 5 },
      { x: 5, y: 5 },
    ],
  }
  const original = structuredClone(route)
  expect(
    getRepairRouteVias({
      route,
      mutableBounds: { minX: 1, minY: 1, maxX: 9, maxY: 9 },
    }),
  ).toEqual([
    { x: 0.5, y: 5 },
    { x: 2.5, y: 5 },
  ])
  expect(route).toEqual(original)
})
