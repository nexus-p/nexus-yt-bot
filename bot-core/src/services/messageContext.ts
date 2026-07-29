// =============================================================================
// Message Context — tracks sent bot messages → video metadata
//
// When the bot sends a summary, highlights, or download result, we record
// the sent message_id so that if the user replies to it, we can route the
// reply as a Q&A question against that video's transcript.
// =============================================================================

interface VideoContext {
  url: string;
  title: string;
}

const contextMap = new Map<number, VideoContext>();

export function setMessageContext(msgId: number, ctx: VideoContext): void {
  contextMap.set(msgId, ctx);
}

export function getMessageContext(msgId: number): VideoContext | undefined {
  return contextMap.get(msgId);
}

export function deleteMessageContext(msgId: number): void {
  contextMap.delete(msgId);
}
