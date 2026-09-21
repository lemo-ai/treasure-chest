/**
 * electron-builder afterPack hook.
 * When CI has no Developer ID (CSC_LINK), Electron ships with a linker-only
 * ad-hoc signature (Sealed Resources=none). Gatekeeper then reports the app as
 * "damaged". Deep ad-hoc re-sign the .app so resources are sealed.
 * Real CSC signing (when present) replaces this in the later sign step.
 */
const { execFileSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const hasCert =
    Boolean(process.env.CSC_LINK) && process.env.CSC_IDENTITY_AUTO_DISCOVERY !== 'false'
  if (hasCert) {
    console.log('[afterPack] CSC present — skip ad-hoc sign (Developer ID will sign)')
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = join(context.appOutDir, `${appName}.app`)
  if (!existsSync(appPath)) {
    console.warn(`[afterPack] app not found: ${appPath}`)
    return
  }

  console.log(`[afterPack] ad-hoc codesign (unsigned build): ${appPath}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  })
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], {
    stdio: 'inherit',
  })
  console.log('[afterPack] ad-hoc codesign ok')
}
