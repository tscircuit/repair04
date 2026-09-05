import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"

export const newViaPadFixture = (): {
  srj: SimpleRouteJson
  previousRoutes: HighDensityRoute[]
  routes: HighDensityRoute[]
} => {
  const previousRoutes: HighDensityRoute[] = [
    {
      connectionName: "signal",
      rootConnectionName: "signal-net",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      route: [
        { x: -2, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
      ],
      vias: [],
    },
  ]
  const routes = structuredClone(previousRoutes)
  routes[0]!.route = [
    { x: -2, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 2, y: 0, z: 1 },
    { x: 2, y: 0, z: 0 },
  ]
  routes[0]!.vias = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
  ]
  return {
    previousRoutes,
    routes,
    srj: {
      bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
      layerCount: 2,
      minTraceWidth: 0.1,
      connections: [
        {
          name: "signal",
          rootConnectionName: "signal-net",
          pointsToConnect: [],
        },
      ],
      obstacles: [
        {
          type: "rect",
          center: { x: 0, y: 0 },
          width: 0.2,
          height: 0.85,
          layers: ["top"],
          connectedTo: ["signal-net", "pcb_smtpad_0"],
        },
      ],
    },
  }
}
