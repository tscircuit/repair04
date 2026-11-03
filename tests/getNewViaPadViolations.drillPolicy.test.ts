import { expect, test } from "bun:test"
import { getNewViaPadViolations } from "../lib"
import { newViaPadFixture } from "./fixtures/newViaPadFixture"

test("drill-only own-pad clearance is explicit and never weakens foreign-pad copper clearance", (): void => {
  const input = newViaPadFixture()
  const route = input.routes[0]!
  route.viaDiameter = 0.6
  route.route = [
    { x: 0, y: 0, z: 0 },
    { x: 0.31, y: 0, z: 0 },
    { x: 0.31, y: 0, z: 1 },
    { x: 2, y: 1, z: 1 },
  ]
  route.vias = [{ x: 0.31, y: 0 }]
  input.srj.obstacles[0] = {
    type: "rect",
    shape: "circle",
    center: { x: 0, y: 0 },
    width: 0.4,
    height: 0.4,
    layers: ["top"],
    connectedTo: ["signal-net", "pcb_smtpad_own"],
  }
  const selected = [{ routeIndex: 0, viaIndex: 0 }]
  const options = {
    ...input,
    previousRoutes: input.routes,
    includeExistingVias: selected,
  }
  expect(getNewViaPadViolations(options)).toHaveLength(1)
  expect(
    getNewViaPadViolations({ ...options, sameNetViaHoleDiameter: 0.2 }),
  ).toEqual([])
  route.route[1]!.x = 0.25
  route.route[2]!.x = 0.25
  route.vias[0]!.x = 0.25
  expect(
    getNewViaPadViolations({ ...options, sameNetViaHoleDiameter: 0.2 }),
  ).toHaveLength(1)
  input.srj.obstacles[0]!.connectedTo = ["foreign", "pcb_smtpad_foreign"]
  const copper = getNewViaPadViolations(options)
  const drillPolicy = getNewViaPadViolations({
    ...options,
    sameNetViaHoleDiameter: 0.2,
  })
  expect(drillPolicy).toEqual(copper)
  expect(drillPolicy).toHaveLength(1)
  for (const holeDiameter of [0, -0.1, NaN, Infinity, 0.7]) {
    expect(() =>
      getNewViaPadViolations({
        ...options,
        sameNetViaHoleDiameter: holeDiameter,
      }),
    ).toThrow()
  }
})
