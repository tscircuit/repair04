import { Repair04Solver, type Repair04SolverInput } from "../../lib/Repair04Solver"
import type { HighDensityRoute } from "high-density-repair03/lib"

export type PairAccess = {
  score: { errors: Array<Record<string, unknown>> }
  evaluate(routes: HighDensityRoute[]): { errors: Array<Record<string, unknown>> }
  generateCrossingPairCandidates(): Generator<unknown>
  coupledPathSearchCalls: number
  pathSearchNodes: number
}

export function createCrossingPairInput(): Repair04SolverInput {
  return {
    srj: { bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 }, layerCount: 2, minTraceWidth: 0.1, obstacles: [], connections: [
      { name: "a", pointsToConnect: [{ x: 0, y: -2, layer: "top" }, { x: 3, y: 2, layer: "bottom" }] },
      { name: "b", pointsToConnect: [{ x: -2, y: 0, layer: "top" }, { x: 2, y: 0, layer: "top" }] },
    ] },
    routes: [
      { connectionName: "a", traceThickness: 0.1, viaDiameter: 0.3, vias: [{ x: 1, y: 2 }], route: [
        { x: 0, y: -2, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 2, z: 0 },
        { x: 1, y: 2, z: 1 }, { x: 2, y: 2, z: 1 }, { x: 3, y: 2, z: 1 },
      ] },
      { connectionName: "b", traceThickness: 0.1, viaDiameter: 0.3, vias: [], route: [
        { x: -2, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 },
      ] },
    ],
    bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 }, boundaryMargin: 0.5,
    lockedPointIndices: [[true, false, false, false, false, true], [true, false, false, true]],
    allowLayerChanges: true, maxCandidateAttempts: 100, maxPathSearchNodes: 500000,
  }
}

export function createCrossingPairAccess(input: Repair04SolverInput): PairAccess {
  const solver = new Repair04Solver(input)
  const access = solver as unknown as PairAccess
  access.score = access.evaluate(input.routes)
  return access
}
