import { expect, test } from "bun:test"
import { segmentToBoundsMinDistance } from "@tscircuit/math-utils"
import {
  getLocalObstacleDistance,
  type ObstacleDistanceGeometry,
} from "../lib/obstacleDistanceGeometry"

test("point rectangle distances exactly match the segment reference at edges and translated scales", (): void => {
  let seed = 0x41849540
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 2 ** 32
  }
  for (const translation of [-(2 ** 26), -1, -0, 0, 1, 2 ** 26]) {
    for (const width of [0, 1e-8, 0.1, 1, 128]) {
      for (const height of [0, 1e-8, 0.1, 1, 128]) {
        const geometry: ObstacleDistanceGeometry = {
          type: "rect",
          bounds: {
            minX: translation - width / 2,
            maxX: translation + width / 2,
            minY: translation - height / 2,
            maxY: translation + height / 2,
          },
        }
        for (const x of [
          geometry.bounds.minX,
          translation,
          geometry.bounds.maxX,
        ]) {
          for (const y of [
            geometry.bounds.minY,
            translation,
            geometry.bounds.maxY,
          ]) {
            const point = { x, y }
            expect(getLocalObstacleDistance(point, point, geometry)).toBe(
              segmentToBoundsMinDistance(point, point, geometry.bounds),
            )
          }
        }
        for (let sample = 0; sample < 64; sample++) {
          const point = {
            x: translation + (random() - 0.5) * (width + 2),
            y: translation + (random() - 0.5) * (height + 2),
          }
          expect(getLocalObstacleDistance(point, { ...point }, geometry)).toBe(
            segmentToBoundsMinDistance(point, point, geometry.bounds),
          )
        }
      }
    }
  }
  for (const scale of [1e-200, 1e-150, 1, 1e150, 1e200]) {
    for (const translation of [-8 * scale, 0, 8 * scale]) {
      const geometry: ObstacleDistanceGeometry = {
        type: "rect",
        bounds: {
          minX: translation - 2 * scale,
          maxX: translation + 2 * scale,
          minY: -3 * scale,
          maxY: 3 * scale,
        },
      }
      for (const x of [
        geometry.bounds.minX - 5 * scale,
        geometry.bounds.minX,
        translation,
        geometry.bounds.maxX,
        geometry.bounds.maxX + 5 * scale,
      ]) {
        for (const y of [-8 * scale, -3 * scale, 0, 3 * scale, 8 * scale]) {
          const point = { x, y }
          expect(getLocalObstacleDistance(point, { ...point }, geometry)).toBe(
            segmentToBoundsMinDistance(point, point, geometry.bounds),
          )
        }
      }
    }
  }
})
