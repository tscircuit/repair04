import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import os from "node:os"
import { SolverRuntime } from "@tscircuit/solver-utils/runtime/bun"
import { ClearancePairPreparationSolver } from "../lib/ClearancePairPreparationSolver"
import { RelaxTraceClearanceSolver } from "../lib/RelaxTraceClearanceSolver"
import type { RelaxTraceClearanceInput } from "../lib/relaxTraceClearance"

const [inputPath, baselinePath, repetitions = "3"] = process.argv.slice(2)
if (!inputPath || !baselinePath) {
  throw new Error(
    "Usage: bun scripts/benchmark-clearance-preparation.ts <inputs.json> <baseline-module.ts> [repeats]",
  )
}
const loaded = JSON.parse(readFileSync(inputPath, "utf8"))
const inputs: RelaxTraceClearanceInput[] = Array.isArray(loaded)
  ? loaded
  : [loaded.input]
const Baseline: typeof RelaxTraceClearanceSolver = (
  await import(pathToFileURL(resolve(baselinePath)).href)
).RelaxTraceClearanceSolver
const runtime = new SolverRuntime({
  workerCount: 4,
  workerUrl: new URL("./clearancePreparation.worker.ts", import.meta.url),
  requireWorker: true,
})
const modes = ["baseline", "serial", "fourWorkers"] as const
const reports: Array<Record<string, unknown>> = []
try {
  // Production shares an existing pool with upstream routing stages.
  await Promise.all(
    Array.from({ length: 4 }, () =>
      runtime.executeAsync(ClearancePairPreparationSolver, {
        segments: new Float64Array(),
        firstPair: 0,
        endPair: 0,
        traceClearance: 0.1,
        viaClearance: 0.1,
      }),
    ),
  )
  for (let repeat = 0; repeat < Number(repetitions); repeat++) {
    for (const [index, input] of inputs.entries()) {
      let reference: unknown
      for (let offset = 0; offset < modes.length; offset++) {
        const mode = modes[(offset + repeat) % modes.length]!
        const solver = new (
          mode === "baseline" ? Baseline : RelaxTraceClearanceSolver
        )(input)
        const start = performance.now()
        if (mode === "fourWorkers") {
          solver.step()
          await solver.prepareAsync(runtime)
        }
        solver.solve()
        const elapsedMs = performance.now() - start
        assert.equal(solver.solved, true, solver.error ?? "Projection failed")
        assert.equal(solver.failed, false)
        const logicalResult = {
          hash: createHash("sha256")
            .update(JSON.stringify(solver.getOutput()))
            .digest("hex"),
          iterations: solver.iterations,
          stats: solver.stats,
        }
        if (reference) assert.deepEqual(logicalResult, reference)
        else reference = logicalResult
        reports.push({ repeat, index, mode, elapsedMs, ...logicalResult })
      }
    }
  }
} finally {
  await runtime.dispose()
}
console.log(
  JSON.stringify(
    {
      runtime: Bun.version,
      cpu: os.cpus()[0]?.model,
      platform: process.platform,
      architecture: process.arch,
      warmPool: true,
      exactParity: true,
      reports,
    },
    null,
    2,
  ),
)
