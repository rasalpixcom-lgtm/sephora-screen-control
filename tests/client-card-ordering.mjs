import assert from "node:assert/strict";
import { clientCardIds, moveClientCard, sameClientCardOrder } from "../lib/client-card-ordering.ts";

const clients = ["acqua", "axel", "etisalat", "faces", "sephora", "valentino"].map(id => ({ id }));
const ids = clients.map(client => client.id);
const snapshot = JSON.stringify(clients);
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };

equal(clientCardIds(clients), ids);
equal(clientCardIds(clients, []), ids);
equal(clientCardIds(clients, ["sephora", "faces"]), ["sephora", "faces", "acqua", "axel", "etisalat", "valentino"]);
equal(clientCardIds(clients, ["missing", "sephora", "sephora", "archived", "faces"]), ["sephora", "faces", "acqua", "axel", "etisalat", "valentino"]);
equal(clientCardIds([...clients, { id: "new-client" }], ["sephora", "acqua", "axel", "etisalat", "faces", "valentino"]), ["sephora", "acqua", "axel", "etisalat", "faces", "valentino", "new-client"]);
equal(clientCardIds(clients.filter(client => client.id !== "faces"), ["faces", "sephora"]), ["sephora", "acqua", "axel", "etisalat", "valentino"]);
equal(clientCardIds([], ["sephora"]), []);
equal(clientCardIds([{ id: "same" }, { id: "same" }], ["same", "same"]), ["same"]);

equal(moveClientCard(ids, "sephora", 0), ["sephora", "acqua", "axel", "etisalat", "faces", "valentino"]);
equal(moveClientCard(ids, "acqua", 5), ["axel", "etisalat", "faces", "sephora", "valentino", "acqua"]);
equal(moveClientCard(ids, "axel", 3), ["acqua", "etisalat", "faces", "axel", "sephora", "valentino"]);
equal(moveClientCard(ids, "faces", 2), ["acqua", "axel", "faces", "etisalat", "sephora", "valentino"]);
equal(moveClientCard(ids, "faces", -1), ["faces", "acqua", "axel", "etisalat", "sephora", "valentino"]);
equal(moveClientCard(ids, "faces", 100), ["acqua", "axel", "etisalat", "sephora", "valentino", "faces"]);
equal(moveClientCard(ids, "faces", 3), ids);
equal(moveClientCard(ids, "missing", 0), ids);
equal(moveClientCard(ids, "faces", NaN), ids);
equal(moveClientCard(ids, "faces", 1.5), ids);
equal(moveClientCard([], "faces", 0), []);

const multirow = Array.from({ length: 18 }, (_, index) => "client-" + index);
const moved = moveClientCard(multirow, "client-16", 1);
equal(moved[1], "client-16");
equal(moved.length, 18);
equal(new Set(moved).size, 18);
equal(moved.filter(id => id !== "client-16"), multirow.filter(id => id !== "client-16"));
equal(clientCardIds(clients, []), ids); // Reset persists [] rather than a frozen alphabetical snapshot.
equal(sameClientCardOrder(ids, [...ids]), true);
equal(sameClientCardOrder(ids, moveClientCard(ids, "sephora", 0)), false);
equal(sameClientCardOrder(["a"], ["a", "b"]), false);
equal(sameClientCardOrder([], []), true);
equal(JSON.stringify(clients), snapshot);
equal(ids, ["acqua", "axel", "etisalat", "faces", "sephora", "valentino"]);

console.log(`${checks} client card ordering checks passed: personal order, stale IDs, newly added clients, reset, multirow moves and unchanged inputs.`);
