import { expect, test } from "bun:test"
import "bun-match-svg"
import { readFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { FindClearancePathSolver } from "../lib/FindClearancePathSolver"
import type { ClearancePathInput } from "../lib/findClearancePath"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import { getNewViaPadViolations } from "../lib/getNewViaPadViolations"
import { getRvboyAntipadView } from "./fixtures/rvboy-pour-antipad/getRvboyAntipadView"

test("RVboy's exact through-via repair can pass its ground plane", async (): Promise<void> => {
  const input: ClearancePathInput = JSON.parse(
    gunzipSync(
      new Uint8Array(
        readFileSync(
          new URL(
            "./fixtures/rvboy-pour-antipad/input.json.gz",
            import.meta.url,
          ),
        ),
      ),
    ).toString(),
  )
  const solver = new FindClearancePathSolver(input)
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.solved).toBe(true)
  const path = solver.getOutput()
  expect(path).not.toBeNull()
  expect(solver.stats.completionReason).toBe("found")
  expect(path![0]).toEqual(input.start)
  expect(path!.at(-1)).toEqual(input.end)
  const route = {
    ...input.routes[input.routeIndex]!,
    route: path!,
    vias: path!
      .slice(1)
      .flatMap((point, i) =>
        point.z !== path![i]!.z ? [{ x: point.x, y: point.y }] : [],
      ),
  }
  expect(
    getFixedObstacleViolations({ srj: input.srj, routes: [route] }),
  ).toHaveLength(0)
  expect(
    getNewViaPadViolations({
      srj: input.srj,
      previousRoutes: [{ ...route, route: [], vias: [] }],
      routes: [route],
    }),
  ).toHaveLength(0)
  await expect(
    getRvboyAntipadView(input, path, solver.stats),
  ).toMatchSvgSnapshot(import.meta.path)
})
