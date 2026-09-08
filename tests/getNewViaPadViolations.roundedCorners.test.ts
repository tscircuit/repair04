import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { getNewViaPadViolations, getFixedObstacleViolations } from "../lib"

test("via and fixed-copper guards measure actual rounded pads including rotated capsules", (): void => {
  for (const sample of [
    { width: 0.3, height: 0.3, rotation: 0, x: 0.3, y: 0.3 },
    { width: 1, height: 0.2, rotation: 37, x: 0.6, y: 0.3 },
  ]) {
    const radians = (sample.rotation * Math.PI) / 180
    const x = sample.x * Math.cos(radians) - sample.y * Math.sin(radians)
    const y = sample.x * Math.sin(radians) + sample.y * Math.cos(radians)
    const route: HighDensityRoute = {
      connectionName: "signal",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      route: [
        { x, y, z: 0 },
        { x, y, z: 1 },
      ],
      vias: [{ x, y }],
    }
    const srj: SimpleRouteJson = {
      bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
      layerCount: 2,
      minTraceWidth: 0.1,
      connections: [{ name: "signal", pointsToConnect: [] }],
      obstacles: [
        {
          type: "oval",
          center: { x: 0, y: 0 },
          width: sample.width,
          height: sample.height,
          ccwRotationDegrees: sample.rotation,
          layers: ["top"],
          connectedTo: ["foreign"],
        },
      ],
    }
    const previousRoutes: HighDensityRoute[] = [
      { ...route, route: [], vias: [] },
    ]
    expect(
      getNewViaPadViolations({ srj, previousRoutes, routes: [route] }),
    ).toEqual([])
    expect(getFixedObstacleViolations({ srj, routes: [route] })).toEqual([])
    srj.obstacles[0]!.type = "rect"
    expect(
      getNewViaPadViolations({ srj, previousRoutes, routes: [route] }).length,
    ).toBeGreaterThan(0)
    expect(
      getFixedObstacleViolations({ srj, routes: [route] }).length,
    ).toBeGreaterThan(0)
  }
})
