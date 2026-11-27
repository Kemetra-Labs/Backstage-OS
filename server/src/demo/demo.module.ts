import { Module } from "@nestjs/common";
import { EvidenceController } from "./evidence.controller";

/** The fixture demo route. createApp imports it only when no database is configured (audit L3). */
@Module({ controllers: [EvidenceController] })
export class DemoModule {}
