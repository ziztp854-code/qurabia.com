export function calculateClockOffset(input: {
  clientSentAt: number;
  clientReceivedAt: number;
  serverTime: number;
}) {
  const roundTripTime = Math.max(0, input.clientReceivedAt - input.clientSentAt);
  return input.serverTime + roundTripTime / 2 - input.clientReceivedAt;
}

export function getServerNow(clockOffset: number, clientNow = Date.now()) {
  return clientNow + clockOffset;
}

export function getQuestionRemainingMs(
  questionEndsAt: number,
  clockOffset: number,
  clientNow = Date.now(),
) {
  return Math.max(0, questionEndsAt - getServerNow(clockOffset, clientNow));
}
