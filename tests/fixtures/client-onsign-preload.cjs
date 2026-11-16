// Test-only fixed provider transport: never connects to real OnSign.
const original = globalThis.fetch;
const accounts = {
  "legacy-secret": "sephora-org", "new-secret": "other-org",
  "rotated-secret": "other-org", "sephora-custom-secret": "custom-org", "empty-secret": "empty-org", "loop-secret": "loop-org"
};
globalThis.fetch = async (url, options) => {
  if (String(url) !== "https://api.onsign.tv/graphql") return original(url, options);
  const token = options.headers.Authorization.slice(6);
  if (token === "upstream-error") return Response.json({ errors: [{ message: "Sensitive provider detail: " + token }] });
  const organization = accounts[token];
  if (!organization) return Response.json({ error: "Sensitive rejected token: " + token }, { status: 401 });
  const { query, variables } = JSON.parse(options.body);
  if (!query.startsWith("query ")) throw new Error("Unexpected provider mutation");
  if (query.includes("query Organizations")) {
    if (token === "empty-secret") return Response.json({ data: { organizations: { nodes: [], pageInfo: { hasNextPage: false } } } });
    if (token === "loop-secret") return Response.json({ data: { organizations: { nodes: [{id:organization,name:"Loop"}], pageInfo: { hasNextPage: true, endCursor: "same" } } } });
    if (token === "new-secret") return Response.json({ data: { organizations: {
      nodes: variables.after ? [{ id: "other-org", name: "Other Client" }, { id: "second-org", name: "Another Client" }] : [{ id: "second-org", name: "Another Client" }],
      pageInfo: { hasNextPage: !variables.after, endCursor: variables.after ? "last" : "next" }
    } } });
    return Response.json({ data: { organizations: { nodes: [{ id: organization, name: "Sephora" }], pageInfo: { hasNextPage: false } } } });
  }
  if (variables.organizationId !== organization) return Response.json({ data: { organizations: { nodes: [] } } });
  const player = { id: "player-" + organization, name: token === "rotated-secret" ? "Rotated player" : organization + " player" };
  return Response.json({ data: { organizations: { nodes: [{ id: organization,
    ...(query.includes("query Players") ? { players: { nodes: [player], pageInfo: { hasNextPage: false } } } : { player })
  }] } } });
};
