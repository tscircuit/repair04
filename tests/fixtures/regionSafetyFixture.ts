import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"

export const regionSafetyFixture = (): {
  srj: SimpleRouteJson
  routes: HighDensityRoute[]
  bounds: SimpleRouteJson["bounds"]
} => {
  const routes: HighDensityRoute[] = [
    {
      connectionName: "signal",
      rootConnectionName: "signal-net",
      traceThickness: 0.2,
      viaDiameter: 0.3,
      route: [
        { x: -100, y: 0, z: 0, pcb_port_id: "start" },
        { x: 0, y: 0, z: 0 },
        { x: 100, y: 0, z: 0, pcb_port_id: "end" },
      ],
      vias: [],
    },
    {
      connectionName: "remote",
      traceThickness: 0.2,
      viaDiameter: 0.3,
      route: [
        { x: 50, y: 50, z: 0 },
        { x: 60, y: 60, z: 0 },
      ],
      vias: [],
    },
  ]
  return {
    bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
    routes,
    srj: {
      layerCount: 2,
      minTraceWidth: 0.2,
      bounds: { minX: -110, maxX: 110, minY: -110, maxY: 110 },
      connections: [
        {
          name: "signal",
          rootConnectionName: "signal-net",
          pointsToConnect: [
            { x: -100, y: 0, layer: "top", pcb_port_id: "start" },
            { x: 100, y: 0, layer: "top", pcb_port_id: "end" },
          ],
        },
      ],
      obstacles: [
        {
          type: "rect",
          obstacleId: "near-copper",
          center: { x: 6, y: 0 },
          width: 1.2,
          height: 0.3,
          layers: ["top"],
          connectedTo: ["other-net"],
        },
        {
          type: "rect",
          obstacleId: "far-away",
          center: { x: 50, y: 50 },
          width: 1,
          height: 1,
          layers: ["top"],
          connectedTo: [],
        },
      ],
    },
  }
}
