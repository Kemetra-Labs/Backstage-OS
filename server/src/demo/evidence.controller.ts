import { Controller, Get, Headers, NotFoundException, Param } from "@nestjs/common";
import { EVIDENCE } from "./evidence.fixture";

const PERSONAS = ["technical", "owner", "nontechnical"] as const;
type Persona = (typeof PERSONAS)[number];

function personaFrom(header: string | string[] | undefined): Persona {
  return typeof header === "string" && (PERSONAS as readonly string[]).includes(header)
    ? (header as Persona)
    : "nontechnical";
}

@Controller("demo/evidence")
export class EvidenceController {
  // The persona header is a display persona, not authorization: any caller can set it.
  // A record the persona may not see throws the same NotFoundException as an absent one.
  @Get(":id")
  get(@Param("id") id: string, @Headers("x-kawalys-demo-persona") personaHeader?: string | string[]) {
    const persona = personaFrom(personaHeader);
    const item = EVIDENCE.find((e) => e.id === id);
    if (!item || (item.visibility === "technical" && persona !== "technical")) {
      throw new NotFoundException();
    }
    return { id: item.id, title: item.title, synthetic: true };
  }
}
