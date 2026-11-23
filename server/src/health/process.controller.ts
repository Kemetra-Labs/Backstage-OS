import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/public.decorator";

@Controller("process")
export class ProcessController {
  // Public on purpose: liveness needs no session. It reveals nothing but that the process is up.
  // Process liveness only. Never reports "healthy": this says nothing about dependencies.
  @Public()
  @Get()
  get() {
    return { service: "kawalys-bff", process: "up", synthetic: true };
  }
}
