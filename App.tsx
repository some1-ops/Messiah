import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message, MessageAuthor, AiMode, AspectRatio } from './types';
import { MODES, ERYON_SYSTEM_PROMPT, VEO_LOADING_MESSAGES } from './constants';
import * as geminiService from './services/geminiService';
import { fileToBase64 } from './services/utils';
import { useLiveConversation } from './hooks/useLiveConversation';

import ChatWindow from './components/ChatWindow';
import ApiKeySelector from './components/ApiKeySelector';
import LoadingSpinner from './components/LoadingSpinner';


const App: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([
        { id: '1', author: MessageAuthor.ERYON, text: "I am Eryon, an AI assistant for A&G Tech. How can I help you today? You can ask me about our services, or try one of the modes below." }
    ]);
    const [input, setInput] = useState('');
    const [currentMode, setCurrentMode] = useState<AiMode>(AiMode.CHAT);
    const [isLoading, setIsLoading] = useState(false);
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
    const [isApiKeySelected, setIsApiKeySelected] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const { startConversation, stopConversation, isActive: isLive, isConnecting, transcripts, currentInterimTranscript } = useLiveConversation();

    useEffect(() => {
        geminiService.startChat(ERYON_SYSTEM_PROMPT);
    }, []);

    useEffect(() => {
        const checkApiKey = async () => {
            if ((window as any).aistudio && (window as any).aistudio.hasSelectedApiKey) {
                const hasKey = await (window as any).aistudio.hasSelectedApiKey();
                setIsApiKeySelected(hasKey);
            }
        };
        checkApiKey();
    }, []);

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            setUploadedFile(event.target.files[0]);
        }
    };

    const addMessage = (message: Omit<Message, 'id'>) => {
        setMessages(prev => [...prev, { ...message, id: Date.now().toString() }]);
    };
    
    const needsFileUpload = [AiMode.EDIT_IMAGE, AiMode.ANIMATE_IMAGE, AiMode.VIDEO_ANALYSIS].includes(currentMode);

    const handleSend = async () => {
        if ((!input.trim() && !uploadedFile) || isLoading || isLive) return;

        const userMessageText = input.trim();
        addMessage({ author: MessageAuthor.USER, text: userMessageText });
        setInput('');
        setIsLoading(true);

        const loadingMessageId = Date.now().toString();
        // FIX: The `addMessage` function creates its own ID. To add a message with a specific ID
        // (so we can update it later), we call `setMessages` directly. This fixes an error where
        // an `id` was incorrectly passed to `addMessage`.
        setMessages(prev => [...prev, { id: loadingMessageId, author: MessageAuthor.ERYON, isLoading: true }]);

        try {
            let response: Partial<Message> = {};

            const fileData = uploadedFile ? await fileToBase64(uploadedFile) : null;
            setUploadedFile(null);

            if (currentMode === AiMode.CHAT) {
                const chatResponse = await geminiService.sendMessageToChat(userMessageText);
                response.text = chatResponse.text;
            } else if (currentMode === AiMode.GENERATE_IMAGE) {
                response.imageUrl = await geminiService.generateImage(userMessageText, aspectRatio);
            } else if (currentMode === AiMode.EDIT_IMAGE && fileData) {
                response.imageUrl = await geminiService.editImage(userMessageText, fileData);
            } else if ((currentMode === AiMode.GENERATE_VIDEO || currentMode === AiMode.ANIMATE_IMAGE) && (userMessageText || fileData)) {
                 const onProgress = (progress: string) => {
                    const messageIndex = parseInt(progress, 10);
                    setMessages(prev => prev.map(m => m.id === loadingMessageId ? { ...m, text: VEO_LOADING_MESSAGES[messageIndex % VEO_LOADING_MESSAGES.length] } : m));
                 };
                response.videoUrl = await geminiService.generateVideo(userMessageText, fileData, aspectRatio === '9:16' ? '9:16' : '16:9', onProgress);
            } else if (currentMode === AiMode.VIDEO_ANALYSIS && fileData) {
                response.text = await geminiService.analyzeMedia(userMessageText, fileData);
            } else if (currentMode === AiMode.TTS) {
                response.audioUrl = await geminiService.textToSpeech(userMessageText);
            } else {
                 const isMaps = currentMode === AiMode.MAPS;
                 let userLocation: GeolocationCoordinates | undefined;
                 if(isMaps) {
                    try {
                        const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject));
                        userLocation = position.coords;
                    } catch (e) {
                        console.warn("Could not get user location");
                    }
                 }
                const textResponse = await geminiService.generateText(userMessageText, currentMode, userLocation);
                response.text = textResponse.text;
                response.groundingChunks = textResponse.groundingChunks;
            }

            setMessages(prev => prev.map(m => m.id === loadingMessageId ? { ...m, ...response, isLoading: false } : m));

        } catch (error: any) {
            console.error("API Error:", error);
            let errorMessage = "Sorry, I encountered an error.";
            if (error.message && error.message.includes("Requested entity was not found")) {
                errorMessage = "API Key error. Please re-select your API key for video generation.";
                setIsApiKeySelected(false);
            }
            setMessages(prev => prev.map(m => m.id === loadingMessageId ? { ...m, text: errorMessage, isLoading: false } : m));
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleModeChange = (mode: AiMode) => {
        setCurrentMode(mode);
        setUploadedFile(null);
        if (isLive) {
            stopConversation();
        }
    }
    
    const handleToggleLive = () => {
        if(isLive || isConnecting) {
            stopConversation();
        } else {
            handleModeChange(AiMode.LIVE_CONVERSATION);
            startConversation();
        }
    }

    const renderInputAccessory = () => {
        switch (currentMode) {
            case AiMode.GENERATE_IMAGE:
            case AiMode.GENERATE_VIDEO:
            case AiMode.ANIMATE_IMAGE:
                const isVideo = currentMode !== AiMode.GENERATE_IMAGE;
                return (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400">Aspect Ratio:</span>
                        {(isVideo ? ["16:9", "9:16"] : ["1:1", "16:9", "9:16", "4:3", "3:4"]).map((ratio) => (
                            <button key={ratio} onClick={() => setAspectRatio(ratio as AspectRatio)} className={`px-2 py-1 text-xs rounded ${aspectRatio === ratio ? 'bg-blue-600' : 'bg-gray-600'}`}>
                                {ratio}
                            </button>
                        ))}
                    </div>
                );
            default:
                return null;
        }
    }

    const showApiKeySelector = (currentMode === AiMode.GENERATE_VIDEO || currentMode === AiMode.ANIMATE_IMAGE) && !isApiKeySelected;

    return (
        <div className="h-screen w-screen bg-gray-900 flex flex-col font-sans">
            {/* Header */}
            <header className="flex-shrink-0 bg-gray-900/80 backdrop-blur-sm border-b border-gray-700 p-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                         <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3.5a1 1 0 00.02 1.84l7 3.5a1 1 0 00.748 0l7-3.5a1 1 0 00.02-1.84l-7-3.5zM3 9.363l7 3.5 7-3.5v3.824l-7 3.5-7-3.5V9.363z" />
                    </svg>
                    <div>
                        <h1 className="text-xl font-bold text-white">Eryon</h1>
                        <p className="text-xs text-gray-400">AI Assistant for A&G Tech</p>
                    </div>
                </div>
            </header>

            <main className="flex-1 flex flex-col min-h-0">
                <div className="flex-shrink-0 overflow-x-auto p-2">
                     <div className="flex gap-2 justify-center">
                        {MODES.filter(m => m !== AiMode.LIVE_CONVERSATION).map(mode => (
                           <button key={mode} onClick={() => handleModeChange(mode)} className={`px-4 py-2 text-sm rounded-full whitespace-nowrap transition-colors ${currentMode === mode ? 'bg-blue-600 text-white font-semibold' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
                               {mode}
                           </button>
                        ))}
                     </div>
                </div>
                <ChatWindow messages={messages} liveTranscripts={transcripts} currentInterimTranscript={currentInterimTranscript} />
            </main>
            
            {/* Input Area */}
            <footer className="flex-shrink-0 p-4 bg-gray-900 border-t border-gray-700">
                {showApiKeySelector && <ApiKeySelector onKeySelected={() => setIsApiKeySelected(true)} />}
                <div className="max-w-4xl mx-auto">
                    <div className="flex items-center bg-gray-800 rounded-xl p-2">
                        <button onClick={handleToggleLive} className={`p-2 rounded-full transition-colors mr-2 ${isLive || isConnecting ? 'bg-red-500' : 'bg-gray-600 hover:bg-gray-500'}`}>
                          {isConnecting ? <LoadingSpinner /> : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                          )}
                        </button>
                        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSend()} placeholder={isLive ? "Live conversation is active..." : `Message Eryon in ${currentMode} mode...`} disabled={isLoading || isLive || isConnecting} className="w-full bg-transparent focus:outline-none text-white px-2" />
                        
                        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,video/*" />
                        {needsFileUpload && (
                            <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-white" title="Upload File">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                            </button>
                        )}

                        <button onClick={handleSend} disabled={isLoading || isLive || showApiKeySelector} className="bg-blue-600 text-white rounded-lg p-2 ml-2 disabled:bg-gray-600 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors">
                            {isLoading ? <LoadingSpinner /> : 
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                                </svg>
                            }
                        </button>
                    </div>
                    {uploadedFile && <div className="text-xs text-gray-400 mt-2 text-center">File ready: {uploadedFile.name}</div>}
                    <div className="mt-2 h-8 flex items-center justify-center">
                        {renderInputAccessory()}
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default App;
