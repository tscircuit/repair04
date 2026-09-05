import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib/index"

export const nearCrossingSrj: SimpleRouteJson = {
  layerCount: 2,
  minTraceWidth: 0.15,
  minTraceToPadEdgeClearance: 0.15,
  bounds: { minX: -8, minY: -6, maxX: 8, maxY: 6 },
  obstacles: [
    {
      obstacleId: "nearby-pad",
      type: "rect",
      layers: ["top"],
      zLayers: [0],
      center: { x: 1.7, y: 0.75 },
      width: 0.8,
      height: 0.7,
      connectedTo: ["pcb_smtpad_nearby", "unrelated-pad"],
    },
  ],
  connections: [
    {
      name: "signal-a",
      rootConnectionName: "signal-a",
      pointsToConnect: [
        { x: -7, y: 0, layer: "top" },
        { x: 7, y: 0, layer: "top" },
      ],
    },
    {
      name: "signal-b",
      rootConnectionName: "signal-b",
      pointsToConnect: [
        { x: -7, y: 1.5, layer: "top" },
        { x: 7, y: 1.5, layer: "top" },
      ],
    },
  ],
}

export const nearCrossingRoutes: HighDensityRoute[] = [
  {
    connectionName: "signal-a",
    rootConnectionName: "signal-a",
    traceThickness: 0.15,
    viaDiameter: 0.6,
    vias: [],
    route: [
      { x: -7, y: 0, z: 0 },
      { x: -4, y: 0, z: 0 },
      { x: -2, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
      { x: 7, y: 0, z: 0 },
    ],
  },
  {
    connectionName: "signal-b",
    rootConnectionName: "signal-b",
    traceThickness: 0.15,
    viaDiameter: 0.6,
    vias: [],
    route: [
      { x: -7, y: 1.5, z: 0 },
      { x: -4, y: 1.5, z: 0 },
      { x: -2, y: 0.2, z: 0 },
      { x: 0, y: 0.2, z: 0 },
      { x: 2, y: 0.2, z: 0 },
      { x: 4, y: 1.5, z: 0 },
      { x: 7, y: 1.5, z: 0 },
    ],
  },
]

export const nearCrossingBounds = {
  minX: -5,
  minY: -5,
  maxX: 5,
  maxY: 5,
}
