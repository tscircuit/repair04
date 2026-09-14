import { expect, test } from "bun:test"
import { pointToSegmentDistance } from "@tscircuit/math-utils"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { findClearancePath } from "../lib/findClearancePath"
import type { ViaLayerPolicy } from "../lib/getViaCopperZSpan"

test("clearance paths respect through-via copper outside its endpoint layers", (): void => {
  for (const layerCount of [4, 6]) {
    for (const allowBlindAndBuriedVias of [undefined, false, true]) {
      const viaRoute: HighDensityRoute = {
        connectionName: "via-net",
        traceThickness: 0.1,
        viaDiameter: 0.3,
        vias: [{ x: 0, y: 0 }],
        route: [
          { x: -1, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 2 },
          { x: 1, y: 0, z: 2 },
        ],
      }
      const wireRoute: HighDensityRoute = {
        ...viaRoute,
        connectionName: "wire-net",
        vias: [],
        route: [
          { x: -1, y: 0, z: layerCount - 1 },
          { x: 1, y: 0, z: layerCount - 1 },
        ],
      }
      const srj: SimpleRouteJson & ViaLayerPolicy = {
        layerCount,
        allowBlindAndBuriedVias,
        minTraceWidth: 0.1,
        bounds: { minX: -2, maxX: 2, minY: -2, maxY: 2 },
        obstacles: [],
        connections: [
          {
            name: "via-net",
            pointsToConnect: [
              { x: -1, y: 0, layer: "top" },
              { x: 1, y: 0, layer: "inner2" },
            ],
          },
          {
            name: "wire-net",
            pointsToConnect: [
              { x: -1, y: 0, layer: "bottom" },
              { x: 1, y: 0, layer: "bottom" },
            ],
          },
        ],
      }
      const routes = [wireRoute, viaRoute]
      const before = structuredClone(routes)
      const path = findClearancePath({
        srj,
        routes,
        routeIndex: 0,
        start: wireRoute.route[0]!,
        end: wireRoute.route[1]!,
        bounds: srj.bounds,
        traceThickness: 0.1,
        traceClearance: 0.1,
        viaClearance: 0.1,
        allowLayerChanges: false,
        existingPath: wireRoute.route,
      })
      expect(path).not.toBeNull()
      expect(path![0]).toEqual(wireRoute.route[0])
      expect(path!.at(-1)).toEqual(wireRoute.route[1])
      if (!allowBlindAndBuriedVias) {
        for (let i = 1; i < path!.length; i++) {
          expect(
            pointToSegmentDistance({ x: 0, y: 0 }, path![i - 1]!, path![i]!),
          ).toBeGreaterThanOrEqual(0.3 - 1e-8)
        }
      }
      if (allowBlindAndBuriedVias) expect(path).toEqual(wireRoute.route)
      expect(routes).toEqual(before)
    }
  }
})
