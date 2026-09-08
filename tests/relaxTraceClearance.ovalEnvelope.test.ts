import { expect, test } from "bun:test"
import { segmentToBoundsMinDistance } from "@tscircuit/math-utils"
import { getNewViaPadViolations, relaxTraceClearance } from "../lib"
import type { RepairRegionInput } from "../lib/repairRegionTypes"

test("projection leaves clearance around the enclosing corners of an oval pad", (): void => {
  const bounds = { minX: -3, maxX: 3, minY: -3, maxY: 3 }
  const input: RepairRegionInput = {
    srj: {
      layerCount: 2,
      minTraceWidth: 0.1,
      minTraceToPadEdgeClearance: 0.1,
      bounds,
      obstacles: [
        {
          type: "oval",
          center: { x: 0, y: 0 },
          width: 0.2,
          height: 0.2,
          layers: ["top"],
          connectedTo: ["pad"],
        },
      ],
      connections: [{ name: "signal", pointsToConnect: [] }],
    },
    routes: [
      {
        connectionName: "signal",
        traceThickness: 0.1,
        viaDiameter: 0.3,
        vias: [],
        route: [
          { x: -1, y: 1, z: 0 },
          { x: 0.1, y: 0.27, z: 0 },
          { x: 0.27, y: 0.1, z: 0 },
          { x: 1, y: -1, z: 0 },
        ],
      },
    ],
    bounds,
    boundaryMargin: 0.1,
    lockedPointIndices: [[true, false, false, true]],
  }
  const padBounds = { minX: -0.1, maxX: 0.1, minY: -0.1, maxY: 0.1 }
  expect(
    segmentToBoundsMinDistance(
      input.routes[0]!.route[1]!,
      input.routes[0]!.route[2]!,
      padBounds,
    ) - 0.05,
  ).toBeLessThan(0.1)
  const output = relaxTraceClearance(input)[0]!
  for (let index = 1; index < output.route.length; index++) {
    const clearance =
      segmentToBoundsMinDistance(
        output.route[index - 1]!,
        output.route[index]!,
        padBounds,
      ) - 0.05
    expect(clearance).toBeGreaterThanOrEqual(0.1 - 1e-7)
  }
  expect(output.route[0]).toEqual(input.routes[0]!.route[0])
  expect(output.route.at(-1)).toEqual(input.routes[0]!.route.at(-1))
  expect(
    getNewViaPadViolations({
      srj: input.srj,
      previousRoutes: input.routes,
      routes: [output],
    }),
  ).toEqual([])
})
