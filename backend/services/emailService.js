export async function getQueueSnapshot() {
  return { queued: 0, processing: 0, failed: 0 };
}
