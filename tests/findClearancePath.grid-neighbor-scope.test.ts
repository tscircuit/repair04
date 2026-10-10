import { expect, test } from "bun:test"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import type { ClearancePathInput } from "../lib/findClearancePath"
import type { Bounds, RepairRoutePoint } from "../lib/repairRegionTypes"

test("grid scopes retain callback scheduling and origin reads", (): void => {
  for (const originKind of ["plain", "getter", "coercing"] as const) {
    const run = (scoped: boolean, throws: boolean): unknown => {
      const reads: string[] = []
      const coercions: string[] = []
      const callbacks: unknown[] = []
      const steps: unknown[] = []
      const bounds: Bounds = {
        minX: -0.93,
        minY: -0.86,
        maxX: 0.97,
        maxY: 1.14,
      }
      if (originKind !== "plain") {
        for (const [key, origin] of [["minX", -0.93], ["minY", -0.86]] as const)
          Object.defineProperty(bounds, key, {
            get(): unknown {
              reads.push(key)
              if (originKind === "getter")
                return origin + (reads.length % 3) * 1e-10
              return {
                valueOf(): number {
                  coercions.push(key)
                  return origin
                },
              }
            },
            enumerable: true,
          })
      }
      const start = { x: -0.8, y: 0.1, z: 0 }
      const end = { x: 0.8, y: 0.1, z: 0 }
      Object.defineProperty(start, "z", {
        get(): number {
          reads.push("start.z")
          return 0
        },
        enumerable: true,
      })
      let activeNeighborhood: Readonly<Bounds> | undefined
      let scopedCalls = 0
      let roundedNeighborCalls = 0
      const edgeCost = function (
        this: ClearancePathInput,
        a: RepairRoutePoint,
        b: RepairRoutePoint,
      ): number {
        callbacks.push({
          a: { ...a },
          b: { ...b },
          arguments: arguments.length,
          receiver: this === input,
        })
        if (callbacks.length === 30)
          input.getAdditionalEdgeCost = function (
            this: ClearancePathInput,
            a,
            b,
          ): number {
            return edgeCost.call(this, a, b) + 0.02
          }
        if (throws && callbacks.length === 35) throw new Error("callback failure")
        const neighborhood = activeNeighborhood
        if (neighborhood) {
          scopedCalls++
          if (originKind === "plain") {
            expect(neighborhood.minX).toBeLessThanOrEqual(Math.min(a.x, b.x))
            expect(neighborhood.minY).toBeLessThanOrEqual(Math.min(a.y, b.y))
            expect(neighborhood.maxX).toBeGreaterThanOrEqual(
              Math.max(a.x, b.x),
            )
            expect(neighborhood.maxY).toBeGreaterThanOrEqual(
              Math.max(a.y, b.y),
            )
            if (Math.abs(a.x - b.x) > 0.1 || Math.abs(a.y - b.y) > 0.1)
              roundedNeighborCalls++
          }
        }
        return Math.min(a.x, b.x) <= 0 &&
          Math.max(a.x, b.x) >= 0 &&
          Math.min(Math.abs(a.y), Math.abs(b.y)) < 0.3
          ? 3
          : 0
      }
      const input: ClearancePathInput = {
        srj: {
          bounds,
          connections: [],
          obstacles: [],
          layerCount: 1,
          minTraceWidth: 0.1,
        },
        routes: [
          {
            connectionName: "signal",
            traceThickness: 0.1,
            viaDiameter: 0.3,
            vias: [],
            route: [start, end],
          },
        ],
        routeIndex: 0,
        start,
        end,
        bounds,
        traceThickness: 0.1,
        traceClearance: 0.1,
        viaClearance: 0.1,
        gridSize: 0.1,
        allowLayerChanges: false,
        maxNodes: 300,
        getAdditionalEdgeCost: edgeCost,
      }
      Object.defineProperty(input.srj, "layerCount", {
        get(): number {
          reads.push("layerCount")
          return 1
        },
        enumerable: true,
      })
      let callbackReads = 0
      let liveEdgeCost = edgeCost
      Object.defineProperty(input, "getAdditionalEdgeCost", {
        get(): typeof edgeCost {
          callbackReads++
          return liveEdgeCost
        },
        set(callback: typeof edgeCost): void {
          liveEdgeCost = callback
        },
        enumerable: true,
      })
      const solver = new FindClearancePathSolver(
        input,
        scoped
          ? (neighborhood): void => {
              activeNeighborhood = neighborhood
            }
          : undefined,
      )
      while (!solver.solved && !solver.failed) {
        try {
          solver.step()
        } catch (error) {
          if (!throws) throw error
          expect((error as Error).message).toBe("callback failure")
        }
        steps.push({
          iterations: solver.iterations,
          stats: { ...solver.stats },
          progress: solver.progress,
          solved: solver.solved,
          failed: solver.failed,
        })
      }
      expect(solver.failed).toBe(throws)
      expect(liveEdgeCost).not.toBe(edgeCost)
      expect(activeNeighborhood).toBeUndefined()
      if (scoped && originKind !== "coercing")
        expect(scopedCalls).toBeGreaterThan(0)
      if (originKind === "coercing") expect(scopedCalls).toBe(0)
      if (scoped && originKind === "plain")
        expect(roundedNeighborCalls).toBeGreaterThan(0)
      return {
        steps,
        output: solver.failed ? undefined : solver.getOutput(),
        error: solver.error,
        callbacks,
        reads,
        coercions,
        callbackReads,
      }
    }
    for (const throws of [false, true])
      expect(run(true, throws)).toEqual(run(false, throws))
  }
})
