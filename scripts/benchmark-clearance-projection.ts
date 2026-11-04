import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { RelaxTraceClearanceSolver } from "../lib/RelaxTraceClearanceSolver"
import type { RelaxTraceClearanceInput } from "../lib/relaxTraceClearance"
import golden from "../tests/fixtures/clearance-projection-revisions.json"

type CaseResult = {
  name: string
  elapsedMs: number
  candidatePairs: number
  projectedConstraints: number
  outputSha256: string
}
type RunResult = { elapsedMs: number; cases: CaseResult[] }

const [argument, countArgument] = process.argv.slice(2)
if (!argument) {
  throw new Error(
    "Usage: bun scripts/benchmark-clearance-projection.ts <baseline-worktree> [runs=5]",
  )
}
if (argument === "--revision") {
  if (!countArgument) throw new Error("Missing revision worktree")
  const moduleUrl = pathToFileURL(
    resolve(countArgument, "lib/RelaxTraceClearanceSolver.ts"),
  ).href
  const { RelaxTraceClearanceSolver: Solver } = (await import(moduleUrl)) as {
    RelaxTraceClearanceSolver: typeof RelaxTraceClearanceSolver
  }
  const cases: CaseResult[] = []
  for (const [name, expected] of Object.entries(golden)) {
    const input: RelaxTraceClearanceInput = JSON.parse(
      readFileSync(
        new URL("../tests/fixtures/clearance-repros/" + name, import.meta.url),
        "utf8",
      ),
    ).input
    const started = performance.now()
    const solver = new Solver(input)
    solver.solve()
    const elapsedMs = performance.now() - started
    if (!solver.solved || solver.failed)
      throw new Error(
        name + ": " + (solver.error ?? "projection did not solve"),
      )
    const outputSha256 = createHash("sha256")
      .update(JSON.stringify(solver.getOutput()))
      .digest("hex")
    if (outputSha256 !== expected.sha256)
      throw new Error(name + ": geometry differs from the legacy golden")
    cases.push({
      name,
      elapsedMs,
      candidatePairs: solver.stats.preparedPairCount,
      projectedConstraints: solver.stats.projectedConstraintCount,
      outputSha256,
    })
  }
  console.log(
    JSON.stringify({
      elapsedMs: cases.reduce((sum, result) => sum + result.elapsedMs, 0),
      cases,
    } satisfies RunResult),
  )
} else {
  const baseline = resolve(argument)
  const candidate = fileURLToPath(new URL("../", import.meta.url))
  const runs = Number(countArgument ?? 5)
  if (!Number.isInteger(runs) || runs < 1)
    throw new Error("Runs must be a positive integer")
  const results: Record<"base" | "head", RunResult[]> = { base: [], head: [] }
  for (let run = 0; run < runs; run++) {
    const order: Array<"base" | "head"> =
      run % 2 === 0 ? ["base", "head"] : ["head", "base"]
    for (const revision of order) {
      const child = Bun.spawnSync({
        cmd: [
          process.execPath,
          import.meta.path,
          "--revision",
          revision === "base" ? baseline : candidate,
        ],
        stdout: "pipe",
        stderr: "pipe",
      })
      if (child.exitCode !== 0)
        throw new Error(new TextDecoder().decode(child.stderr))
      results[revision].push(JSON.parse(new TextDecoder().decode(child.stdout)))
    }
  }
  const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0
      ? (sorted[middle - 1]! + sorted[middle]!) / 2
      : sorted[middle]!
  }
  console.log(
    JSON.stringify(
      {
        runtime: {
          bun: Bun.version,
          platform: process.platform,
          arch: process.arch,
        },
        baseline,
        candidate,
        runs,
        medianTotalMs: {
          base: median(results.base.map((result) => result.elapsedMs)),
          head: median(results.head.map((result) => result.elapsedMs)),
        },
        results,
      },
      null,
      2,
    ),
  )
}
