import type { HighDensityRoute } from "high-density-repair03/lib"
import type { NegotiatedClearanceInput } from "../../lib/negotiateTraceClearance"

export const createPlanarCopperEligibilityProblem = ({
  allowBlindAndBuriedVias,
  endZ,
}: {
  allowBlindAndBuriedVias: boolean
  endZ: number
}): NegotiatedClearanceInput => {
  const bounds = { minX: -2, maxX: 2, minY: -2, maxY: 2 }
  const routes: HighDensityRoute[] = [
    {
      connectionName: "signal",
      rootConnectionName: "signal_net",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: endZ === 0 ? [] : [{ x: 0, y: 0 }],
      route: [
        { x: -1.6, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: endZ },
        { x: 1.6, y: 0, z: endZ },
      ],
    },
    {
      connectionName: "movable_neighbor",
      traceThickness: 0.1,
      viaDiameter: 0.3,
      vias: [],
      route: [
        { x: -0.8, y: 0.15, z: 0 },
        { x: 0.8, y: 0.15, z: 0 },
      ],
    },
  ]
  for (const ownNet of [false, true]) {
    for (let index = 0; index < 6; index++) {
      const x = -0.75 + index * 0.3
      const y = ownNet ? -0.35 : 0.5
      routes.push({
        connectionName: `${ownNet ? "own" : "fixed"}_via_${index}`,
        rootConnectionName: ownNet ? "signal_net" : "fixed_net",
        traceThickness: 0.1,
        viaDiameter: 0.3,
        vias: [{ x, y }],
        route: [
          { x, y, z: 0 },
          { x, y, z: ownNet ? 1 : 3 },
        ],
      })
    }
  }
  return {
    srj: {
      bounds,
      layerCount: 4,
      minTraceWidth: 0.1,
      connections: [],
      obstacles: [],
      allowBlindAndBuriedVias,
    },
    routes,
    bounds,
    dirtyRouteIndices: [0],
    isLocked: (routeIndex): boolean => routeIndex >= 2,
    allowLayerChanges: true,
    traceClearance: 0.1,
    viaClearance: 0.1,
    viaHoleDiameter: 0.15,
    maxPathSearchNodes: 30_000,
    maxPathSearchCalls: 3,
  }
}
