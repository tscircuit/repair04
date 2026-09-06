import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import {
  convertRepairRoutesToTraces,
  getNewViaPadViolations,
  getRepairViaGeometry,
} from "../lib"

test("atomic layer transitions do not become vias or join neighboring physical via spans", (): void => {
  for (const endX of [0, 0.5]) {
    const route: HighDensityRoute = {
      connectionName: "signal",
      rootConnectionName: "signal-net",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      route: [
        { x: -2, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1, toNextSegmentType: "through_obstacle" },
        { x: endX, y: 0, z: 2 },
        { x: endX, y: 0, z: 3 },
        { x: 2, y: 0, z: 3 },
      ],
      vias: [{ x: 0, y: 0 }, ...(endX === 0 ? [] : [{ x: endX, y: 0 }])],
    }
    const vias = getRepairViaGeometry(route, 4)
    expect(
      vias.map((via) => ({
        pointIndices: via.pointIndices,
        layerSequence: via.layerSequence,
      })),
    ).toEqual([
      { pointIndices: [1, 2], layerSequence: [0, 1] },
      { pointIndices: [3, 4], layerSequence: [2, 3] },
    ])
    const converted = convertRepairRoutesToTraces([route], 4)[0]!
    expect(converted.connection_name).toBe("signal-net")
    expect(
      converted.route.filter((point) => point.route_type === "via"),
    ).toEqual([
      {
        route_type: "via",
        x: 0,
        y: 0,
        from_layer: "top",
        to_layer: "inner1",
        via_diameter: 0.3,
      },
      {
        route_type: "via",
        x: endX,
        y: 0,
        from_layer: "inner2",
        to_layer: "bottom",
        via_diameter: 0.3,
      },
    ])
    const srj: SimpleRouteJson = {
      layerCount: 4,
      minTraceWidth: 0.1,
      bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
      connections: [],
      obstacles: [
        {
          type: "rect",
          center: { x: 0, y: 0 },
          width: 2,
          height: 1,
          layers: ["top", "inner1", "inner2", "bottom"],
          connectedTo: [],
        },
      ],
    }
    expect(
      getNewViaPadViolations({
        srj,
        previousRoutes: [route],
        routes: [route],
        includeExistingVias: [
          { routeIndex: 0, viaIndex: 0 },
          { routeIndex: 0, viaIndex: 1 },
        ],
      }),
    ).toHaveLength(2)
    if (endX !== 0) {
      const unmarked = structuredClone(route)
      delete unmarked.route[2]!.toNextSegmentType
      expect(() => getRepairViaGeometry(unmarked, 4)).toThrow(
        "valid colocated vias",
      )
    }
  }
})
