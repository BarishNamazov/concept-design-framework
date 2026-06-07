import { SyncConcept } from "@engine";
import { getDb } from "@utils/database.ts";
import type { Db } from "mongodb";
import AuthenticatingConcept from "./Authenticating/AuthenticatingConcept.ts";
import ProfilingConcept from "./Profiling/ProfilingConcept.ts";
import RequestingConcept from "./Requesting/RequestingConcept.ts";
import RolingConcept from "./Roling/RolingConcept.ts";
import SessioningConcept from "./Sessioning/SessioningConcept.ts";

type ConceptConstructor = new (db: Db, namespace?: string) => object;

export const conceptClasses = {
  Authenticating: AuthenticatingConcept,
  Profiling: ProfilingConcept,
  Requesting: RequestingConcept,
  Roling: RolingConcept,
  Sessioning: SessioningConcept,
} as const satisfies Record<string, ConceptConstructor>;

export type ConceptName = keyof typeof conceptClasses;
export type ConceptNamespaces = Partial<Record<ConceptName, string>>;

type ConceptInstances = {
  [Name in ConceptName]: InstanceType<(typeof conceptClasses)[Name]>;
};

export interface CreateConceptsOptions {
  engine?: SyncConcept;
  namespaces?: ConceptNamespaces;
}

export function createConcepts(
  db: Db,
  options: CreateConceptsOptions = {},
): { Engine: SyncConcept } & ConceptInstances {
  const Engine = options.engine ?? new SyncConcept();
  const namespaces = options.namespaces ?? {};
  const concepts = Object.fromEntries(
    Object.entries(conceptClasses).map(([name, Concept]) => [
      name,
      Engine.instrumentConcept(
        new Concept(db, namespaces[name as ConceptName]),
      ),
    ]),
  ) as ConceptInstances;

  return { Engine, ...concepts };
}

export type AppConcepts = ReturnType<typeof createConcepts>;

export const [db, client] = await getDb();
const appConcepts = createConcepts(db);

export const Engine = appConcepts.Engine;
export const Authenticating = appConcepts.Authenticating;
export const Profiling = appConcepts.Profiling;
export const Requesting = appConcepts.Requesting;
export const Roling = appConcepts.Roling;
export const Sessioning = appConcepts.Sessioning;
