import { expect, test } from "bun:test"
import { relaxTraceClearance } from "../lib"
import type { RepairRegionInput } from "../lib/repairRegionTypes"

test("whole-board projection retains redundant vertices and original via transition indices", (): void => {
  const bounds = { minX: -3, maxX: 3, minY: -3, maxY: 3 }
  const input: RepairRegionInput = {
    srj: {
      layerCount: 2,
      minTraceWidth: 0.1,
      bounds,
      obstacles: [],
      connections: [],
    },
    routes: [
      {
        connectionName: "signal",
        traceThickness: 0.1,
        viaDiameter: 0.3,
        route: [
          { x: -2, y: 0, z: 0 },
          { x: -0.5, y: 0, z: 0 },
          { x: -0.5, y: 0, z: 0 },
          { x: 0.5, y: 0, z: 0 },
          { x: 0.5, y: 0, z: 1 },
          { x: 0.5, y: 0, z: 1 },
          { x: 2, y: 0, z: 1 },
        ],
        vias: [{ x: 0.5, y: 0 }],
      },
      {
        connectionName: "neighbor",
        traceThickness: 0.1,
        viaDiameter: 0.3,
        route: [
          { x: -2, y: 0.25, z: 0 },
          { x: -0.5, y: 0.16, z: 0 },
          { x: 0.5, y: 0.16, z: 0 },
          { x: 2, y: 0.25, z: 0 },
        ],
        vias: [],
      },
    ],
    bounds,
    boundaryMargin: 0,
    lockedPointIndices: [Array(7).fill(false), Array(4).fill(false)],
  }
  const original = structuredClone(input)
  const output = relaxTraceClearance({ ...input, allowViaMovement: true })
  for (let ri = 0; ri < input.routes.length; ri++) {
    const before = input.routes[ri]!
    const after = output[ri]!
    expect(after.route.length).toBe(before.route.length)
    expect(after.route.map((point) => point.z)).toEqual(
      before.route.map((point) => point.z),
    )
    expect(after.route[0]).toEqual(before.route[0])
    expect(after.route.at(-1)).toEqual(before.route.at(-1))
    expect(after.traceThickness).toBe(before.traceThickness)
    expect(after.viaDiameter).toBe(before.viaDiameter)
  }
  expect(output[0]!.route[1]).toEqual(output[0]!.route[2])
  expect(output[0]!.route[4]).toEqual(output[0]!.route[5])
  expect(output[0]!.route[3]!.x).toBe(output[0]!.route[4]!.x)
  expect(output[0]!.route[3]!.y).toBe(output[0]!.route[4]!.y)
  expect(output[0]!.vias).toEqual([
    { x: output[0]!.route[4]!.x, y: output[0]!.route[4]!.y },
  ])
  expect(output[0]!.route[3]!.y).not.toBe(input.routes[0]!.route[3]!.y)
  expect(input).toEqual(original)
})
