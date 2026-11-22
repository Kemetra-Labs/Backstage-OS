import { Module } from "@nestjs/common";
import { EvidenceController } from "./demo/evidence.controller";
import { ProcessController } from "./health/process.controller";

@Module({ controllers: [ProcessController, EvidenceController] })
export class AppModule {}
