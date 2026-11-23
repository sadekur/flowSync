import { StrictMode, useEffect } from "react";
import { it, expect } from "vitest";
import { render } from "@testing-library/react";
let runs = 0;
function C() { useEffect(() => { runs++; }, []); return null; }
it("counts", () => { render(<StrictMode><C /></StrictMode>); console.log("EFFECT RUNS", runs, process.env.NODE_ENV); expect(true).toBe(true); });
