// pg Pool.end() may resolve before its clients emit their socket-close events.
// Drain those clients before DROP DATABASE can interrupt a fixture connection.
export async function closeTestPool(target) {
  let remaining = target.totalCount;
  const closed = remaining ? new Promise(resolve => {
    const removed = () => { if (--remaining === 0) { target.off("remove", removed); resolve(); } };
    target.on("remove", removed);
  }) : Promise.resolve();
  await target.end();
  await closed;
}
