import { expect, test } from "bun:test"
import { getFixedObstacleViolations, relaxTraceClearance } from "../lib"
import type { RepairRegionInput } from "../lib/repairRegionTypes"

test("projection moves a foreign wire vertex out of a pad interior while retaining shared copper and terminals", (): void => {
  for (const angle of [0, 30]) {
    const radians = (angle * Math.PI) / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    const rotate = (
      x: number,
      y: number,
    ): { x: number; y: number; z: number } => ({
      x: x * cosine - y * sine,
      y: x * sine + y * cosine,
      z: 0,
    })
    const bounds = { minX: -2, maxX: 2, minY: -2, maxY: 2 }
    const route = {
      connectionName: "wire",
      rootConnectionName: "wire",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      route: [rotate(-0.8, -0.5), rotate(-0.48, 0), rotate(-0.8, 0.5)],
      vias: [],
    }
    const input: RepairRegionInput = {
      srj: {
        layerCount: 2,
        minTraceWidth: 0.1,
        bounds,
        obstacles: [
          {
            type: "rect",
            center: { x: 0, y: 0 },
            width: 1,
            height: 0.6,
            ccwRotationDegrees: angle,
            layers: ["top"],
            connectedTo: ["pad"],
          },
        ],
        connections: [
          { name: "pad", pointsToConnect: [] },
          { name: "wire", pointsToConnect: [] },
        ],
      },
      routes: [route, { ...structuredClone(route), connectionName: "branch" }],
      bounds,
      boundaryMargin: 0.1,
      lockedPointIndices: [
        [true, false, true],
        [true, false, true],
      ],
    }
    const original = structuredClone(input)
    expect(
      getFixedObstacleViolations({ srj: input.srj, routes: input.routes }).length,
    ).toBeGreaterThan(0)
    const output = relaxTraceClearance(input)
    expect(
      getFixedObstacleViolations({ srj: input.srj, routes: output }),
    ).toEqual([])
    expect(output[0]!.route[1]).toEqual(output[1]!.route[1])
    expect(
      output.map((candidate) => [candidate.route[0], candidate.route.at(-1)]),
    ).toEqual(
      input.routes.map((candidate) => [
        candidate.route[0],
        candidate.route.at(-1),
      ]),
    )
    expect(
      output.map((candidate) => [
        candidate.traceThickness,
        candidate.viaDiameter,
      ]),
    ).toEqual([
      [0.1, 0.3],
      [0.1, 0.3],
    ])
    expect(input).toEqual(original)
  }
})
