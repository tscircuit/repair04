import { expect, test } from "bun:test"
import { getFixedObstacleViolations } from "../lib/getFixedObstacleViolations"
import { regionSafetyFixture } from "./fixtures/regionSafetyFixture"

test("respects transitive SRJ net aliases and ignores copper on other layers", () => {
  const { srj, routes } = regionSafetyFixture()
  srj.connections.push({
    name: "pad-branch",
    rootConnectionName: "signal-net",
    pointsToConnect: [{ x: 0, y: 0, layer: "top", pointId: "pad-terminal" }],
  })
  srj.obstacles = [
    {
      type: "rect",
      center: { x: 0, y: 0 },
      width: 1,
      height: 1,
      layers: ["top"],
      connectedTo: ["pad-terminal"],
    },
    {
      type: "rect",
      center: { x: 0, y: 0 },
      width: 1,
      height: 1,
      layers: ["bottom"],
      connectedTo: [],
    },
  ]
  expect(getFixedObstacleViolations({ srj, routes })).toHaveLength(0)
})
