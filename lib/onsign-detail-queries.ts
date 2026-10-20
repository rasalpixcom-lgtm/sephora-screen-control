// Fixed read-only selections from OnSign's public GraphQL reference. Never accept
// a query or a field name from the browser. Lists are paginated independently.
export const extendedPlayerFields = `
  legacyId activeAlertCount lastSeenAgo lastSyncAgo lastUpdate lastUpdateAgo
  utcOffset workingHoursStatus estimatedLocalTime tags attrs associationDate
  isUpdateLocked updateRequested updateReady batteryLevel serialNumber webviewVersion spmVersion
  workingHours { weekDays startTime endTime }
  workingExceptions { date ranges { startTime endTime } }
  pinnedNote { text createdAt authorName }
  subscription { planName interval note renewsOn endsOn }
  location { source latitude longitude }
  network { name mac status inet ssid rssi }
`;
const restrictions = `restrictions { calendar { weekDays startTime endTime startDate endDate isEndStrict } geographic { id } tag { tags action } }`;
const playable = `__typename id name tags attrs isPaused ${restrictions}
  ... on Content { kind lastModified size parentId ancestorIds downloadURL width height }
  ... on Campaign { category lastModified ancestorIds }
  ... on Playlist { kind category lastModified ancestorIds defaultDuration defaultTransition defaultAspectRatio defaultVolume defaultVolumeOthers playbackMode playbackCycle playbackDuration playbackOrder isLocked }
`;
export const relatedSelections = {
  alerts: `activeAlerts(first: 20, after: $after) { nodes { id name lastNotification } totalCount pageInfo { hasNextPage endCursor } }`,
  captures: `screenCaptures(first: 20, after: $after) { nodes { id capturedAt warning downloadURL } totalCount pageInfo { hasNextPage endCursor } }`,
  groups: `playerGroups(first: 20, after: $after) { nodes { id name tags } totalCount pageInfo { hasNextPage endCursor } }`,
};
export const loopItems = `items(first: 20, after: $after) { edges { id position duration isPaused transition volume volumeOthers aspectRatio frequency ${restrictions} node { ${playable} } } totalCount pageInfo { hasNextPage endCursor } }`;
// playLink is deliberately shown as text, never invoked by this read-only view.
export const loopTriggers = `triggers(first: 20, after: $after) { nodes { id name kind isPaused playLink actions { kind duration content { ${playable} } } } totalCount pageInfo { hasNextPage endCursor } }`;
