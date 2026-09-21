/**
 * electron-builder afterSign hook.
 * Notarizes only when Apple credentials are present; otherwise no-ops (unsigned CI).
 */
exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD || !process.env.APPLE_TEAM_ID) {
    console.log('[afterSign] skip notarize: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not set')
    return
  }
  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false' || !process.env.CSC_LINK) {
    console.log('[afterSign] skip notarize: no signing identity (CSC_LINK)')
    return
  }

  const { notarize } = require('@electron/notarize')
  const appName = context.packager.appInfo.productFilename
  const appPath = `${appOutDir}/${appName}.app`
  console.log(`[afterSign] notarizing ${appPath}`)
  await notarize({
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  })
  console.log('[afterSign] notarize done')
}
