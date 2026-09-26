import { expect, test } from "bun:test"
import {
  segmentToBoundsMinDistance,
  segmentToCircleMinDistance,
} from "@tscircuit/math-utils"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { findClearancePath } from "../lib/findClearancePath"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"

test("hole clearance reroutes physical obstacles independently of pad clearance", (): void => {
  for (const clearance of [undefined, 0, 0.05, 0.2, 0.5]) {
    for (const shape of ["circle", undefined] as const) {
      const height = shape === "circle" ? 2 : 1
      const minimum = clearance ?? 0.35
      const srj: SimpleRouteJson = {
        layerCount: 2,
        minTraceWidth: 0.2,
        minTraceToPadEdgeClearance: 0.35,
        minTraceToHoleEdgeClearance: clearance,
        bounds: { minX: -4, maxX: 4, minY: -4, maxY: 4 },
        connections: [],
        obstacles: [
          {
            type: "rect",
            isHole: true,
            shape,
            center: { x: 0, y: 0 },
            width: 2,
            height,
            layers: ["top", "bottom"],
            connectedTo: [],
          },
        ],
      }
      const before = JSON.stringify(srj)
      for (const z of [0, 1]) {
        const y = height / 2 + 0.1 + minimum
        const route: HighDensityRoute = {
          connectionName: "signal",
          traceThickness: 0.2,
          viaDiameter: 0.4,
          vias: [],
          route: [
            { x: -3, y, z },
            { x: 3, y, z },
          ],
        }
        expect(
          getFixedObstacleViolations({ srj, routes: [route] }),
        ).toHaveLength(0)
        for (const point of route.route) point.y -= 0.01
        expect(
          getFixedObstacleViolations({ srj, routes: [route] }),
        ).toHaveLength(1)
        const path = findClearancePath({
          srj,
          routes: [route],
          routeIndex: 0,
          start: route.route[0]!,
          end: route.route[1]!,
          bounds: srj.bounds,
          traceThickness: 0.2,
          traceClearance: 0.1,
          viaClearance: 0.1,
          allowLayerChanges: false,
          gridSize: 0.025,
        })
        expect(path).not.toBeNull()
        expect(
          getFixedObstacleViolations({
            srj,
            routes: [{ ...route, route: path! }],
          }),
        ).toHaveLength(0)
        // Measure the new copper's edge against the original physical hole.
        for (let i = 1; i < path!.length; i++) {
          const start = path![i - 1]!
          const end = path![i]!
          const distance =
            shape === "circle"
              ? segmentToCircleMinDistance(start, end, {
                  x: 0,
                  y: 0,
                  radius: 1,
                })
              : segmentToBoundsMinDistance(start, end, {
                  minX: -1,
                  maxX: 1,
                  minY: -height / 2,
                  maxY: height / 2,
                })
          expect(distance - route.traceThickness / 2).toBeGreaterThanOrEqual(
            minimum - 1e-8,
          )
        }
      }
      expect(JSON.stringify(srj)).toBe(before)
      // Removing the hole marker selects the ordinary obstacle/pad margin.
      srj.obstacles[0]!.isHole = false
      for (const deficit of [0, 0.01]) {
        const y = height / 2 + 0.1 + 0.35 - deficit
        const route: HighDensityRoute = {
          connectionName: "signal",
          traceThickness: 0.2,
          viaDiameter: 0.4,
          vias: [],
          route: [
            { x: -3, y, z: 0 },
            { x: 3, y, z: 0 },
          ],
        }
        expect(
          getFixedObstacleViolations({ srj, routes: [route] }),
        ).toHaveLength(deficit ? 1 : 0)
      }
    }
  }
})
