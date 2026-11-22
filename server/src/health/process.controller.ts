import { Controller, Get } from "@nestjs/common";

@Controller("process")
export class ProcessController {
  // Process liveness only. Never reports "healthy": this says nothing about dependencies.
  @Get()
  get() {
    return { service: "kawalys-bff", process: "up", synthetic: true };
  }
}
