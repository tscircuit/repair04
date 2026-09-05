import { expect, test } from "bun:test"
import {
  AutoroutingDrcEngine,
  type HighDensityRoute,
  type SimpleRouteJson,
} from "high-density-repair03/lib"
import { convertRepairRoutesToTraces } from "../lib/convertRepairRoutesToTraces"
import { Repair04Solver, type Repair04SolverInput } from "../lib/Repair04Solver"

const bounds = { minX: -5, minY: -5, maxX: 5, maxY: 5 }

function padConflictInput(withVia = false): Repair04SolverInput {
  const points: HighDensityRoute["route"] = withVia
    ? [
        { x: -5, y: 0, z: 0, pcb_port_id: "pcb_port_start" },
        { x: -4.7, y: 0, z: 0 },
        { x: -4.5, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: 4.5, y: 0, z: 1 },
        { x: 4.7, y: 0, z: 1 },
        { x: 5, y: 0, z: 1, pcb_port_id: "pcb_port_end" },
      ]
    : [
        { x: -5, y: 1, z: 0, pcb_port_id: "pcb_port_start" },
        { x: -4.7, y: 1, z: 0 },
        { x: -4.5, y: 1, z: 0 },
        { x: -1, y: 0.6, z: 0 },
        { x: 0, y: 0.6, z: 0 },
        { x: 1, y: 0.6, z: 0 },
        { x: 4.5, y: 1, z: 0 },
        { x: 4.7, y: 1, z: 0 },
        { x: 5, y: 1, z: 0, pcb_port_id: "pcb_port_end" },
      ]
  const srj: SimpleRouteJson = {
    bounds: { ...bounds },
    layerCount: 2,
    minTraceWidth: 0.15,
    obstacles: [
      {
        type: "rect",
        layers: ["top"],
        zLayers: [0],
        center: { x: 0, y: withVia ? 0.45 : 0 },
        width: withVia ? 0.3 : 1,
        height: withVia ? 0.3 : 1,
        connectedTo: ["pcb_smtpad_test", "unrelated-pad-net"],
      },
    ],
    connections: [
      {
        name: "signal",
        rootConnectionName: "signal",
        pointsToConnect: [
          { x: -5, y: withVia ? 0 : 1, layer: "top" },
          {
            x: 5,
            y: withVia ? 0 : 1,
            layer: withVia ? "bottom" : "top",
          },
        ],
      },
    ],
  }
  const routes: HighDensityRoute[] = [
    {
      connectionName: "signal",
      rootConnectionName: "signal",
      traceThickness: 0.15,
      viaDiameter: 0.6,
      vias: withVia ? [{ x: 0, y: 0 }] : [],
      route: points,
    },
  ]
  return {
    srj,
    routes,
    bounds: { ...bounds },
    boundaryMargin: 0.5,
    lockedPointIndices: [points.map(() => false)],
    maxCandidates: 2000,
  }
}

function errorsFor(input: Repair04SolverInput, routes: HighDensityRoute[]) {
  // Evaluate the emitted routes independently of the solver's counters.
  return new AutoroutingDrcEngine(input.srj).evaluate([
    ...(input.srj.traces ?? []),
    ...convertRepairRoutesToTraces(routes, input.srj.layerCount),
  ]).errors
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function expectBoundaryUnchanged(
  input: Repair04SolverInput,
  output: HighDensityRoute[],
) {
  for (const [routeIndex, original] of input.routes.entries()) {
    const result = output[routeIndex]!.route
    expect(result[0]).toEqual(original.route[0])
    expect(result.at(-1)).toEqual(original.route.at(-1))
    const fixed = original.route.filter(
      (point) => Math.abs(point.x) >= 4.5 || Math.abs(point.y) >= 4.5,
    )
    const resultFixed = result.filter(
      (point) => Math.abs(point.x) >= 4.5 || Math.abs(point.y) >= 4.5,
    )
    expect(resultFixed).toEqual(fixed)
  }
}

test("clears a real pad conflict without moving endpoints or the boundary collar", () => {
  const input = padConflictInput()
  const original = structuredClone(input)
  deepFreeze(input)
  expect(errorsFor(input, input.routes).length).toBeGreaterThan(0)

  const solver = new Repair04Solver(input)
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.solved).toBe(true)
  const output = solver.getOutput()
  expect(errorsFor(input, output)).toEqual([])
  expect(output).not.toEqual(input.routes)
  expectBoundaryUnchanged(input, output)
  expect(input).toEqual(original)

  // Returning a route must not expose mutable solver state to its caller.
  output[0]!.route[2]!.y += 50
  expect(errorsFor(input, solver.getOutput())).toEqual([])
  expect(solver.getConstructorParams()).toEqual([original])
})

test("moves a via stack atomically and emits a consistent via position", () => {
  const input = padConflictInput(true)
  const original = structuredClone(input)
  expect(
    errorsFor(input, input.routes).some(
      (error) => error.type === "pcb_pad_pad_clearance_error",
    ),
  ).toBe(true)
  const solver = new Repair04Solver(deepFreeze(input))
  solver.solve()
  expect(solver.failed).toBe(false)
  const output = solver.getOutput()
  expect(errorsFor(input, output)).toEqual([])
  expect(output[0]!.vias).toHaveLength(1)
  expect(output[0]!.vias[0]).not.toEqual({ x: 0, y: 0 })

  const transitions: Array<{ x: number; y: number }> = []
  for (let i = 1; i < output[0]!.route.length; i++) {
    const previous = output[0]!.route[i - 1]!
    const current = output[0]!.route[i]!
    if (previous.z === current.z) continue
    expect({ x: current.x, y: current.y }).toEqual({
      x: previous.x,
      y: previous.y,
    })
    transitions.push({ x: current.x, y: current.y })
  }
  expect(transitions).toEqual(output[0]!.vias)
  expectBoundaryUnchanged(input, output)
  expect(input).toEqual(original)
})

test("locking either side of a via preserves the entire transition", () => {
  const input = padConflictInput(true)
  const viaIndex = input.routes[0]!.route.findIndex(
    (point) => point.x === 0 && point.z === 0,
  )
  input.lockedPointIndices[0]![viaIndex] = true
  const solver = new Repair04Solver(input)
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.getOutput()).toEqual(input.routes)
  expect(solver.stats.finalErrorCount).toBe(solver.stats.initialErrorCount)
})

test("a fixed candidate budget gives deterministic output and incremental work", () => {
  const input = { ...padConflictInput(), maxCandidates: 37 }
  const first = new Repair04Solver(input)
  let previousCandidates = 0
  while (!first.solved && !first.failed) {
    first.step()
    const candidates = first.stats.candidates as number
    expect(candidates - previousCandidates).toBeGreaterThanOrEqual(0)
    expect(candidates - previousCandidates).toBeLessThanOrEqual(1)
    expect(candidates).toBeLessThanOrEqual(input.maxCandidates)
    previousCandidates = candidates
  }
  expect(first.failed).toBe(false)
  expect(first.stats.candidates).toBe(input.maxCandidates)
  expect(first.stats.finalErrorCount).toBeGreaterThan(0)

  const second = new Repair04Solver(input)
  second.solve()
  expect(second.getOutput()).toEqual(first.getOutput())
  expect(second.stats).toEqual(first.stats)
  expectBoundaryUnchanged(input, first.getOutput())
})
