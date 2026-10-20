import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
  SimplifiedPcbTrace,
} from "high-density-repair03/lib"
import { getRepairJunctionAnchors } from "../lib/getRepairJunctionAnchors"
import { REGION_EPSILON } from "../lib/repairRegionGeometry"

test("indexed anchors retain the exhaustive scan's copper contacts and insertion order", (): void => {
  const routes: HighDensityRoute[] = [
    {
      connectionName: "trunk",
      rootConnectionName: "shared-net",
      traceThickness: 0.2,
      viaDiameter: 0.4,
      vias: [],
      route: [
        { x: -100, y: 0, z: 0 },
        { x: 100, y: 0, z: 0 },
      ],
    },
    {
      connectionName: "via-branch",
      rootConnectionName: "shared-net",
      traceThickness: 0.1,
      viaDiameter: 0.4,
      vias: [{ x: -1, y: 0.3 + REGION_EPSILON / 2 }],
      route: [
        { x: -3, y: 2, z: 0 },
        { x: -1, y: 0.3 + REGION_EPSILON / 2, z: 0 },
        { x: -1, y: 0.3 + REGION_EPSILON / 2, z: 2 },
        { x: -3, y: 2, z: 2 },
      ],
    },
  ]
  for (let index = 0; index < 40; index += 1) {
    const x = ((index * 17) % 40) - 20
    const y = index % 4 === 0 ? 0.2 + REGION_EPSILON / 2 : 10 + index
    routes.push({
      connectionName: `branch-${index}`,
      rootConnectionName: index % 9 === 0 ? "foreign-net" : "shared-net",
      traceThickness: 0.2,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x, y, z: index % 3 },
        { x: x + 0.5, y: y + 1, z: index % 3 },
      ],
    })
  }
  const traces: SimplifiedPcbTrace[] = Array.from({ length: 24 }, (_, index) => {
    const x = ((index * 7) % 24) - 12
    return {
      type: "pcb_trace",
      pcb_trace_id: `fixed-${index}`,
      connection_name: "preload-alias",
      route: [
        {
          route_type: "wire",
          x: x + REGION_EPSILON * (index % 2),
          y: 0.2,
          width: 0.2,
          layer: "top",
        },
        { route_type: "wire", x, y: 2, width: 0.2, layer: "top" },
      ],
    }
  })
  traces.push({
    type: "pcb_trace",
    pcb_trace_id: "fixed-via",
    connection_name: "preload-alias",
    route: [
      {
        route_type: "via",
        x: -1,
        y: 0.7 + REGION_EPSILON / 2,
        from_layer: "top",
        to_layer: "bottom",
        via_diameter: 0.4,
      },
    ],
  })
  const fullBounds = { minX: -30, maxX: 30, minY: -1, maxY: 60 }
  const srj: SimpleRouteJson = {
    layerCount: 3,
    minTraceWidth: 0.1,
    bounds: fullBounds,
    obstacles: [],
    connections: [
      { name: "preload-alias", rootConnectionName: "shared-net", pointsToConnect: [] },
    ],
    traces,
  }
  const before = structuredClone({ srj, routes })
  const cases = [
    { name: "full", bounds: fullBounds, routes, srj },
    {
      name: "crop",
      bounds: { minX: -5, maxX: 5, minY: -0.1, maxY: 1 },
      routes,
      srj,
    },
    {
      name: "reverse-insertion",
      bounds: fullBounds,
      routes: routes.toReversed(),
      srj: { ...srj, traces: traces.toReversed() },
    },
  ]
  const results = cases.map(({ name, bounds, routes, srj }) => ({
    name,
    anchors: getRepairJunctionAnchors(srj, routes, bounds).flatMap(
      (anchors, index) =>
        anchors.segmentTimes.size === 0 && anchors.viaPositions.length === 0
          ? []
          : [{
              route: routes[index]!.connectionName,
              segmentTimes: [...anchors.segmentTimes],
              viaPositions: anchors.viaPositions,
            }],
    ),
  }))
  expect(results).toMatchSnapshot()
  expect({ srj, routes }).toEqual(before)
})
