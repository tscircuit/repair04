import type { HighDensityRoute } from "high-density-repair03/lib"
import type { Repair04SolverInput } from "../../lib/Repair04Solver"

export function makeBudgetRoute(
  name: string,
  points: [number, number][],
): HighDensityRoute {
  return {
    connectionName: name,
    rootConnectionName: name,
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [],
    route: points.map(
      ([x, y]): HighDensityRoute["route"][number] & {
        traceThickness: number
      } => ({ x, y, z: 0, traceThickness: 0.1 }),
    ),
  }
}
export function makeBudgetInput(
  routes: HighDensityRoute[],
): Repair04SolverInput {
  const bounds = { minX: -5, minY: -5, maxX: 5, maxY: 5 }
  return {
    bounds,
    boundaryMargin: 0.25,
    routes,
    maxCandidates: 64,
    lockedPointIndices: routes.map((route): boolean[] =>
      route.route.map(
        (_, index): boolean => index === 0 || index === route.route.length - 1,
      ),
    ),
    srj: {
      bounds,
      layerCount: 2,
      minTraceWidth: 0.1,
      connections: [],
      obstacles: [],
    },
  }
}
