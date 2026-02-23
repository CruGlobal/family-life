import Rollbar from 'rollbar'

const environments = ['staging', 'production']

const rollbar = new Rollbar({
  accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
  enabled: environments.includes(process.env.ENVIRONMENT ?? ''),
  captureUncaught: true,
  captureUnhandledRejections: true,
  payload: {
    environment: process.env.ENVIRONMENT,
    client: {
      javascript: {
        source_map_enabled: true,
        code_version: process.env.SOURCEMAP_VERSION,
        guess_uncaught_frames: true
      }
    }
  }
})

export default {
  error: (...args: Parameters<typeof rollbar.error>): Promise<unknown> =>
    new Promise((resolve) => rollbar.error(...args, resolve)),

  warning: (...args: Parameters<typeof rollbar.warning>): Promise<unknown> =>
    new Promise((resolve) => rollbar.warning(...args, resolve)),

  info: (...args: Parameters<typeof rollbar.info>): Promise<unknown> =>
    new Promise((resolve) => rollbar.info(...args, resolve))
}
