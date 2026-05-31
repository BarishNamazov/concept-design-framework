import { afterAll } from "bun:test";
import { teardownTestApp } from "./app_testing.ts";

/**
 * A top-level preload hook runs exactly once for the entire `bun test` run.
 *
 * The synchronization integration suites share a single in-memory MongoDB and
 * `@concepts` barrel client for the whole process (see {@link setupApp}), so no
 * individual suite may close them in its own `afterAll`. This releases them a
 * single time after the last suite, leaving no orphaned `mongod` child behind.
 */
afterAll(teardownTestApp);
