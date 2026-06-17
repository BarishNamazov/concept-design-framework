import { SyncConcept } from "@engine";
import { getDb } from "@utils/database.ts";
import type { Db } from "mongodb";
import AssigningConcept from "./Assigning/AssigningConcept.ts";
import AuthenticatingConcept from "./Authenticating/AuthenticatingConcept.ts";
import BookmarkingConcept from "./Bookmarking/BookmarkingConcept.ts";
import CategorizingConcept from "./Categorizing/CategorizingConcept.ts";
import ConversingConcept from "./Conversing/ConversingConcept.ts";
import FlaggingConcept from "./Flagging/FlaggingConcept.ts";
import FormattingConcept from "./Formatting/FormattingConcept.ts";
import GradingConcept from "./Grading/GradingConcept.ts";
import LateBankingConcept from "./LateBanking/LateBankingConcept.ts";
import LinkingConcept from "./Linking/LinkingConcept.ts";
import LockingConcept from "./Locking/LockingConcept.ts";
import NotifyingConcept from "./Notifying/NotifyingConcept.ts";
import PinningConcept from "./Pinning/PinningConcept.ts";
import PostingConcept from "./Posting/PostingConcept.ts";
import ProfilingConcept from "./Profiling/ProfilingConcept.ts";
import ReactingConcept from "./Reacting/ReactingConcept.ts";
import RequestingConcept from "./Requesting/RequestingConcept.ts";
import ResolvingConcept from "./Resolving/ResolvingConcept.ts";
import RevisioningConcept from "./Revisioning/RevisioningConcept.ts";
import RolingConcept from "./Roling/RolingConcept.ts";
import RosteringConcept from "./Rostering/RosteringConcept.ts";
import SessioningConcept from "./Sessioning/SessioningConcept.ts";
import StudentNotingConcept from "./StudentNoting/StudentNotingConcept.ts";
import SubmittingConcept from "./Submitting/SubmittingConcept.ts";
import SubscribingConcept from "./Subscribing/SubscribingConcept.ts";
import TaggingConcept from "./Tagging/TaggingConcept.ts";
import TrackingConcept from "./Tracking/TrackingConcept.ts";
import TrashingConcept from "./Trashing/TrashingConcept.ts";

type ConceptConstructor = new (db: Db, namespace?: string) => object;

export const conceptClasses = {
  Assigning: AssigningConcept,
  Authenticating: AuthenticatingConcept,
  Bookmarking: BookmarkingConcept,
  Categorizing: CategorizingConcept,
  Conversing: ConversingConcept,
  Flagging: FlaggingConcept,
  Formatting: FormattingConcept,
  Grading: GradingConcept,
  LateBanking: LateBankingConcept,
  Linking: LinkingConcept,
  Locking: LockingConcept,
  Notifying: NotifyingConcept,
  Pinning: PinningConcept,
  Posting: PostingConcept,
  Profiling: ProfilingConcept,
  Reacting: ReactingConcept,
  Requesting: RequestingConcept,
  Resolving: ResolvingConcept,
  Revisioning: RevisioningConcept,
  Roling: RolingConcept,
  Rostering: RosteringConcept,
  Sessioning: SessioningConcept,
  StudentNoting: StudentNotingConcept,
  Submitting: SubmittingConcept,
  Subscribing: SubscribingConcept,
  Tagging: TaggingConcept,
  Tracking: TrackingConcept,
  Trashing: TrashingConcept,
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
export const Assigning = appConcepts.Assigning;
export const Authenticating = appConcepts.Authenticating;
export const Bookmarking = appConcepts.Bookmarking;
export const Categorizing = appConcepts.Categorizing;
export const Conversing = appConcepts.Conversing;
export const Flagging = appConcepts.Flagging;
export const Formatting = appConcepts.Formatting;
export const Grading = appConcepts.Grading;
export const LateBanking = appConcepts.LateBanking;
export const Linking = appConcepts.Linking;
export const Locking = appConcepts.Locking;
export const Notifying = appConcepts.Notifying;
export const Pinning = appConcepts.Pinning;
export const Posting = appConcepts.Posting;
export const Profiling = appConcepts.Profiling;
export const Reacting = appConcepts.Reacting;
export const Requesting = appConcepts.Requesting;
export const Resolving = appConcepts.Resolving;
export const Revisioning = appConcepts.Revisioning;
export const Roling = appConcepts.Roling;
export const Rostering = appConcepts.Rostering;
export const Sessioning = appConcepts.Sessioning;
export const StudentNoting = appConcepts.StudentNoting;
export const Submitting = appConcepts.Submitting;
export const Subscribing = appConcepts.Subscribing;
export const Tagging = appConcepts.Tagging;
export const Tracking = appConcepts.Tracking;
export const Trashing = appConcepts.Trashing;
