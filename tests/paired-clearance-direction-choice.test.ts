import { expect, test } from "bun:test"
import type {
  HighDensityRoute,
  SimpleRouteJson,
} from "high-density-repair03/lib"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import { PairedClearancePathSolver } from "../lib/PairedClearancePathSolver"
import { getRepairRouteVias } from "../lib/getRepairRouteVias"
import type { NegotiatedClearanceSearchInput } from "../lib/negotiatedClearanceSearchKernel"
import type { RepairRoutePoint } from "../lib/repairRegionTypes"

const makeTask = (): NegotiatedClearanceSearchInput => {
  const bounds = { minX: -3, maxX: 3, minY: -3, maxY: 3 }
  const srj: SimpleRouteJson = {
    bounds,
    layerCount: 2,
    minTraceWidth: 0.1,
    connections: [],
    obstacles: [
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 0.6,
        height: 0.6,
        layers: ["top", "bottom"],
        zLayers: [0, 1],
        connectedTo: ["blocker"],
      },
    ],
  }
  const fixed: HighDensityRoute = {
    connectionName: "foreign-drill",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [{ x: 2, y: 2 }],
    route: [
      { x: 2, y: 2, z: 0 },
      { x: 2, y: 2, z: 1 },
    ],
  }
  const routePoints: RepairRoutePoint[] = [
    {
      x: -2,
      y: 0,
      z: 0,
      pcb_port_id: "original-start",
      traceThickness: 0.1,
    },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
    {
      x: 2,
      y: 0,
      z: 1,
      pcb_port_id: "original-end",
      traceThickness: 0.1,
    },
  ]
  const route: HighDensityRoute = {
    connectionName: "signal",
    traceThickness: 0.1,
    viaDiameter: 0.3,
    vias: [{ x: 0, y: 0 }],
    route: routePoints,
  }
  return {
    pathInput: {
      srj,
      routes: [fixed, route],
      routeIndex: 1,
      start: route.route[0]!,
      end: route.route.at(-1)!,
      existingPath: route.route,
      bounds,
      traceThickness: 0.1,
      traceClearance: 0.05,
      viaClearance: 0.1,
      viaHoleDiameter: 0.15,
      allowLayerChanges: true,
      gridSize: 0.0025,
      maxNodes: 10_000,
    },
    coppers: [],
    selectedOwner: "signal",
    weights: [],
  }
}

const exerciseChoice = (sameGenerationTie: boolean): void => {
  const task = makeTask()
  const before = JSON.stringify(task)
  const paired = new PairedClearancePathSolver({ task, reverseMaxNodes: 384 })
  for (
    let step = 0;
    step < 100 && !paired.reverse?.isSearchPrepared();
    step++
  ) {
    expect(paired.solved).toBe(false)
    expect(paired.failed).toBe(false)
    paired.step()
  }
  const reverse = paired.reverse
  if (!reverse?.isSearchPrepared() || !paired.forward.isSearchPrepared()) {
    throw new Error("Both lane preparations must finish before the race")
  }
  expect(reverse.input.start).toEqual(task.pathInput.end)
  expect(reverse.input.end).toEqual(task.pathInput.start)
  expect(reverse.input.existingPath).toEqual(
    task.pathInput.existingPath!.slice().reverse(),
  )
  expect(reverse.input.viaHoleDiameter).toBe(0.15)
  const pathVia = (y: number): RepairRoutePoint[] => [
    { ...task.pathInput.start },
    { x: -1, y, z: 0, traceThickness: 0.1 },
    { x: -1, y, z: 1, traceThickness: 0.1 },
    { ...task.pathInput.end },
  ]
  const forwardPath = pathVia(-1)
  const reversePath = pathVia(1)
  const forwardPrefixNodes = paired.forward.stats.nodesPopped
  const stepped: string[] = []
  // Controlled native-step outcomes isolate generation/tie selection. The
  // actual Find implementation below independently validates the chosen route.
  paired.forward._step = (): void => {
    stepped.push("forward")
    paired.forward.stats.nodesPopped += 128
    if (sameGenerationTie) {
      paired.forward.stats.completionReason = "found"
      paired.forward.solved = true
      paired.forward.progress = 1
    }
  }
  paired.forward.getOutput = (): RepairRoutePoint[] =>
    structuredClone(forwardPath)
  reverse._step = (): void => {
    stepped.push("reverse")
    reverse.stats.nodesPopped = 1
    reverse.stats.completionReason = "found"
    reverse.solved = true
    reverse.progress = 1
  }
  reverse.getOutput = (): RepairRoutePoint[] =>
    structuredClone(reversePath).reverse()
  paired.step()
  expect(stepped).toEqual(["forward", "reverse"])
  expect(paired.solved).toBe(true)
  expect(paired.failed).toBe(false)
  const output = paired.getOutput()
  const expected = sameGenerationTie ? forwardPath : reversePath
  expect(output).toEqual(expected)
  expect(output![0]).toEqual(task.pathInput.start)
  expect(output!.at(-1)).toEqual(task.pathInput.end)
  expect(paired.stats.nodesPopped).toBe(forwardPrefixNodes + 129)
  expect(
    paired.getLaneStats().map((stats): number => stats.nodesPopped),
  ).toEqual([forwardPrefixNodes + 128, 1])
  const copiedStats = paired.getLaneStats()
  copiedStats[0]!.nodesPopped = 999
  expect(paired.getLaneStats()[0]!.nodesPopped).toBe(forwardPrefixNodes + 128)
  const validator = new FindClearancePathSolver({
    ...task.pathInput,
    existingPath: expected,
  })
  validator.solve()
  expect(validator.failed).toBe(false)
  expect(validator.getOutput()).toEqual(expected)
  expect(validator.stats.nodesPopped).toBe(0)
  expect(
    getRepairRouteVias({
      route: { ...task.pathInput.routes[1]!, route: output! },
      mutableBounds: task.pathInput.bounds,
    }),
  ).toEqual([{ x: -1, y: sameGenerationTie ? -1 : 1 }])
  expect(JSON.stringify(task)).toBe(before)
}

test("paired direction choice charges both lanes and preserves reversed port and drill geometry", (): void => {
  exerciseChoice(true)
  exerciseChoice(false)
})
