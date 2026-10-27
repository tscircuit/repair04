import { expect, test } from "bun:test"
import { SolverRuntime } from "@tscircuit/solver-utils/runtime/node"
import { readFileSync } from "node:fs"
import { RelaxTraceClearanceSolver } from "../lib/RelaxTraceClearanceSolver"
import golden from "./fixtures/clearance-projection-revisions.json"

test("one and four workers retain golden geometry, stats and every native preparation step", async () => {
  const name = "board1726-central-fanout-spacing-parity.json"
  const input = JSON.parse(
    readFileSync(
      new URL(`./fixtures/clearance-repros/${name}`, import.meta.url),
      "utf8",
    ),
  ).input
  const original = structuredClone(input)
  for (const workerCount of [1, 4]) {
    const runtime = new SolverRuntime({
      workerCount,
      workerUrl: new URL(
        "./fixtures/clearancePreparation.worker.ts",
        import.meta.url,
      ),
      requireWorker: true,
    })
    try {
      for (let reuse = 0; reuse < 2; reuse++) {
        const serial = new RelaxTraceClearanceSolver(input)
        const parallel = new RelaxTraceClearanceSolver(input)
        serial.step()
        parallel.step()
        let dispatched = 0
        await parallel.prepareAsync({
          executeAsync: (Solver: any, task: any): any => {
            dispatched++
            return runtime.executeAsync(Solver, task)
          },
        })
        expect(dispatched).toBe(4)
        while (!serial.solved && !serial.failed) {
          serial.step()
          parallel.step()
          expect(parallel.stats).toEqual(serial.stats)
          expect(parallel.iterations).toBe(serial.iterations)
          expect(parallel.MAX_ITERATIONS).toBe(serial.MAX_ITERATIONS)
          expect(parallel.solved).toBe(serial.solved)
        }
        expect(parallel.getOutput()).toEqual(serial.getOutput())
        expect(parallel.iterations).toBe(golden[name].iterations)
        expect(parallel.stats).toEqual(golden[name].stats)
        expect(input).toEqual(original)
      }
    } finally {
      await runtime.dispose()
    }
  }
})
