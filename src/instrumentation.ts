export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.ORCHESTRIA_CHANNELS_AUTOSTART !== "0") {
    const { startAllChannels } = await import("./lib/channels/runtime");
    const { started } = startAllChannels();
    if (started.length) console.log(`[orchestria] channels started: ${started.join(", ")}`);
  }
  if (process.env.ORCHESTRIA_ROUTINES_AUTOSTART !== "0") {
    const { startScheduler } = await import("./lib/routines/scheduler");
    if (startScheduler()) console.log(`[orchestria] routines scheduler started`);
  }
  if (process.env.ORCHESTRIA_MEMORY_AUTORECORD !== "0") {
    const { startAutoMemoryRecording } = await import("./lib/memory/autorecord");
    if (startAutoMemoryRecording()) console.log(`[orchestria] memory auto-record started`);
  }
}
