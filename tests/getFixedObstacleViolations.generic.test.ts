import { expect, test } from "bun:test"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("checks generic obstacle copper clearance and uses stable keys after point insertion", () => {
  const { srj, routes } = regionSafetyFixture()
  srj.obstacles = [
    {
      type: "rect",
      center: { x: 0, y: 0 },
      width: 0.5,
      height: 0.5,
      layers: ["top"],
      connectedTo: [],
    },
  ]
  routes[0]!.route = [
    { x: -1, y: 0.8, z: 0 },
    { x: 1, y: 0.8, z: 0 },
  ]
  routes[0]!.traceThickness = 1
  const initial = getFixedObstacleViolations({ srj, routes })
  expect(initial).toHaveLength(1)
  expect(initial[0]!.kind).toBe("wire")
  expect(initial[0]!.severity).toBeCloseTo(0.05)
  routes[0]!.route.splice(1, 0, { x: 0, y: 0.8, z: 0 })
  expect(getFixedObstacleViolations({ srj, routes })[0]!.key).toBe(
    initial[0]!.key,
  )
})
