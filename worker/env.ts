export interface Env {
  DB: D1Database
  /** Static assets (the exported Expo web app). */
  ASSETS: Fetcher
  /** Service binding to the accounts Worker (auth.baderech.app). Absent in plain local dev. */
  AUTH?: Fetcher
  /** Accounts origin, used when there is no service binding. */
  AUTH_URL: string
  /** This site's origin, for the MCP resource URL and links. */
  PUBLIC_URL: string
  /** Local dev only (`.dev.vars`): "1" accepts `Bearer dev-<name>` as user `dev-<name>`
   * and allows the Expo dev server's origin. Never set in production. */
  DEV_AUTH?: string
}
