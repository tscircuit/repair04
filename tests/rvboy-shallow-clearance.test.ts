import { expect, test } from "bun:test"
import "bun-match-svg"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import {
  PairedClearancePathSolver,
  type PairedClearancePathInput,
} from "../lib/PairedClearancePathSolver"
import { createNegotiatedClearanceSearchKernel } from "../lib/negotiatedClearanceSearchKernel"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import { getRvboyShallowClearanceView } from "./fixtures/rvboy-shallow-clearance/getRvboyShallowClearanceView"

test("RVboy negotiates a shallow via clearance violation instead of repeating it", async (): Promise<void> => {
  const input = JSON.parse(
    gunzipSync(
      new Uint8Array(
        readFileSync(
          new URL(
            "./fixtures/rvboy-shallow-clearance/input.json.gz",
            import.meta.url,
          ),
        ),
      ),
    ).toString(),
  ) as PairedClearancePathInput
  const original = structuredClone(input)
  const { task } = input
  const trace = task.pathInput.routes[task.pathInput.routeIndex]!
  const kernel = createNegotiatedClearanceSearchKernel(task)
  const beforeHits = trace.route
    .slice(1)
    .flatMap((b, i) => kernel.query(trace.route[i]!, b))
  expect(beforeHits).toHaveLength(1)
  expect(beforeHits[0]!.copper.owner).toBe("source_net_74")
  const solver = new PairedClearancePathSolver(input)
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.stats.completionReason).toBe("found")
  const path = solver.getOutput()!
  expect(path[0]).toEqual(task.pathInput.start)
  expect(path.at(-1)).toEqual(task.pathInput.end)
  expect(
    path.slice(1).flatMap((b, i) => kernel.query(path[i]!, b)),
  ).toHaveLength(0)
  expect(
    getFixedObstacleViolations({
      srj: task.pathInput.srj,
      routes: [
        {
          ...trace,
          route: path,
          vias: path
            .slice(1)
            .flatMap((b, i) =>
              b.z !== path[i]!.z ? [{ x: b.x, y: b.y }] : [],
            ),
        },
      ],
    }),
  ).toHaveLength(0)
  expect(input).toEqual(original)
  for (const [name, route] of [
    ["before", trace.route],
    ["after", path],
  ] as const) {
    await expect(
      getRvboyShallowClearanceView(input, route, name),
    ).toMatchSvgSnapshot(import.meta.path, name)
  }
})
