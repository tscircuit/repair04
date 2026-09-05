import { expect, test } from "bun:test"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("checks actual via copper radius across its inclusive inner-layer span", () => {
  const { srj, routes } = regionSafetyFixture()
  srj.layerCount = 4
  routes[0]!.traceThickness = 0.1
  routes[0]!.viaDiameter = 0.7
  routes[0]!.route = [
    { x: -1, y: 0, z: 1 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: 2 },
    { x: 1, y: 0, z: 2 },
  ]
  routes[0]!.vias = [{ x: 0, y: 0 }]
  srj.obstacles = ["inner2", "bottom"].map((layer) => ({
    type: "rect",
    center: { x: 0, y: 0.3 },
    width: 0.1,
    height: 0.1,
    layers: [layer],
    connectedTo: [],
  }))
  const violations = getFixedObstacleViolations({ srj, routes })
  expect(violations).toHaveLength(1)
  expect(violations[0]!.kind).toBe("via")
  expect(violations[0]!.obstacleIndex).toBe(0)
})
