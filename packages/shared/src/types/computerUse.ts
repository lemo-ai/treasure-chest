/** Computer Use (browser / light OS open) — local-first, default off. */

export interface ComputerUseSettings {
  /** Master switch — default false */
  enabled: boolean
  /**
   * Allowed hostnames (exact or suffix like `.example.com`).
   * Empty = any http(s) host still requires tool approval.
   */
  allowHosts: string[]
}

export const DEFAULT_COMPUTER_USE_SETTINGS: ComputerUseSettings = {
  enabled: false,
  allowHosts: [],
}
