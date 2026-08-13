import { buildResolve } from '$electron/process/resources.js'

export const logoPath = buildResolve('logo.svg')
export const trayPath = logoPath

export function getLogoPath() {
  return logoPath
}
