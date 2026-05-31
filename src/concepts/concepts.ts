import { SyncConcept } from "@engine";
import { getDb } from "@utils/database.ts";
import type { Db } from "mongodb";
import AuthenticatingConcept from "./Authenticating/AuthenticatingConcept.ts";
import ConversingConcept from "./Conversing/ConversingConcept.ts";
import FormattingConcept from "./Formatting/FormattingConcept.ts";
import LinkingConcept from "./Linking/LinkingConcept.ts";
import PostingConcept from "./Posting/PostingConcept.ts";
import ProfilingConcept from "./Profiling/ProfilingConcept.ts";
import ReactingConcept from "./Reacting/ReactingConcept.ts";
import RequestingConcept from "./Requesting/RequestingConcept.ts";
import SessioningConcept from "./Sessioning/SessioningConcept.ts";
import TaggingConcept from "./Tagging/TaggingConcept.ts";
import TrackingConcept from "./Tracking/TrackingConcept.ts";

type ConceptConstructor = new (db: Db, namespace?: string) => object;

export const conceptClasses = {
  Authenticating: AuthenticatingConcept,
  Conversing: ConversingConcept,
  Formatting: FormattingConcept,
  Linking: LinkingConcept,
  Posting: PostingConcept,
  Profiling: ProfilingConcept,
  Reacting: ReactingConcept,
  Requesting: RequestingConcept,
  Sessioning: SessioningConcept,
  Tagging: TaggingConcept,
  Tracking: TrackingConcept,
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
export const Conversing = appConcepts.Conversing;
export const Formatting = appConcepts.Formatting;
export const Linking = appConcepts.Linking;
export const Posting = appConcepts.Posting;
export const Profiling = appConcepts.Profiling;
export const Reacting = appConcepts.Reacting;
export const Requesting = appConcepts.Requesting;
export const Sessioning = appConcepts.Sessioning;
export const Tagging = appConcepts.Tagging;
export const Tracking = appConcepts.Tracking;
