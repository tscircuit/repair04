import { expect, test } from "bun:test"
import { ClearancePathConnectivity } from "../lib/ClearancePathConnectivity"
import { createPairedClearanceTask } from "./fixtures/pairedClearanceFixture"

test("cached board connectivity keeps route-specific unions and compression local", (): void => {
  const task = createPairedClearanceTask()
  const srj = task.pathInput.srj
  srj.connections = [
    {
      name: "left",
      rootConnectionName: "left-root",
      pointsToConnect: [{ x: 0, y: 0, layer: "top", pcb_port_id: "left-pin" }],
    },
    {
      name: "right",
      rootConnectionName: "right-root",
      pointsToConnect: [{ x: 1, y: 0, layer: "top", pcb_port_id: "right-pin" }],
    },
  ]
  srj.obstacles[0]!.connectedTo = ["pad", "left-pin"]
  const connections = structuredClone(srj.connections)
  const obstacles = structuredClone(srj.obstacles)
  let connectionReads = 0
  let obstacleReads = 0
  const context = new ClearancePathConnectivity({
    get connections() {
      connectionReads++
      return srj.connections
    },
    get obstacles() {
      obstacleReads++
      return srj.obstacles
    },
  })
  expect(connectionReads).toBe(0)
  expect(obstacleReads).toBe(0)
  const route = task.pathInput.routes[0]!
  const joined = context.createNetResolver([
    { ...route, connectionName: "left", rootConnectionName: "right" },
  ])
  expect(joined("pad")).toBe(joined("right-pin"))
  const separate = context.createNetResolver([
    { ...route, connectionName: "left", rootConnectionName: "left-root" },
  ])
  expect(separate("pad")).toBe(separate("left-root"))
  expect(separate("pad")).not.toBe(separate("right-pin"))
  expect(joined("right-root")).toBe(joined("left-pin"))
  const isolated = context.createNetResolver([
    { ...route, connectionName: "new-route", rootConnectionName: "right" },
  ])
  expect(isolated("new-route")).toBe(isolated("right-pin"))
  expect(separate("new-route")).toBe("new-route")
  expect(joined("new-route")).toBe("new-route")
  expect(connectionReads).toBe(1)
  expect(obstacleReads).toBe(1)
  expect(srj.connections).toEqual(connections)
  expect(srj.obstacles).toEqual(obstacles)
})
