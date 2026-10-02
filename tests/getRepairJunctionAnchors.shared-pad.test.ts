import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { getRepairJunctionAnchors } from "../lib/getRepairJunctionAnchors"

test("immutable terminals on the same physical pad already connect their route branches", () => {
  const bounds = { minX: -1, maxX: 5, minY: -2, maxY: 2 }
  const srj: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: 0.1,
    bounds,
    connections: [],
    obstacles: [
      {
        type: "oval",
        center: { x: 0, y: 0 },
        width: 0.5,
        height: 0.3,
        ccwRotationDegrees: 37,
        layers: ["top"],
        connectedTo: ["pad"],
      },
    ],
  }
  const routes: HighDensityRoute[] = [
    {
      connectionName: "a",
      rootConnectionName: "net",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x: 0, y: 0.1, z: 0, pcb_port_id: "pad" },
        { x: 2, y: 1, z: 0 },
        { x: 4, y: -1, z: 0 },
      ],
    },
    {
      connectionName: "b",
      rootConnectionName: "net",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x: 0, y: -0.1, z: 0, pcb_port_id: "pad" },
        { x: 2, y: -1, z: 0 },
        { x: 4, y: 1, z: 0 },
      ],
    },
  ]
  const junctionCount = (input: HighDensityRoute[], source = srj): number =>
    getRepairJunctionAnchors(source, input, bounds).reduce(
      (sum, anchors) =>
        sum + anchors.segmentTimes.size + anchors.viaPositions.length,
      0,
    )
  expect(junctionCount(routes)).toBe(0)
  expect(junctionCount(routes, { ...srj, obstacles: [] })).toBeGreaterThan(0)
  const unknownPort = structuredClone(routes)
  unknownPort[0]!.route[0]!.pcb_port_id = "unrelated-pad"
  expect(junctionCount(unknownPort)).toBeGreaterThan(0)
  const outside = structuredClone(routes)
  outside[0]!.route[0]!.y = 0.4
  expect(junctionCount(outside)).toBeGreaterThan(0)
  const otherLayer = structuredClone(routes)
  otherLayer[0]!.route.unshift({ ...otherLayer[0]!.route[0]!, z: 1 })
  expect(junctionCount(otherLayer)).toBeGreaterThan(0)
  expect(routes[0]!.route[0]).toEqual({
    x: 0,
    y: 0.1,
    z: 0,
    pcb_port_id: "pad",
  })
})
