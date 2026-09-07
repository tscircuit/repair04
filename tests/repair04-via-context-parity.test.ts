import { expect, test } from "bun:test"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { Repair04Solver, type Repair04SolverInput } from "../lib/Repair04Solver"
import type { getRepairViaGeometry } from "../lib/getRepairViaGeometry"

type Access = {
  routes: HighDensityRoute[]
  generateExistingViaCandidates(): Generator<unknown>
  getIndexedViaIds(ri: number, route: HighDensityRoute, via: ReturnType<typeof getRepairViaGeometry>[number]): Set<string>
}
type Counter = { generation: number; oldWalks: number; movedWalks: number; oldKeys: Map<string, number> }

const instrument = (solver: Repair04Solver): Counter => {
  const access = solver as unknown as Access
  const counter: Counter = { generation: 0, oldWalks: 0, movedWalks: 0, oldKeys: new Map() }
  const generate = access.generateExistingViaCandidates.bind(access)
  access.generateExistingViaCandidates = function* (): Generator<unknown> {
    counter.generation++
    yield* generate()
  }
  const map = access.getIndexedViaIds.bind(access)
  access.getIndexedViaIds = (ri, route, via): Set<string> => {
    if (route === access.routes[ri]) {
      counter.oldWalks++
      const key = `${counter.generation}:${ri}:${via.identity}`
      counter.oldKeys.set(key, (counter.oldKeys.get(key) ?? 0) + 1)
    } else counter.movedWalks++
    return map(ri, route, via)
  }
  return counter
}

test("selected-via context is rebuilt after acceptance and shared only within one owner sweep", (): void => {
  const routes: HighDensityRoute[] = [-2, 2].flatMap((x, group): HighDensityRoute[] => [
    { connectionName: `owner${group}`, traceThickness: 0.1, viaDiameter: 0.3,
      vias: [{ x, y: 0 }], route: [{ x: x - 1, y: -1, z: 0 }, { x, y: 0, z: 0 }, { x, y: 0, z: 1 }, { x: x + 1, y: -1, z: 1 }] },
    { connectionName: `old${group}`, traceThickness: 0.1, viaDiameter: 0.3, vias: [], route: [{ x: x - 0.25, y: -0.2, z: 1 }, { x: x - 0.25, y: 0.2, z: 1 }] },
    { connectionName: `new${group}`, traceThickness: 0.1, viaDiameter: 0.3, vias: [], route: [{ x: x + 0.325, y: -2, z: 0 }, { x: x + 0.325, y: 2, z: 0 }] },
  ])
  const bounds = { minX: -6, minY: -6, maxX: 6, maxY: 6 }
  const input: Repair04SolverInput = { bounds, boundaryMargin: 0.5,
    srj: { bounds, layerCount: 2, minTraceWidth: 0.1, obstacles: [], connections: [] },
    routes, lockedPointIndices: routes.map((r): boolean[] => r.route.map((_, i): boolean => i === 0 || i === r.route.length - 1)),
    movableVias: [{ routeIndex: 0, viaIndex: 0 }, { routeIndex: 3, viaIndex: 0 }],
    allowLayerChanges: false, maxCandidateAttempts: 512, maxPathSearchNodes: 120000,
  }
  const before = structuredClone(input), variant = new Repair04Solver(input)
  const newCount = instrument(variant)
  let steps = 0
  while (!variant.solved && !variant.failed) {
    variant.step(); steps++
    expect(steps).toBeLessThan(2000)
  }
  expect(variant.solved).toBe(true)
  expect(variant.failed).toBe(false)
  expect(variant.stats.finalErrorCount).toBe(0)
  expect(variant.stats.accepted).toBeGreaterThanOrEqual(2)
  expect(newCount.generation).toBeGreaterThanOrEqual(2)
  expect(new Set([...newCount.oldKeys.keys()].map((key): string => key.split(":")[1]!)).size).toBe(2)
  expect([...newCount.oldKeys.values()].every((n): boolean => n === 1)).toBe(true)
  expect(newCount.oldWalks).toBeGreaterThan(0)
  expect(newCount.oldWalks).toBeLessThan(newCount.movedWalks)
  const output = variant.getOutput()
  for (let i = 0; i < output.length; i++) {
    expect(output[i]!.route[0]).toEqual(input.routes[i]!.route[0])
    expect(output[i]!.route.at(-1)).toEqual(input.routes[i]!.route.at(-1))
    expect(output[i]!.traceThickness).toBe(input.routes[i]!.traceThickness)
    expect(output[i]!.vias).toHaveLength(input.routes[i]!.vias.length)
  }
  expect(input).toEqual(before)
})
