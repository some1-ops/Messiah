
import React, { useRef, useEffect } from 'react';
import { Message } from '../types';
import MessageBubble from './MessageBubble';

interface ChatWindowProps {
  messages: Message[];
  liveTranscripts?: { user: string; eryon: string }[];
  currentInterimTranscript?: { user: string; eryon: string };
}

const ChatWindow: React.FC<ChatWindowProps> = ({ messages, liveTranscripts, currentInterimTranscript }) => {
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveTranscripts, currentInterimTranscript]);

  const hasLiveContent = liveTranscripts && (liveTranscripts.length > 0 || currentInterimTranscript?.user || currentInterimTranscript?.eryon);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {hasLiveContent ? (
        <div className="space-y-4">
          {liveTranscripts?.map((t, i) => (
            <div key={i}>
              <p><strong className="text-gray-400">You:</strong> {t.user}</p>
              <p><strong className="text-blue-400">Eryon:</strong> {t.eryon}</p>
            </div>
          ))}
          {currentInterimTranscript && (currentInterimTranscript.user || currentInterimTranscript.eryon) && (
             <div>
              {currentInterimTranscript.user && <p className="text-gray-500"><strong className="text-gray-400">You:</strong> {currentInterimTranscript.user}</p>}
              {currentInterimTranscript.eryon && <p className="text-blue-500"><strong className="text-blue-400">Eryon:</strong> {currentInterimTranscript.eryon}</p>}
            </div>
          )}
        </div>
      ) : (
        messages.map((message) => <MessageBubble key={message.id} message={message} />)
      )}
      <div ref={endOfMessagesRef} />
    </div>
  );
};

export default ChatWindow;
