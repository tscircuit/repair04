import type { HighDensityRoute } from "high-density-repair03/lib"
import type { ClearanceVisualReproFixture } from "./renderClearanceRepro"

/** Two power branches share a fixed via and pass a fixed ground via. */
export function sharedViaClearanceFixture(): ClearanceVisualReproFixture {
  const bounds = { minX: -4, minY: -3, maxX: 4, maxY: 3 }
  const routes: HighDensityRoute[] = [-1, 1].map(
    (side, index): HighDensityRoute => ({
      connectionName: `power-${index}`,
      rootConnectionName: "power",
      traceThickness: 0.1,
      viaDiameter: 0.35,
      vias: [{ x: -2, y: 0 }],
      route: [
        { x: -3, y: side, z: 0 },
        { x: -2, y: 0, z: 0 },
        { x: -2, y: 0, z: 1 },
        { x: -1, y: 0, z: 1 },
        { x: 1, y: 0, z: 1 },
        { x: 3, y: 2 * side, z: 1 },
      ],
    }),
  )
  routes.push({
    connectionName: "ground",
    traceThickness: 0.1,
    viaDiameter: 0.35,
    vias: [{ x: 0, y: 0.24 }],
    route: [
      { x: -0.5, y: 1.5, z: 0 },
      { x: 0, y: 0.24, z: 0 },
      { x: 0, y: 0.24, z: 1 },
      { x: 0.5, y: 1.5, z: 1 },
    ],
  })
  return {
    name: "shared-via-clearance",
    title: "Shared power branches beside a fixed ground via",
    provenance:
      "Reduced topology from the H616 board's power and ground repair.",
    viewport: bounds,
    highlightViaTrace: {
      viaRouteIndex: 2,
      traceRouteIndex: 0,
      label: "Via to power trace",
    },
    input: {
      srj: {
        layerCount: 2,
        minTraceWidth: 0.1,
        bounds,
        obstacles: [],
        connections: [],
      },
      routes,
      bounds,
      boundaryMargin: 0,
      lockedPointIndices: routes.map((route, index): boolean[] =>
        route.route.map((): boolean => index === 2),
      ),
      traceClearance: 0.1,
      viaClearance: 0.1,
      allowViaMovement: true,
    },
  }
}
