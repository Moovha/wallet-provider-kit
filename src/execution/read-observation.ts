/** Bound a status read's observation wait; the shared read-only refresh continues. */
export async function waitForObservation(
  refresh: Promise<void>,
  milliseconds = 250,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      refresh.then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
