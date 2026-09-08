import { expect, test } from "bun:test"
import { segmentToBoundsMinDistance } from "@tscircuit/math-utils"
import { relaxTraceClearance } from "../lib"
import type { RepairRegionInput } from "../lib/repairRegionTypes"

test("projection fits a trace into a pad corridor with exactly the requested clearance", (): void => {
  const bounds = { minX: -3, maxX: 3, minY: -3, maxY: 3 }
  const input: RepairRegionInput = {
    srj: {
      layerCount: 2, minTraceWidth: 0.1, minTraceToPadEdgeClearance: 0.1, bounds,
      obstacles: [-0.25, 0.25].map((y, index) => ({
        type: "rect" as const, center: { x: 0, y }, width: 2, height: 0.2,
        layers: ["top"], connectedTo: [`pad-${index}`],
      })),
      connections: [{ name: "signal", pointsToConnect: [] }],
    },
    routes: [{
      connectionName: "signal", traceThickness: 0.1, viaDiameter: 0.3, vias: [],
      route: [{ x: -2, y: 0, z: 0 }, { x: -1.2, y: 0.04, z: 0 },
        { x: 1.2, y: 0.04, z: 0 }, { x: 2, y: 0, z: 0 }],
    }],
    bounds, boundaryMargin: 0.1, lockedPointIndices: [[true, false, false, true]],
  }
  const output = relaxTraceClearance(input)[0]!
  expect(output.route[0]).toEqual(input.routes[0]!.route[0])
  expect(output.route.at(-1)).toEqual(input.routes[0]!.route.at(-1))
  for (const obstacle of input.srj.obstacles) {
    const padBounds = {
      minX: -1, maxX: 1,
      minY: obstacle.center.y - 0.1, maxY: obstacle.center.y + 0.1,
    }
    for (let index = 1; index < output.route.length; index++) {
      const clearance = segmentToBoundsMinDistance(output.route[index - 1]!, output.route[index]!, padBounds) - 0.05
      expect(clearance).toBeGreaterThanOrEqual(0.1 - 1e-7)
    }
  }
})
