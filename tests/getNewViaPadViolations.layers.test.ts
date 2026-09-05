import { expect, test } from "bun:test"
import { getNewViaPadViolations } from "../lib/getNewViaPadViolations"
import { newViaPadFixture } from "./fixtures/newViaPadFixture"

test("checks the full new-via span and SRJ margin without touching other layers", (): void => {
  const input = newViaPadFixture()
  input.srj.layerCount = 4
  input.routes[0]!.viaDiameter = 0.6
  for (const point of input.routes[0]!.route) point.z += 1
  const pad = input.srj.obstacles[0]!
  pad.center = { x: 0, y: 0.25 }
  pad.width = 0.1
  pad.height = 0.1
  pad.layers = ["inner2"]
  input.srj.obstacles.push({ ...structuredClone(pad), layers: ["top"] })
  input.srj.obstacles.push({ ...structuredClone(pad), layers: ["bottom"] })
  const violations = getNewViaPadViolations(input)
  expect(violations).toHaveLength(1)
  expect(violations[0]!.obstacleIndex).toBe(0)
  expect(violations[0]!.severity).toBeCloseTo(0.2, 10)
  input.srj.minViaEdgeToPadEdgeClearance = 0.3
  expect(getNewViaPadViolations(input)[0]!.severity).toBeCloseTo(0.4, 10)
})
