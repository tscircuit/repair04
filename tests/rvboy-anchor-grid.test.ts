import { expect, test } from "bun:test"
import "bun-match-svg"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { PairedClearancePathSolver } from "../lib/PairedClearancePathSolver"
import {
  createNegotiatedClearanceSearchKernel,
  type NegotiatedClearanceSearchInput,
} from "../lib/negotiatedClearanceSearchKernel"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import { getRvboyAnchorGridView } from "./fixtures/rvboy-anchor-grid/getRvboyAnchorGridView"

test("RVboy legal anchors can reach the grid beyond the nearest blocked cells", async (): Promise<void> => {
  const task = JSON.parse(
    gunzipSync(
      new Uint8Array(
        readFileSync(
          new URL(
            "./fixtures/rvboy-anchor-grid/input.json.gz",
            import.meta.url,
          ),
        ),
      ),
    ).toString(),
  ) as NegotiatedClearanceSearchInput
  const original = JSON.stringify(task)
  const solver = new PairedClearancePathSolver({ task })
  solver.solve()
  expect(solver.solved).toBeTrue()
  expect(solver.failed).toBeFalse()
  expect(solver.stats.completionReason).toBe("found")
  const path = solver.getOutput()!
  expect(path[0]).toEqual(task.pathInput.start)
  expect(path.at(-1)).toEqual(task.pathInput.end)
  const route = task.pathInput.routes[task.pathInput.routeIndex]!
  const kernel = createNegotiatedClearanceSearchKernel(task)
  expect(
    path
      .slice(1)
      .flatMap((b, i) => kernel.query(path[i]!, b))
      .filter(({ copper }) => copper.immutable),
  ).toHaveLength(0)
  expect(
    getFixedObstacleViolations({
      srj: task.pathInput.srj,
      routes: [
        {
          ...route,
          route: path,
          vias: path
            .slice(1)
            .flatMap((b, i) =>
              b.z !== path[i]!.z ? [{ x: b.x, y: b.y }] : [],
            ),
        },
      ],
      traceClearance: task.pathInput.traceClearance,
    }),
  ).toHaveLength(0)
  expect(JSON.stringify(task)).toBe(original)
  for (const state of ["before", "after"] as const) {
    await expect(
      getRvboyAnchorGridView(task, state === "before" ? [] : path, state),
    ).toMatchSvgSnapshot(import.meta.path, state)
  }
})
