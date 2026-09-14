import type { SimpleRouteJson } from "high-density-repair03/lib"

export type ViaLayerPolicy = { allowBlindAndBuriedVias?: boolean }

/** Through-via copper occupies the entire board, regardless of route endpoints. */
export const getViaCopperZSpan = ({
  fromZ,
  toZ,
  layerCount,
  allowBlindAndBuriedVias,
}: Pick<SimpleRouteJson, "layerCount"> &
  ViaLayerPolicy & {
    fromZ: number
    toZ: number
  }): { minZ: number; maxZ: number } => {
  return allowBlindAndBuriedVias
    ? { minZ: Math.min(fromZ, toZ), maxZ: Math.max(fromZ, toZ) }
    : { minZ: 0, maxZ: layerCount - 1 }
}
