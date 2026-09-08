import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { relaxTraceClearance } from "../lib/relaxTraceClearance"
import { getNewViaPadViolations } from "../lib/getNewViaPadViolations"

test("projection preserves permitted via containment while moving away from foreign copper", (): void => {
  const routes: HighDensityRoute[] = [
    {
      connectionName: "signal",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      route: [
        { x: -0.3, y: 0, z: 0 },
        { x: 0.2, y: 0, z: 0 },
        { x: 0.2, y: 0, z: 1 },
        { x: 0.8, y: -0.4, z: 1 },
      ],
      vias: [{ x: 0.2, y: 0 }],
    },
  ]
  const srj: SimpleRouteJson = {
    allowViaInPad: true,
    layerCount: 2,
    minTraceWidth: 0.1,
    bounds: { minX: -2, maxX: 2, minY: -2, maxY: 2 },
    connections: [{ name: "signal", pointsToConnect: [] }],
    obstacles: [
      {
        kind: "smt_pad",
        type: "rect",
        center: { x: 0, y: 0 },
        width: 0.8,
        height: 0.6,
        layers: ["top"],
        connectedTo: ["signal", "pcb_smtpad_signal"],
      },
    ],
  }
  const input = {
    srj,
    routes,
    bounds: srj.bounds,
    boundaryMargin: 0.1,
    lockedPointIndices: [[true, false, false, true]],
    allowViaMovement: true,
  }
  expect(relaxTraceClearance(input)).toEqual(routes)
  routes.push({
    connectionName: "foreign",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: -0.5, y: 0.05, z: 1 },
      { x: 0.5, y: 0.05, z: 1 },
    ],
    vias: [],
  })
  input.lockedPointIndices.push([true, true])
  const result = relaxTraceClearance(input)
  expect(result[0]!.route[1]!.y).toBeLessThan(-0.1)
  expect(Math.abs(result[0]!.route[1]!.y) + 0.15).toBeLessThanOrEqual(
    0.3 + 1e-8,
  )
  expect(
    getNewViaPadViolations({ srj, previousRoutes: routes, routes: result }),
  ).toEqual([])
})
