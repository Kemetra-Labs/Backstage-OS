// FIXTURE CASE: dynamic import with a non-literal specifier; target cannot be resolved statically.
export async function loadPlugin(pluginPath: string) {
  const mod = await import(pluginPath);
  return mod.default;
}
