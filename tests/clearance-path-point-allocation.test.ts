import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import type { ClearancePathInput } from "../lib/findClearancePath"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"
import { pathInput } from "./fixtures/repair04StepFixtures"

import golden from "./fixtures/clearance-path-point-allocation-golden.json"

const encode = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    typeof item === "number" && Object.is(item, -0) ? "-0" : item,
  )
const hash = (value: unknown): string =>
  createHash("sha256").update(encode(value)).digest("hex")
const cases = ["dense", "weighted", "layered", "blind", "sparse", "live"]
function run(Solver: typeof FindClearancePathSolver, name: string): unknown {
  const input: ClearancePathInput = structuredClone(pathInput)
  input.srj = structuredClone(input.srj)
  input.bounds = {
    minX: -4.5,
    maxX: 4.5,
    minY: -4.5,
    maxY: 4.5,
  }
  input.srj.bounds = input.bounds
  input.routes = [input.routes[0]!]
  input.maxNodes = 768
  if (name === "weighted") input.heuristicWeight = 2
  if (name === "layered" || name === "blind") {
    input.allowLayerChanges = true
    input.srj.layerCount = 4
    input.srj.allowBlindAndBuriedVias = name === "blind"
    input.end = { ...input.end, z: 3 }
  }
  if (name === "sparse") {
    input.bounds = {
      minX: -20,
      maxX: 20,
      minY: -20,
      maxY: 20,
    }
    input.srj.bounds = input.bounds
    input.gridSize = 0.01
    input.srj.obstacles = []
    input.maxNodes = 256
  }
  const identities = new WeakMap<object, number>()
  const retained: RepairRoutePoint[] = []
  const calls: unknown[] = []
  const identify = (point: RepairRoutePoint): number => {
    let id = identities.get(point)
    if (id === undefined) {
      id = retained.length
      identities.set(point, id)
      retained.push(point)
    }
    return id
  }
  input.getAdditionalEdgeCost = (a, b): number => {
    calls.push([identify(a), identify(b), { ...a }, { ...b }])
    if (name === "live") {
      b.traceThickness = calls.length % 2 ? -0 : 0.07
      if (calls.length % 37 === 0) a.x += 0.00001
    }
    return (calls.length % 11) / 1000 + (a.z === b.z ? 0 : 0.5)
  }
  const solver = new Solver(input)
  const steps: unknown[] = []
  while (!solver.solved && !solver.failed) {
    solver.step()
    steps.push([
      solver.iterations,
      solver.progress,
      solver.MAX_ITERATIONS,
      { ...solver.stats },
      solver.solved,
      solver.failed,
      solver.error,
    ])
    if (name === "live" && steps.length === 9) {
      input.bounds.minX += 0.000001
      input.srj.defaultObstacleMargin = 0.02
      input.getAdditionalEdgeCost = (a, b): number => {
        calls.push([identify(a), identify(b), { ...a }, { ...b }])
        return (calls.length % 7) / 1000
      }
    }
  }
  return {
    name,
    iterations: solver.iterations,
    calls: calls.length,
    identities: retained.length,
    callsHash: hash(calls),
    retainedHash: hash(retained),
    stepsHash: hash(steps),
    output: solver.failed ? null : solver.getOutput(),
    error: solver.error,
  }
}
test("deferred clearance points preserve callback aliases and step accounting", (): void => {
  expect(
    cases.map((name): unknown => run(FindClearancePathSolver, name)),
  ).toEqual(golden.results)
})
