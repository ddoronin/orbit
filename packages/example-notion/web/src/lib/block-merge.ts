interface TextBlock {
  text: string;
}

export function mergeIncomingBlock<T extends TextBlock>(
  incoming: T,
  local: T | undefined,
  pending: string | undefined,
  inFlight: string | undefined,
): T {
  const hasNewerLocalText =
    (pending != null && pending !== incoming.text) ||
    (inFlight != null && inFlight !== incoming.text);

  if (!hasNewerLocalText) {
    return incoming;
  }

  return {
    ...incoming,
    text: pending ?? inFlight ?? local?.text ?? incoming.text,
  };
}
