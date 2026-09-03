import { port } from "../config/env";
export function log(msg: string): void {
  console.log(`[:${port}]`, msg);
}
