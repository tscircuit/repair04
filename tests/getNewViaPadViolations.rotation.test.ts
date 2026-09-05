import { expect, test } from "bun:test"
import { getNewViaPadViolations } from "../lib/getNewViaPadViolations"
import { newViaPadFixture } from "./fixtures/newViaPadFixture"

test("measures new-via copper edge clearance to a rotated same-net pad", (): void => {
  const input = newViaPadFixture()
  const pad = input.srj.obstacles[0]!
  pad.width = 2
  pad.height = 0.2
  pad.ccwRotationDegrees = 45
  // In the pad's coordinates this center is (0, 0.3), outside the pad:
  // 0.2 center-to-edge distance - 0.15 via radius = 0.05 copper gap.
  for (const index of [1, 2]) {
    input.routes[0]!.route[index]!.x = -0.3 / Math.sqrt(2)
    input.routes[0]!.route[index]!.y = 0.3 / Math.sqrt(2)
  }
  const violations = getNewViaPadViolations(input)
  expect(violations).toHaveLength(1)
  expect(violations[0]!.severity).toBeCloseTo(0.05, 10)
  for (const index of [1, 2]) {
    input.routes[0]!.route[index]!.x = -0.46 / Math.sqrt(2)
    input.routes[0]!.route[index]!.y = 0.46 / Math.sqrt(2)
  }
  expect(getNewViaPadViolations(input)).toEqual([])
})
