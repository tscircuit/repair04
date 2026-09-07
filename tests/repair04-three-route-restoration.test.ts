import { expect, test } from "bun:test"
import type { HighDensityRoute, SimpleRouteJson } from "high-density-repair03/lib"
import { generateThreeRouteCandidates } from "../lib/generateThreeRouteCandidates"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import { getRepairViaGeometry } from "../lib/getRepairViaGeometry"
import { Repair04Solver } from "../lib/Repair04Solver"

type PhysicalVia = Omit<ReturnType<typeof getRepairViaGeometry>[number], "pointIndices">

test("atomic three-route restoration clears a rectangle while retaining terminal tails and vias", (): void => {
  const bounds = { minX: -5, minY: -5, maxX: 5, maxY: 5 }
  const srj: SimpleRouteJson = { bounds, layerCount: 2, minTraceWidth: 0.1,
    connections: [], obstacles: [{ type: "rect", center: { x: 0, y: 0 }, width: 0.3, height: 0.3, layers: ["top", "bottom"], connectedTo: ["pcb_plated_hole_fixed"] }] }
  const routes: HighDensityRoute[] = [-0.5, 0, 0.5].map((y, i): HighDensityRoute => ({
    connectionName: `route${i}`, traceThickness: 0.1, viaDiameter: 0.3,
    vias: [{ x: -2, y }, { x: 2, y }], route: [
      { x: -5, y, z: 1 }, { x: -2, y, z: 1 }, { x: -2, y, z: 0 },
      { x: 0, y, z: 0 }, { x: 2, y, z: 0 }, { x: 2, y, z: 1 }, { x: 5, y, z: 1 },
    ],
  }))
  const before = structuredClone(routes)
  const violations = getFixedObstacleViolations({ srj, routes })
  expect(violations).toHaveLength(1)
  let nodes = 0, calls = 0
  const candidate = generateThreeRouteCandidates({ srj, routes,
    bounds: { minX: -4.5, minY: -4.5, maxX: 4.5, maxY: 4.5 }, violations,
    isLocked: (_ri, pi): boolean => pi === 0 || pi === 6,
    traceClearance: 0.1, viaClearance: 0.1, maxSearchCalls: 18,
    remainingNodes: (): number => 500000 - nodes,
    onSearch: (stats): void => { calls++; nodes += stats.nodesPopped },
  }).next().value
  expect(candidate).toHaveLength(3)
  expect(calls).toBe(3)
  expect(nodes).toBeGreaterThan(0)
  const next = routes.slice()
  for (const replacement of candidate!) next[replacement.routeIndex] = replacement.route
  expect(next).not.toEqual(routes)
  expect(routes).toEqual(before)
  expect(getFixedObstacleViolations({ srj, routes: next })).toHaveLength(0)
  for (let i = 0; i < routes.length; i++) {
    expect(next[i]!.route.slice(0, 3)).toEqual(routes[i]!.route.slice(0, 3))
    expect(next[i]!.route.slice(-3)).toEqual(routes[i]!.route.slice(-3))
    expect(getRepairViaGeometry(next[i]!, srj.layerCount).map(({ pointIndices, ...via }): PhysicalVia => via)).toEqual(
      getRepairViaGeometry(routes[i]!, srj.layerCount).map(({ pointIndices, ...via }): PhysicalVia => via),
    )
    expect(next[i]!.route.every((p): boolean => p.z === 0 || p.z === 1)).toBe(true)
  }
  const solver = new Repair04Solver({ srj, routes: next, bounds: { minX: -6, minY: -6, maxX: 6, maxY: 6 }, boundaryMargin: 0.5, lockedPointIndices: next.map((r): boolean[] => r.route.map((_p, i): boolean => i === 0 || i === r.route.length - 1)), maxCandidateAttempts: 1 })
  const score = (solver as unknown as { evaluate(routes: HighDensityRoute[]): { count: number } }).evaluate(next)
  expect(score.count).toBe(0)
})
