// The server supplies the alphabetical fallback. Preferences contain stable IDs,
// so renaming a client never loses its saved position.
export function clientCardIds(clients: readonly { id: string }[], preference: readonly string[] = []): string[] {
  const remaining = new Set(clients.map(client => client.id));
  const ordered: string[] = [];
  for (const id of preference) if (remaining.delete(id)) ordered.push(id);
  return ordered.concat([...remaining]);
}

export function moveClientCard(order: readonly string[], clientId: string, position: number): string[] {
  const source = order.indexOf(clientId);
  if (source < 0 || !Number.isInteger(position)) return [...order];
  const destination = Math.max(0, Math.min(order.length - 1, position));
  if (source === destination) return [...order];
  const next = [...order];
  next.splice(source, 1);
  next.splice(destination, 0, clientId);
  return next;
}

export function sameClientCardOrder(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
