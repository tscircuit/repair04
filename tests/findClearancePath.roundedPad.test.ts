import { expect, test } from "bun:test"
import { pointToSegmentDistance } from "@tscircuit/math-utils"
import type { HighDensityRoute, SimpleRouteJson } from "high-density-repair03/lib"
import { findClearancePath } from "../lib/findClearancePath"

test("planar paths can escape through a circular pad's clear corner", (): void => {
  const start = { x: 0.25, y: 0.25, z: 0 }
  const end = { x: 2, y: 2, z: 0 }
  const route: HighDensityRoute = { connectionName: "signal", traceThickness: 0.1,
    viaDiameter: 0.3, route: [start, end], vias: [] }
  const srj: SimpleRouteJson = { bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
    layerCount: 2, minTraceWidth: 0.1,
    connections: [{ name: "signal", pointsToConnect: [] }],
    obstacles: [{ type: "oval", center: { x: 0, y: 0 }, width: 0.4, height: 0.4,
      layers: ["top"], connectedTo: ["foreign"] }] }
  const output = findClearancePath({ srj, routes: [route], routeIndex: 0,
    start, end, bounds: srj.bounds, traceThickness: 0.1, traceClearance: 0.1,
    viaClearance: 0.1, allowLayerChanges: false })
  expect(output).not.toBeNull()
  expect(output![0]).toEqual(start)
  expect(output!.at(-1)).toEqual(end)
  for (let index = 1; index < output!.length; index++) {
    expect(output![index]!.z).toBe(0)
    expect(pointToSegmentDistance({ x: 0, y: 0 }, output![index - 1]!, output![index]!) - 0.25).toBeGreaterThan(0.1)
  }
})
