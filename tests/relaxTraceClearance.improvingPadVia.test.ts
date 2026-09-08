import { expect, test } from "bun:test"
import { getNewViaPadViolations, relaxTraceClearance } from "../lib"
import type { RepairRegionInput } from "../lib/repairRegionTypes"

test("projection moves an existing pad via toward clearance without changing its transitions", (): void => {
  const bounds = { minX: -3, maxX: 3, minY: -3, maxY: 3 }
  const input: RepairRegionInput = {
    srj: {
      layerCount: 2,
      minTraceWidth: 0.1,
      bounds,
      obstacles: [
        {
          type: "rect",
          center: { x: 0, y: 0 },
          width: 0.2,
          height: 0.2,
          layers: ["top"],
          connectedTo: ["owner"],
        },
      ],
      connections: [
        { name: "owner", pointsToConnect: [] },
        { name: "foreign", pointsToConnect: [] },
      ],
    },
    routes: [
      {
        connectionName: "owner",
        traceThickness: 0.1,
        viaDiameter: 0.3,
        route: [
          { x: -1, y: -1, z: 0 },
          { x: -0.2, y: 0, z: 0 },
          { x: -0.2, y: 0, z: 1 },
          { x: 1, y: -1, z: 1 },
        ],
        vias: [{ x: -0.2, y: 0 }],
      },
      {
        connectionName: "foreign",
        traceThickness: 0.1,
        viaDiameter: 0.3,
        route: [
          { x: 0.05, y: -1, z: 0 },
          { x: 0.05, y: 1, z: 0 },
        ],
        vias: [],
      },
    ],
    bounds,
    boundaryMargin: 0.2,
    lockedPointIndices: [
      [true, false, false, true],
      [true, true],
    ],
  }
  const output = relaxTraceClearance({ ...input, allowViaMovement: true })
  expect(output[0]!.vias[0]!.x).toBeLessThan(-0.3)
  expect(output[0]!.route.map((point) => point.z)).toEqual(
    input.routes[0]!.route.map((point) => point.z),
  )
  expect(output[0]!.route[0]).toEqual(input.routes[0]!.route[0])
  expect(output[0]!.route.at(-1)).toEqual(input.routes[0]!.route.at(-1))
  expect(output[1]).toEqual(input.routes[1])
  expect(
    getNewViaPadViolations({
      srj: input.srj,
      previousRoutes: input.routes,
      routes: output,
    }),
  ).toEqual([])
})
