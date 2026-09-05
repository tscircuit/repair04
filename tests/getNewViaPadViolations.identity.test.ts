import { expect, test } from "bun:test"
import { getNewViaPadViolations } from "../lib/getNewViaPadViolations"
import { newViaPadFixture } from "./fixtures/newViaPadFixture"

test("exempts only exact unchanged via position span and diameter", (): void => {
  const input = newViaPadFixture()
  input.srj.layerCount = 4
  input.routes[0]!.route[2]!.z = 2
  input.routes[0]!.route[3]!.z = 2
  input.previousRoutes = structuredClone(input.routes)
  expect(getNewViaPadViolations(input)).toEqual([])

  const moved = structuredClone(input)
  moved.routes[0]!.route[1]!.x = 1e-12
  moved.routes[0]!.route[2]!.x = 1e-12
  expect(getNewViaPadViolations(moved)).toHaveLength(1)

  const wider = structuredClone(input)
  wider.routes[0]!.viaDiameter = 0.31
  expect(getNewViaPadViolations(wider)).toHaveLength(1)

  const expanded = structuredClone(input)
  expanded.routes[0]!.route[2]!.z = 3
  expanded.routes[0]!.route[3]!.z = 3
  expect(getNewViaPadViolations(expanded)).toHaveLength(1)

  const extraLayerVertex = structuredClone(input)
  extraLayerVertex.routes[0]!.route.splice(2, 0, { x: 0, y: 0, z: 1 })
  expect(getNewViaPadViolations(extraLayerVertex)).toEqual([])

  const malformed = structuredClone(input)
  malformed.routes[0]!.route[2]!.x = 0.01
  expect((): void => {
    getNewViaPadViolations(malformed)
  }).toThrow("colocated vias")
})
