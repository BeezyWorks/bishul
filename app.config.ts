import type { ConfigContext, ExpoConfig } from 'expo/config'

import pkg from './package.json'

/** app.json holds the static config; the version comes from package.json, which semantic-release bumps. */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Tavshil',
  slug: config.slug ?? 'tavshil',
  version: pkg.version,
})
