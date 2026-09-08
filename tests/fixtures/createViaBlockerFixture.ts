import type {
  HighDensityRoute,
  SimpleRouteJson,
  SimplifiedPcbTrace,
} from "high-density-repair03/lib"
import { Repair04Solver } from "../../lib/Repair04Solver"
import { getRepairViaGeometry } from "../../lib/getRepairViaGeometry"

type FixtureOptions = {
  owner?: HighDensityRoute
  fixedTraces?: SimplifiedPcbTrace[]
  layerCount?: number
  maxNodes?: number
  maxAttempts?: number
}

export const createViaBlockerFixture = (
  options: FixtureOptions = {},
): {
  solver: any
  selected: { routeIndex: number; viaIndex: number }
  candidate: any
} => {
  const owner: HighDensityRoute = options.owner ?? {
    connectionName: "owner",
    rootConnectionName: "owner",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [{ x: 0, y: 0 }],
    route: [
      { x: 0, y: -2, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 2, y: 0, z: 1 },
    ],
  }
  const routes: HighDensityRoute[] = [
    owner,
    ...[-0.2, 0.3].map(
      (x, index): HighDensityRoute => ({
        connectionName: `foreign${index}`,
        rootConnectionName: `foreign${index}`,
        traceThickness: 0.1,
        viaDiameter: 0.3,
        vias: [],
        route: [
          { x, y: -1, z: 0 },
          { x, y: 1, z: 0 },
        ],
      }),
    ),
  ]
  const bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 }
  const srj: SimpleRouteJson = {
    layerCount: options.layerCount ?? 2,
    minTraceWidth: 0.1,
    bounds,
    connections: [],
    obstacles: [],
    traces: options.fixedTraces ?? [],
  }
  const selected = { routeIndex: 0, viaIndex: 0 }
  const solver: any = new Repair04Solver({
    srj,
    bounds,
    boundaryMargin: 0.5,
    routes,
    lockedPointIndices: routes.map((route): boolean[] =>
      route.route.map(
        (_, index): boolean => index === 0 || index === route.route.length - 1,
      ),
    ),
    allowLayerChanges: false,
    movableVias: [selected],
    maxCandidates: 128,
    maxCandidateAttempts: options.maxAttempts ?? 128,
    maxPathSearchNodes: options.maxNodes ?? 30000,
  })
  solver.score = solver.evaluate(solver.routes)
  solver.candidates = solver.generateCandidates()
  const route = solver.routes[0] as HighDensityRoute
  const via = getRepairViaGeometry(route, srj.layerCount)[0]!
  const moved = {
    ...route,
    route: route.route.map((point, index): typeof point =>
      via.pointIndices.includes(index) ? { ...point, x: point.x + 0.1 } : point,
    ),
  }
  const geometry = getRepairViaGeometry(moved, srj.layerCount)
  const candidate = {
    routeIndex: 0,
    route: {
      ...moved,
      vias: geometry
        .filter(
          (item, index): boolean =>
            geometry.findIndex(
              (other): boolean => other.x === item.x && other.y === item.y,
            ) === index,
        )
        .map((item): { x: number; y: number } => ({ x: item.x, y: item.y })),
    },
    evaluatedScore: undefined as any,
  }
  const copper = solver.routes.slice()
  copper[0] = candidate.route
  candidate.evaluatedScore = solver.evaluate(copper)
  return { solver, selected, candidate }
}
