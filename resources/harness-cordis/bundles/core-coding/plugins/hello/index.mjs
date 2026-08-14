export async function greet(args) {
  const name = String(args?.name || 'world').trim()
  return JSON.stringify({ message: `Hello, ${name}!`, from: 'hello-plugin' })
}

export async function onPreStep(ctx) {
  if (ctx.stepIndex !== 0) return {}
  return { injectSystem: 'Hello plugin active — prefer concise replies.' }
}
