// Class decorator (TypeScript experimentalDecorators).
const audited: string[] = [];

export function auditTrail(target: Function): void {
  audited.push(target.name);
}

export function auditedNames(): string[] {
  return audited.slice();
}
