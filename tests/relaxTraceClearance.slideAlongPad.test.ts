import { expect, test } from "bun:test"
import { segmentToSegmentMinDistance } from "@tscircuit/math-utils"
import { AutoroutingDrcEngine } from "high-density-repair03/lib"
import {
  convertRepairRoutesToTraces,
  getNewViaPadViolations,
  relaxTraceClearance,
} from "../lib"
import type { RepairRegionInput } from "../lib/repairRegionTypes"

test("a via can slide along its pad to clear a fixed diagonal trace", (): void => {
  for (const shape of ["rect", "oval"] as const) {
    for (const rotationDegrees of [0, 37]) {
      const bounds = { minX: -3, maxX: 3, minY: -3, maxY: 3 }
      const input: RepairRegionInput = {
        srj: {
          layerCount: 2,
          minTraceWidth: 0.1,
          bounds,
          obstacles: [{
            type: shape,
            ccwRotationDegrees: rotationDegrees,
            center: { x: 0, y: 0.5 },
            width: 0.2,
            height: 1,
            layers: ["top"],
            connectedTo: ["via-owner"],
          }],
          connections: ["via-owner", "fixed-trace"].map((name) => ({
            name,
            pointsToConnect: [],
          })),
        },
        routes: [{
          connectionName: "via-owner",
          traceThickness: 0.1,
          viaDiameter: 0.3,
          route: [
            { x: -0.26, y: -1, z: 0 },
            { x: -0.26, y: 0.2, z: 0 },
            { x: -0.26, y: 0.2, z: 1 },
            { x: -0.26, y: -1, z: 1 },
          ],
          vias: [{ x: -0.26, y: 0.2 }],
        }, {
          connectionName: "fixed-trace",
          traceThickness: 0.1,
          viaDiameter: 0.3,
          route: [
            { x: -1, y: -0.3, z: 0 },
            { x: -0.3, y: 0.4, z: 0 },
          ],
          vias: [],
        }],
        bounds,
        boundaryMargin: 0,
        lockedPointIndices: [[true, false, false, true], [true, true]],
      }
      const radians = rotationDegrees * Math.PI / 180
      const cosine = Math.cos(radians), sine = Math.sin(radians)
      const rotate = (point: { x: number; y: number }): { x: number; y: number } => {
        return {
          x: point.x * cosine - point.y * sine,
          y: point.x * sine + point.y * cosine,
        }
      }
      input.srj.obstacles[0]!.center = rotate(input.srj.obstacles[0]!.center)
      for (const route of input.routes) {
        route.route = route.route.map((point) => ({ ...point, ...rotate(point) }))
        route.vias = route.vias.map(rotate)
      }
      const engine = new AutoroutingDrcEngine(input.srj)
      expect(
        engine.evaluate(convertRepairRoutesToTraces(input.routes, 2)).errors.length,
      ).toBeGreaterThan(0)
      const output = relaxTraceClearance({ ...input, allowViaMovement: true })
      const via = output[0]!.vias[0]!
      expect(-via.x * sine + via.y * cosine).toBeLessThan(0.05)
      expect(
        segmentToSegmentMinDistance(
          via, via, output[1]!.route[0]!, output[1]!.route[1]!,
        ) - 0.2,
      ).toBeGreaterThanOrEqual(0.1 - 1e-7)
      expect(
        engine.evaluate(convertRepairRoutesToTraces(output, 2)).errors,
      ).toEqual([])
      expect(getNewViaPadViolations({
        srj: input.srj,
        previousRoutes: input.routes,
        routes: output,
      })).toEqual([])
      expect(output[1]).toEqual(input.routes[1])
      expect(output[0]!.route[0]).toEqual(input.routes[0]!.route[0])
      expect(output[0]!.route.at(-1)).toEqual(input.routes[0]!.route.at(-1))
      expect(output[0]!.route[1]).toEqual({ ...via, z: 0 })
      expect(output[0]!.route[2]).toEqual({ ...via, z: 1 })
    }
  }
})
