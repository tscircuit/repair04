import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"

export function sameNetViaPocket(offset = 0): {
  srj: SimpleRouteJson
  route: HighDensityRoute
} {
  const route: HighDensityRoute = {
    connectionName: "branch",
    rootConnectionName: "owner",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    route: [
      { x: offset - 0.5, y: offset, z: 0 },
      { x: offset + 0.16, y: offset, z: 0 },
      { x: offset + 0.16, y: offset, z: 1 },
      { x: offset + 0.6, y: offset, z: 1 },
    ],
    vias: [{ x: offset + 0.16, y: offset }],
  }
  const srj: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: 0.1,
    bounds: {
      minX: offset - 0.89,
      maxX: offset + 1.11,
      minY: offset - 0.25,
      maxY: offset + 0.25,
    },
    connections: [
      {
        name: "owner",
        pointsToConnect: [
          {
            x: offset - 0.5,
            y: offset,
            layer: "top",
            pcb_port_id: "terminal",
          },
        ],
      },
    ],
    obstacles: [
      {
        type: "rect",
        center: { x: offset - 0.5, y: offset },
        width: 1,
        height: 4,
        layers: ["top"],
        connectedTo: ["terminal", "pad-alias"],
      },
      {
        type: "rect",
        center: { x: offset + 0.92, y: offset },
        width: 1,
        height: 4,
        layers: ["top"],
        connectedTo: ["foreign"],
      },
    ],
  }
  return { srj, route }
}
