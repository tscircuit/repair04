import { expect, test } from "bun:test"
import {
  getLocalObstacleDistance,
  getLocalObstacleGeometry,
} from "../lib/obstacleDistanceGeometry"

test("circular pad clearance uses the circle rather than the corners of its SRJ envelope", (): void => {
  const geometry = getLocalObstacleGeometry({
    type: "rect",
    shape: "circle",
    center: { x: 0, y: 0 },
    width: 0.4,
    height: 0.4,
    layers: ["top"],
    connectedTo: ["pcb_smtpad_0"],
  })
  const point = { x: 0.18, y: 0.18 }
  expect(getLocalObstacleDistance(point, point, geometry)).toBeCloseTo(
    Math.hypot(0.18, 0.18) - 0.2,
    12,
  )
  expect(
    getLocalObstacleDistance({ x: 0, y: 0 }, { x: 0, y: 0 }, geometry),
  ).toBe(0)
})
