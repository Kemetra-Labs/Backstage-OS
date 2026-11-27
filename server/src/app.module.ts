import { Module } from "@nestjs/common";
import { ProcessController } from "./health/process.controller";

@Module({ controllers: [ProcessController] })
export class AppModule {}
