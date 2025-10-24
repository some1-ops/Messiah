
export enum MessageAuthor {
  USER = 'user',
  ERYON = 'eryon',
  SYSTEM = 'system',
}

export enum AiMode {
  CHAT = 'Chat',
  GENERATE_IMAGE = 'Generate Image',
  EDIT_IMAGE = 'Edit Image',
  GENERATE_VIDEO = 'Generate Video',
  ANIMATE_IMAGE = 'Animate Image',
  SEARCH = 'Web Search',
  MAPS = 'Maps Search',
  VIDEO_ANALYSIS = 'Analyze Video',
  THINKING_MODE = 'Thinking Mode',
  FAST_MODE = 'Fast Mode',
  LIVE_CONVERSATION = 'Live Conversation',
  TTS = 'Text-to-Speech'
}

export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
  maps?: {
    uri: string;
    title: string;
  };
}

export interface Message {
  id: string;
  author: MessageAuthor;
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  isLoading?: boolean;
  groundingChunks?: GroundingChunk[];
}
