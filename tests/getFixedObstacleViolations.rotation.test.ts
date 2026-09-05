import { expect, test } from "bun:test"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("uses inverse rotation for recognized pads instead of their unrotated or bounding boxes", () => {
  const { srj, routes } = regionSafetyFixture()
  srj.obstacles = [
    {
      type: "rect",
      center: { x: 0, y: 0 },
      width: 8,
      height: 0.2,
      ccwRotationDegrees: 45,
      layers: ["top"],
      connectedTo: ["pcb_smtpad_rotated"],
    },
  ]
  routes[0]!.route = [
    { x: 2.5, y: 2.7, z: 0 },
    { x: 3, y: 2.7, z: 0 },
  ]
  expect(getFixedObstacleViolations({ srj, routes })).toHaveLength(1)
  routes[0]!.route = [
    { x: 2.5, y: -2.7, z: 0 },
    { x: 3, y: -2.7, z: 0 },
  ]
  expect(getFixedObstacleViolations({ srj, routes })).toHaveLength(0)
})
