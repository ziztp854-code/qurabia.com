// Never include SDK errors, URLs, or token values in build logs.
export function signalFailureCategory(error) {
  switch (error instanceof Error ? error.message : '') {
    case 'Signal join rejected':
      return 'signal_rejected';
    case 'Signal join timed out':
      return 'signal_timeout';
    case 'Revoked token did not receive an authentication rejection':
      return 'rejected_without_http_401';
    case 'Revoked token unexpectedly rejoined':
      return 'unexpected_join';
    default:
      return 'other';
  }
}
