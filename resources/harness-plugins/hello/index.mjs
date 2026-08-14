export async function greet(args, ctx) {
  const name = String(args?.name || 'world').trim()
  const sandbox = ctx?.sandbox?.label ?? 'local'
  return JSON.stringify({ message: `Hello, ${name}!`, from: 'hello-plugin', sandbox })
}

/** Example pre-step hook: inject a one-line reminder on the first step of each turn. */
export async function onPreStep(ctx) {
  if (ctx.stepIndex !== 0) return {}
  return {
    injectSystem: 'Hello plugin active — prefer concise replies.',
  }
}
