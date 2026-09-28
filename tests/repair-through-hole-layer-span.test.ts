import { expect, test } from "bun:test"
import { findClearancePath } from "../lib/findClearancePath"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import { getNewViaPadViolations } from "../lib/getNewViaPadViolations"
import { makeBudgetInput, makeBudgetRoute } from "./fixtures/workBudgetFixture"

test("default drilled vias reserve copper beyond their electrical transition", (): void => {
  const route = makeBudgetRoute("signal", [
    [-1, 0],
    [0, 0],
    [0, 0],
    [1, 0],
  ])
  route.route[2]!.z = 1
  route.route[3]!.z = 1
  route.vias = [{ x: 0, y: 0 }]
  const { srj, bounds } = makeBudgetInput([route])
  srj.layerCount = 4
  srj.obstacles.push({
    type: "rect",
    center: { x: 0, y: 0 },
    width: 12,
    height: 12,
    layers: ["inner2"],
    connectedTo: ["other"],
  })
  const search = {
    srj,
    bounds,
    routes: [route],
    routeIndex: 0,
    start: route.route[0]!,
    end: route.route.at(-1)!,
    traceThickness: 0.1,
    traceClearance: 0.1,
    viaClearance: 0.1,
    maxNodes: 1000,
    existingPath: route.route,
  }
  const guard = {
    srj,
    routes: [route],
    previousRoutes: [route],
    includeExistingVias: [{ routeIndex: 0, viaIndex: 0 }],
  }
  expect(getFixedObstacleViolations({ srj, routes: [route] })).toHaveLength(1)
  expect(getNewViaPadViolations(guard)).toHaveLength(1)
  expect(findClearancePath(search)).toBeNull()
  Object.assign(srj, { allowBlindAndBuriedVias: true })
  expect(getFixedObstacleViolations({ srj, routes: [route] })).toHaveLength(0)
  expect(getNewViaPadViolations(guard)).toHaveLength(0)
  expect(findClearancePath(search)).not.toBeNull()
})
