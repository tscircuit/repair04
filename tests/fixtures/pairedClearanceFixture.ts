import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { PairedClearancePathSolver } from "../../lib/PairedClearancePathSolver"
import type { NegotiatedClearanceSearchInput } from "../../lib/negotiatedClearanceSearchKernel"

export function createPairedClearanceTask(
  geometry: "clear" | "endpoint" | "detour" | "wall" = "detour",
  maxNodes = 2_000,
): NegotiatedClearanceSearchInput {
  const route: HighDensityRoute = {
    connectionName: "paired-signal",
    rootConnectionName: "paired-signal",
    traceThickness: 0.2,
    viaDiameter: 0.6,
    vias: [],
    route: [
      { x: -4, y: 0, z: 0, pcb_port_id: "source" },
      { x: 4, y: 0, z: 0, pcb_port_id: "target" },
    ],
  }
  if (geometry === "clear") {
    route.route.splice(
      1,
      0,
      { x: -2, y: 0.8, z: 0, pcb_port_id: "retained-midpoint" },
      { x: 1, y: 0.8, z: 0 },
    )
  }
  const srj: SimpleRouteJson = {
    layerCount: 1,
    minTraceWidth: 0.2,
    bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
    connections: [],
    obstacles:
      geometry === "clear"
        ? []
        : [
            {
              type: "rect",
              center: { x: geometry === "endpoint" ? -4 : 0, y: 0 },
              width: 0.6,
              height: geometry === "wall" ? 20 : 0.6,
              connectedTo: ["foreign-pad"],
              layers: ["top"],
            },
          ],
  }
  return {
    pathInput: {
      srj,
      routes: [route],
      routeIndex: 0,
      start: route.route[0]!,
      end: route.route.at(-1)!,
      bounds: srj.bounds,
      traceThickness: 0.2,
      traceClearance: 0.1,
      viaClearance: 0.1,
      gridSize: 0.1,
      heuristicWeight: 3,
      allowLayerChanges: false,
      existingPath: route.route,
      maxNodes,
    },
    coppers: [],
    selectedOwner: route.connectionName,
    weights: [],
  }
}

export function pairedPublicState(solver: PairedClearancePathSolver): unknown {
  return {
    iterations: solver.iterations,
    MAX_ITERATIONS: solver.MAX_ITERATIONS,
    solved: solver.solved,
    failed: solver.failed,
    error: solver.error,
    progress: solver.progress,
    stats: structuredClone(solver.stats),
    laneStats: solver.getLaneStats(),
    forward: {
      iterations: solver.forward.iterations,
      MAX_ITERATIONS: solver.forward.MAX_ITERATIONS,
      solved: solver.forward.solved,
      failed: solver.forward.failed,
      progress: solver.forward.progress,
      error: solver.forward.error,
      stats: structuredClone(solver.forward.stats),
    },
    reverse: solver.reverse
      ? {
          iterations: solver.reverse.iterations,
          MAX_ITERATIONS: solver.reverse.MAX_ITERATIONS,
          solved: solver.reverse.solved,
          failed: solver.reverse.failed,
          progress: solver.reverse.progress,
          error: solver.reverse.error,
          stats: structuredClone(solver.reverse.stats),
        }
      : undefined,
    activeLane:
      solver.activeSubSolver === solver.forward
        ? "forward"
        : solver.reverse && solver.activeSubSolver === solver.reverse
          ? "reverse"
          : solver.activeSubSolver,
    laneErrors: solver.getLastLaneErrors(),
    output: solver.solved && !solver.failed ? solver.getOutput() : undefined,
  }
}

export function stepPairedUntil(
  solver: PairedClearancePathSolver,
  stopAtIteration = Infinity,
): void {
  while (
    !solver.solved &&
    !solver.failed &&
    solver.iterations < stopAtIteration
  ) {
    solver.step()
  }
}
