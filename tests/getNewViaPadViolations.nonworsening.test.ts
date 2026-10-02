import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import {
  getNewViaPadViolations,
  type NewViaPadViolationInput,
} from "../lib/getNewViaPadViolations"

test("permits only nonworsening pad contacts with proven ordered via correspondence", (): void => {
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: -1, y: 0, z: 0 },
      { x: -0.2, y: 0, z: 0 },
      { x: -0.2, y: 0, z: 1 },
      { x: 0.3, y: 0, z: 1 },
      { x: 0.3, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ],
    vias: [
      { x: -0.2, y: 0 },
      { x: 0.3, y: 0 },
    ],
  }
  const input: NewViaPadViolationInput = {
    srj: {
      layerCount: 2,
      minTraceWidth: 0.1,
      bounds: { minX: -2, minY: -2, maxX: 2, maxY: 2 },
      connections: [],
      obstacles: [
        {
          type: "rect",
          center: { x: 0, y: 0 },
          width: 0.2,
          height: 0.2,
          layers: ["top"],
          connectedTo: ["signal"],
        },
      ],
    },
    previousRoutes: [route],
    routes: [structuredClone(route)],
  }
  const move = (
    value: NewViaPadViolationInput,
    left: number,
    right = 0.32,
  ): void => {
    value.routes[0]!.route[1]!.x = value.routes[0]!.route[2]!.x = left
    value.routes[0]!.route[3]!.x = value.routes[0]!.route[4]!.x = right
    value.routes[0]!.vias = [
      { x: left, y: 0 },
      { x: right, y: 0 },
    ]
  }
  move(input, -0.22)
  expect(getNewViaPadViolations(input)).toEqual([])

  const worsened = structuredClone(input)
  move(worsened, -0.19)
  expect(getNewViaPadViolations(worsened)).toHaveLength(1)

  const newContact = structuredClone(input)
  newContact.srj.obstacles.push({
    type: "rect",
    center: { x: -0.6, y: 0 },
    width: 0.1,
    height: 0.2,
    layers: ["top"],
    connectedTo: ["foreign"],
  })
  move(newContact, -0.4)
  expect(getNewViaPadViolations(newContact)).toHaveLength(1)

  const added = structuredClone(input)
  added.routes[0]!.route.splice(
    5,
    0,
    { x: 0.7, y: 0, z: 0 },
    { x: 0.7, y: 0, z: 1 },
  )
  added.routes[0]!.route.at(-1)!.z = 1
  expect(getNewViaPadViolations(added).length).toBeGreaterThan(0)

  const removed = structuredClone(input)
  removed.routes[0]!.route.splice(3, 2)
  removed.routes[0]!.route.at(-1)!.z = 1
  expect(getNewViaPadViolations(removed).length).toBeGreaterThan(0)

  const reordered = structuredClone(input)
  reordered.routes[0]!.route.reverse()
  expect(getNewViaPadViolations(reordered).length).toBeGreaterThan(0)

  const wider = structuredClone(input)
  wider.routes[0]!.viaDiameter = 0.31
  expect(getNewViaPadViolations(wider).length).toBeGreaterThan(0)
})
