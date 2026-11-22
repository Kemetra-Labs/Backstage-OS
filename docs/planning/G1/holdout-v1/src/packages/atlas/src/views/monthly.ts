import { normalize } from '../text';

// Reached only through the dynamic import in App.tsx: no observed or inferred imports edge may point here.
export function render(): string {
  return normalize(' Monthly ');
}
