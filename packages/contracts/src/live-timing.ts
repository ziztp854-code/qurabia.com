/**
 * The question start timestamp is scheduled slightly into the future so every
 * client receives the broadcast before the on-screen timer begins.
 */
export const QUESTION_START_LEAD_MS = 350;

/**
 * Answers landing within this margin before questionStartedAt are still valid.
 * Covers the broadcast lead window plus normal clock-sync error.
 */
export const ANSWER_ACCEPT_GRACE_MS = 1_000;
