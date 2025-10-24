
import React from 'react';
import { Message, MessageAuthor } from '../types';
import LoadingSpinner from './LoadingSpinner';

const UserIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
);

const EryonIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3.5a1 1 0 00.02 1.84l7 3.5a1 1 0 00.748 0l7-3.5a1 1 0 00.02-1.84l-7-3.5zM3 9.363l7 3.5 7-3.5v3.824l-7 3.5-7-3.5V9.363z" />
    </svg>
);


const MessageBubble: React.FC<{ message: Message }> = ({ message }) => {
    const isEryon = message.author === MessageAuthor.ERYON;
    const bubbleClasses = isEryon
        ? 'bg-gray-800'
        : 'bg-blue-600 ml-auto';

    return (
        <div className={`flex items-start gap-3 my-4 ${!isEryon && 'flex-row-reverse'}`}>
            <div className="flex-shrink-0">
                {isEryon ? <EryonIcon /> : <UserIcon />}
            </div>
            <div className={`max-w-xl w-fit rounded-lg p-4 ${bubbleClasses}`}>
                {message.isLoading && <LoadingSpinner />}
                {message.text && <p className="whitespace-pre-wrap">{message.text}</p>}
                {message.imageUrl && (
                    <img src={message.imageUrl} alt="Generated content" className="mt-2 rounded-lg max-w-sm" />
                )}
                {message.videoUrl && (
                    <video src={message.videoUrl} controls className="mt-2 rounded-lg max-w-sm" />
                )}
                {message.audioUrl && (
                    <audio src={message.audioUrl} controls className="mt-2" />
                )}
                {message.groundingChunks && message.groundingChunks.length > 0 && (
                    <div className="mt-4 border-t border-gray-700 pt-2">
                        <h4 className="text-sm font-semibold text-gray-400 mb-2">Sources:</h4>
                        <ul className="space-y-1">
                            {message.groundingChunks.map((chunk, index) => (
                                <li key={index} className="text-xs">
                                    <a
                                        href={chunk.web?.uri || chunk.maps?.uri}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:underline truncate"
                                    >
                                        {chunk.web?.title || chunk.maps?.title || 'Source'}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MessageBubble;
