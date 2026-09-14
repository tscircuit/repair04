import { expect, test } from "bun:test"
import { pointToSegmentDistance } from "@tscircuit/math-utils"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { relaxTraceClearance } from "../lib/relaxTraceClearance"
import type { ViaLayerPolicy } from "../lib/getViaCopperZSpan"

test("clearance projection moves bottom wires away from through-via copper", (): void => {
  for (const layerCount of [4, 6]) {
    for (const allowBlindAndBuriedVias of [undefined, false, true]) {
      const routes: HighDensityRoute[] = [
        {
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
        },
        {
          connectionName: "wire-net",
          traceThickness: 0.1,
          viaDiameter: 0.3,
          vias: [],
          route: [
            { x: -1, y: 0.05, z: layerCount - 1 },
            { x: -0.2, y: 0.05, z: layerCount - 1 },
            { x: 0.2, y: 0.05, z: layerCount - 1 },
            { x: 1, y: 0.05, z: layerCount - 1 },
          ],
        },
      ]
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
              { x: -1, y: 0.05, layer: "bottom" },
              { x: 1, y: 0.05, layer: "bottom" },
            ],
          },
        ],
      }
      const before = structuredClone(routes)
      const output = relaxTraceClearance({
        srj,
        routes,
        bounds: srj.bounds,
        boundaryMargin: 0,
        traceClearance: 0.1,
        viaClearance: 0.1,
        lockedPointIndices: routes.map((route) =>
          route.route.map((_, i) => i === 0 || i === route.route.length - 1),
        ),
      })
      if (!allowBlindAndBuriedVias) {
        for (let i = 1; i < output[1]!.route.length; i++) {
          expect(
            pointToSegmentDistance(
              { x: 0, y: 0 },
              output[1]!.route[i - 1]!,
              output[1]!.route[i]!,
            ),
          ).toBeGreaterThanOrEqual(0.3 - 1e-8)
        }
      }
      expect(output[0]!.route).toEqual(routes[0]!.route)
      expect(output[1]!.route[0]).toEqual(routes[1]!.route[0])
      expect(output[1]!.route.at(-1)).toEqual(routes[1]!.route.at(-1))
      expect(routes).toEqual(before)
      if (allowBlindAndBuriedVias)
        expect(output[1]!.route).toEqual(routes[1]!.route)
    }
  }
})
