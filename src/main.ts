/**
 * Entry point for an application built with concepts + synchronizations.
 * Requires the Requesting concept as a bootstrap concept.
 */
import * as concepts from "@concepts";

const { Engine } = concepts;

import { startRequestingServer } from "@concepts/Requesting/RequestingConcept.ts";
import { Logging } from "@engine";
import syncs from "@syncs";

/**
 * Available logging levels:
 *   Logging.OFF
 *   Logging.TRACE - display a trace of the actions.
 *   Logging.VERBOSE - display full record of synchronization.
 */
Engine.logging = Logging.TRACE;

// Register synchronizations
Engine.register(syncs);

// Start a server to provide the Requesting concept with external/system actions.
startRequestingServer(concepts);
