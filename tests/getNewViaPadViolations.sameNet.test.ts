import { expect, test } from "bun:test"
import { getNewViaPadViolations } from "../lib/getNewViaPadViolations"
import { newViaPadFixture } from "./fixtures/newViaPadFixture"

test("rejects sample006's two new same-net vias inside their solder pads", (): void => {
  const input = newViaPadFixture()
  const cases = [
    {
      x: 0.5498454000000002,
      y: -2.0225111500000006,
      padX: 0.5997956,
      padId: "pcb_smtpad_7",
    },
    {
      x: -0.5501545999999999,
      y: -1.92251115,
      padX: -0.6001004,
      padId: "pcb_smtpad_10",
    },
  ]
  for (const location of cases) {
    const pad = input.srj.obstacles[0]!
    pad.center = { x: location.padX, y: -1.974977 }
    pad.width = 0.1999996
    pad.height = 0.850011
    pad.connectedTo = ["signal", "signal-net", location.padId]
    for (const index of [1, 2]) {
      input.routes[0]!.route[index]!.x = location.x
      input.routes[0]!.route[index]!.y = location.y
    }
    const violations = getNewViaPadViolations(input)
    expect(violations).toHaveLength(1)
    expect(violations[0]!.center).toEqual({ x: location.x, y: location.y })
    expect(violations[0]!.severity).toBeCloseTo(0.25, 10)
    expect(violations[0]!.routeIndex).toBe(0)
    expect(violations[0]!.obstacleIndex).toBe(0)
  }
})
