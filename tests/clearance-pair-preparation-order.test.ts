import { expect, test } from "bun:test"
import type { SolverRuntimeExecutor } from "@tscircuit/solver-utils"
import { readFileSync } from "node:fs"
import { ClearancePairPreparationSolver } from "../lib/ClearancePairPreparationSolver"
import { RelaxTraceClearanceSolver } from "../lib/RelaxTraceClearanceSolver"

test("reverse completion and a resumed serial prefix retain pair order", async () => {
  const input = JSON.parse(
    readFileSync(
      new URL(
        "./fixtures/clearance-repros/board1726-central-fanout-spacing-parity.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ).input
  const serial = new RelaxTraceClearanceSolver(input)
  const parallel = new RelaxTraceClearanceSolver(input)
  serial.step()
  parallel.step()
  const release: Array<() => void> = []
  const runtime = {
    executeAsync: (
      Solver: typeof ClearancePairPreparationSolver,
      task: ConstructorParameters<typeof ClearancePairPreparationSolver>[0],
    ) =>
      new Promise<Float64Array>((resolve) => {
        release.push(() => {
          const solver = new Solver(task)
          solver.solve()
          resolve(solver.getOutput())
        })
      }),
  } as SolverRuntimeExecutor
  // An outer budget too small for preparation must perform no speculative work.
  await parallel.prepareAsync(runtime, 1)
  expect(release).toHaveLength(0)
  const first = parallel.prepareAsync(runtime)
  const second = parallel.prepareAsync(runtime)
  expect(release).toHaveLength(4)
  for (const finish of release.toReversed()) finish()
  await Promise.all([first, second])
  for (let index = 0; index < 73; index++) {
    serial.step()
    parallel.step()
  }
  expect(parallel.stats).toEqual(serial.stats)
  // Resume without a runtime, including a partial final pair batch.
  serial.solve()
  parallel.solve()
  expect(parallel.getOutput()).toEqual(serial.getOutput())
  expect(parallel.stats).toEqual(serial.stats)
  expect(parallel.iterations).toBe(serial.iterations)
})
