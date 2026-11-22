// View lookup: the module path is built at runtime.
export async function resolveView(kind: string): Promise<unknown> {
  return import(`./${kind}`);
}
