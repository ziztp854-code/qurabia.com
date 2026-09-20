/**
 * The question start timestamp is scheduled slightly into the future so every
 * client receives the broadcast before the on-screen timer begins.
 */
export const QUESTION_START_LEAD_MS = 3_000;

/**
 * Answer acceptance is evaluated against the server clock, so the visible
 * countdown must finish before any answer can be persisted.
 */
export const ANSWER_ACCEPT_GRACE_MS = 0;
