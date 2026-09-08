import { expect, test } from "bun:test"
import {
  createNewViaPadViolationEvaluator,
  getNewViaPadViolations,
} from "../lib/getNewViaPadViolations"
import { sameNetViaPocket } from "./fixtures/sameNetViaPocket"

test("own-pad copper exclusion preserves explicit margins and cached foreign-net ownership", (): void => {
  const { srj, route } = sameNetViaPocket()
  const before = {
    ...route,
    route: [route.route[0]!, { ...route.route.at(-1)!, z: 0 }],
    vias: [],
  }
  const input = { srj, previousRoutes: [before], routes: [route] }
  expect(getNewViaPadViolations(input)).toEqual([])
  const evaluate = createNewViaPadViolationEvaluator({ srj })
  expect(evaluate(input)).toEqual([])
  const foreign = {
    ...route,
    connectionName: "unrelated",
    rootConnectionName: "unrelated",
  }
  expect(
    evaluate({ previousRoutes: [before], routes: [foreign] }),
  ).toHaveLength(1)
  expect(evaluate(input)).toEqual([])
  for (const field of [
    "minViaEdgeToPadEdgeClearance",
    "defaultObstacleMargin",
  ] as const) {
    srj[field] = 0.05
    expect(getNewViaPadViolations(input)).toHaveLength(1)
    delete srj[field]
  }
  for (const i of [1, 2]) route.route[i]!.x = 0.14
  expect(getNewViaPadViolations(input)[0]!.severity).toBeCloseTo(0.01, 10)
  for (const i of [1, 2]) route.route[i]!.x = 0.18
  expect(getNewViaPadViolations(input)[0]!.obstacleIndex).toBe(1)
  expect(getNewViaPadViolations(input)[0]!.severity).toBeCloseTo(0.01, 10)
})
