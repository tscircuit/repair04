import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { Repair04Solver, type Repair04SolverInput } from "../lib/Repair04Solver"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"

test("three-route searches retain lifetime call and shared node limits after restart", (): void => {
  const input: Repair04SolverInput = {
    bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 }, boundaryMargin: 0.1,
    srj: { bounds: { minX: -5, minY: -5, maxX: 5, maxY: 5 }, layerCount: 2,
      minTraceWidth: 0.1, connections: [], obstacles: [{ type: "rect", center: { x: 0, y: 0 }, width: 0.3, height: 0.3, layers: ["top", "bottom"], connectedTo: ["pcb_plated_hole_test"] }] },
    routes: [-0.6, 0, 0.6].map((y, i): HighDensityRoute => ({ connectionName: `route${i}`, traceThickness: 0.1, viaDiameter: 0.3, vias: [], route: [{ x: -2, y, z: 0 }, { x: 2, y, z: 0 }] })),
    lockedPointIndices: [[true, true], [true, true], [true, true]],
    maxCandidateAttempts: 100, maxPathSearchNodes: 1,
  }
  expect(getFixedObstacleViolations(input)).toHaveLength(1)
  const solver = new Repair04Solver(input)
  const access = solver as unknown as {
    score: unknown; evaluate(routes: typeof input.routes): unknown
    generateCandidatesForMode(mode: boolean): Generator<unknown>
    threeRoutePathSearchCalls: number; threeRoutePathSearchNodes: number; pathSearchNodes: number
  }
  access.score = access.evaluate(input.routes)
  access.generateCandidatesForMode(false).next()
  expect(access.threeRoutePathSearchCalls).toBe(1)
  expect(access.threeRoutePathSearchNodes).toBe(1)
  expect(access.pathSearchNodes).toBe(1)
  access.generateCandidatesForMode(false).next()
  expect(access.threeRoutePathSearchCalls).toBe(1)
  const capped = new Repair04Solver({ ...input, maxPathSearchNodes: undefined }) as unknown as typeof access
  capped.score = capped.evaluate(input.routes)
  capped.threeRoutePathSearchCalls = 18
  capped.generateCandidatesForMode(false).next()
  expect(capped.threeRoutePathSearchCalls).toBe(18)
  expect(capped.threeRoutePathSearchNodes).toBe(0)
})
