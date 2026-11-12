import { expect, test } from "bun:test"
import {
  getLocalObstacleDistance,
  getLocalObstacleGeometry,
  getLocalPadDrillGeometry,
} from "../lib/obstacleDistanceGeometry"

test("physical circular pads are opt-in for drill repair, preserving ordinary geometry", (): void => {
  const obstacle = {
    type: "rect" as const,
    shape: "circle" as const,
    center: { x: 0, y: 0 },
    width: 0.4,
    height: 0.4,
    layers: ["top"],
    connectedTo: ["pcb_smtpad_0"],
  }
  const geometry = getLocalPadDrillGeometry(obstacle)
  const point = { x: 0.18, y: 0.18 }
  expect(
    getLocalObstacleDistance(point, point, getLocalObstacleGeometry(obstacle)),
  ).toBe(0)
  expect(getLocalObstacleDistance(point, point, geometry)).toBeCloseTo(
    Math.hypot(0.18, 0.18) - 0.2,
    12,
  )
  expect(
    getLocalObstacleDistance({ x: 0, y: 0 }, { x: 0, y: 0 }, geometry),
  ).toBe(0)
})
