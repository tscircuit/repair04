import { expect, spyOn, test } from "bun:test"
import type Flatbush from "flatbush"
import type { HighDensityRoute } from "high-density-repair03/lib"
import { CopperQueryIndex } from "../lib/CopperQueryIndex"
import { NegotiateTraceClearanceSolver } from "../lib/NegotiateTraceClearanceSolver"
import type { NegotiatedClearanceInput } from "../lib/negotiateTraceClearance"

test("native windows preserve steps, output and live rules", (): void => {
  const createInput = (
    blind: boolean,
    mutate: boolean,
  ): NegotiatedClearanceInput => {
    const bounds = { minX: -1, maxX: 1, minY: -1, maxY: 1 }
    const routes: HighDensityRoute[] = Array.from(
      { length: 12 },
      (_, index) => {
        const y = index === 0 ? 0 : (index - 6) * 0.055
        const z = index % 3
        const extent = index === 0 ? 0.95 : 0.55
        return {
          connectionName: index === 0 ? "selected" : `peer-${index % 4}`,
          traceThickness: index % 2 === 0 ? 0.1 : 0.12,
          viaDiameter: 0.3,
          vias: index % 4 === 0 ? [{ x: 0, y }] : [],
          route:
            index !== 0 && index % 4 === 0
              ? [
                  { x: -extent, y, z },
                  { x: 0, y, z },
                  { x: 0, y, z: (z + 1) % 3 },
                  { x: extent, y, z: (z + 1) % 3 },
                ]
              : [
                  { x: -extent, y, z },
                  { x: 0, y, z },
                  { x: extent, y, z },
                ],
        }
      },
    )
    const input: NegotiatedClearanceInput = {
      srj: {
        bounds,
        layerCount: 3,
        minTraceWidth: 0.1,
        connections: [],
        allowBlindAndBuriedVias: blind,
        obstacles: [],
      },
      routes,
      bounds,
      dirtyRouteIndices: [0],
      isLocked: (): boolean => false,
      allowLayerChanges: true,
      traceClearance: 0.1,
      viaClearance: 0.1,
      maxPathSearchNodes: 300,
      maxPathSearchNodesPerCall: 180,
      maxPathSearchCalls: 3,
      onSearch: (): void => {
        if (mutate) {
          input.traceClearance = 0.11
          input.viaClearance = 0.09
          input.srj.allowBlindAndBuriedVias = !blind
        }
      },
    }
    return input
  }
  const run = (blind: boolean, mutate: boolean): unknown => {
    const input = createInput(blind, mutate)
    const originalRoutes = structuredClone(input.routes)
    const solver = new NegotiateTraceClearanceSolver(input)
    const steps: unknown[] = []
    let changedDuringSearch = false
    while (!solver.solved && !solver.failed) {
      solver.step()
      if (
        mutate &&
        !changedDuringSearch &&
        (solver.activeSubSolver?.stats.nodesPopped ?? 0) > 0
      ) {
        input.traceClearance = 0.105
        input.routes[1]!.route[1]!.y += 0.0005
        originalRoutes[1]!.route[1]!.y += 0.0005
        changedDuringSearch = true
      }
      steps.push({
        iterations: solver.iterations,
        stats: { ...solver.stats },
        progress: solver.progress,
        activeName: solver.activeSubSolver?.getSolverName(),
        activeIterations: solver.activeSubSolver?.iterations,
        solved: solver.solved,
        failed: solver.failed,
      })
    }
    if (mutate) expect(changedDuringSearch).toBe(true)
    expect(solver.failed).toBe(false)
    expect(input.routes).toEqual(originalRoutes)
    return { steps, output: solver.getOutput() }
  }
  for (const blind of [false, true]) {
    for (const mutate of [false, true]) {
      const reused = run(blind, mutate)
      const originalSearch = spyOn(
        CopperQueryIndex.prototype,
        "search",
      ).mockImplementation(function (
        this: { index: Flatbush },
        minX: number,
        minY: number,
        maxX: number,
        maxY: number,
      ): number[] {
        return this.index.search(minX, minY, maxX, maxY)
      })
      try {
        expect(run(blind, mutate)).toEqual(reused)
      } finally {
        originalSearch.mockRestore()
      }
    }
  }
})
