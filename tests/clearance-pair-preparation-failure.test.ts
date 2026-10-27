import { expect, test } from "bun:test"
import type { SolverRuntimeExecutor } from "@tscircuit/solver-utils"
import { readFileSync } from "node:fs"
import { RelaxTraceClearanceSolver } from "../lib/RelaxTraceClearanceSolver"

test("a preparation error propagates only after every submitted job settles", async () => {
  const input = JSON.parse(
    readFileSync(
      new URL(
        "./fixtures/clearance-repros/board1726-central-fanout-spacing-parity.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ).input
  const solver = new RelaxTraceClearanceSolver(input)
  solver.step()
  const release: Array<() => void> = []
  let dispatched = 0
  let settled = false
  const error = new Error("pair preparation failed")
  const runtime = {
    executeAsync: () =>
      ++dispatched === 1
        ? Promise.reject(error)
        : new Promise<Float64Array>((resolve) =>
            release.push(() => resolve(new Float64Array())),
          ),
  } as SolverRuntimeExecutor
  const preparing = solver.prepareAsync(runtime).then(
    () => {
      throw new Error("unexpected preparation success")
    },
    (failure: unknown) => {
      settled = true
      return failure
    },
  )
  await Promise.resolve()
  expect(dispatched).toBe(4)
  expect(settled).toBeFalse()
  for (const finish of release) finish()
  expect(await preparing).toBe(error)
  expect(solver.iterations).toBe(1)
  expect(solver.solved).toBeFalse()
})
