import { expect, spyOn, test } from "bun:test"
import * as vectorLength from "../lib/getVectorLength"
import { relaxTraceClearance } from "../lib/relaxTraceClearance"
import type { RepairRegionInput } from "../lib/repairRegionTypes"

test("projection stops after an unchanged sweep without hiding locked pad contacts", (): void => {
  const bounds = { minX: -2, maxX: 2, minY: -2, maxY: 2 }
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
          height: 1,
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
          { x: -0.25, y: 0, z: 0 },
          { x: 0.25, y: 0, z: 0 },
        ],
      },
    ],
    bounds,
    boundaryMargin: 0,
    lockedPointIndices: [[true, true]],
  }
  const original = structuredClone(input)
  const length = spyOn(vectorLength, "getVectorLength")
  try {
    const output = relaxTraceClearance(input)
    // One sweep examines four pad faces per endpoint and four edge contacts.
    // The locked, still-colliding route must not be moved or declared repaired.
    expect(length).toHaveBeenCalledTimes(12)
    expect(output).toEqual(input.routes)
    expect(input).toEqual(original)
  } finally {
    length.mockRestore()
  }
})
