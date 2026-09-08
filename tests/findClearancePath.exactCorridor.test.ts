import { expect, test } from "bun:test"
import { segmentToBoundsMinDistance } from "@tscircuit/math-utils"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { findClearancePath } from "../lib/findClearancePath"

test("pathfinding retains an exactly feasible pad corridor at translated coordinates", (): void => {
  for (const shift of [0, 7.315, -42.187]) {
    const srj: SimpleRouteJson = {
      layerCount: 2,
      minTraceWidth: 0.1,
      bounds: { minX: shift - 5.025, maxX: shift + 5.025, minY: -5, maxY: 5 },
      connections: [],
      obstacles: [-1, 1].map((side): SimpleRouteJson["obstacles"][number] => ({
        type: "rect",
        center: { x: shift + side * 0.65, y: 0 },
        width: 1,
        height: 12,
        layers: ["top"],
        connectedTo: [`pad${side}`],
      })),
    }
    const route: HighDensityRoute = {
      connectionName: "signal",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x: shift, y: -2, z: 0 },
        { x: shift, y: 2, z: 0 },
      ],
    }
    const path = findClearancePath({
      srj,
      routes: [route],
      routeIndex: 0,
      start: route.route[0]!,
      end: route.route[1]!,
      bounds: srj.bounds,
      traceThickness: 0.1,
      traceClearance: 0.1,
      viaClearance: 0.1,
      gridSize: 0.05,
      allowLayerChanges: false,
      maxNodes: 20000,
    })
    expect(path).not.toBeNull()
    expect(path![0]).toEqual(route.route[0])
    expect(path!.at(-1)).toEqual(route.route[1])
    for (const obstacle of srj.obstacles) {
      const bounds = {
        minX: obstacle.center.x - 0.5,
        maxX: obstacle.center.x + 0.5,
        minY: -6,
        maxY: 6,
      }
      for (let i = 1; i < path!.length; i++) {
        expect(
          segmentToBoundsMinDistance(path![i - 1]!, path![i]!, bounds) - 0.05,
        ).toBeGreaterThanOrEqual(0.1 - 1e-8)
      }
    }
  }
})
