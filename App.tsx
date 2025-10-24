
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message, MessageAuthor, AiMode, AspectRatio } from './types';
import { MODES, ERYON_SYSTEM_PROMPT, VEO_LOADING_MESSAGES, AG_TECH_LOGO_BASE64 } from './constants';
import * as geminiService from './services/geminiService';
import { fileToBase64 } from './services/utils';
import { useLiveConversation } from './hooks/useLiveConversation';

import ChatWindow from './components/ChatWindow';
import ApiKeySelector from './components/ApiKeySelector';
import LoadingSpinner from './components/LoadingSpinner';


const App: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([
        { id: '1', author: MessageAuthor.ERYON, text: "I am Eryon, the official AI representative of A&G Tech. How can I help you understand how automation can transform your business today?" }
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
        setMessages(prev => [...prev, { id: loadingMessageId, author: MessageAuthor.ERYON, isLoading: true }]);

        try {
            let response: Partial<Message> = {};

            const fileData = uploadedFile ? await fileToBase64(uploadedFile) : null;
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
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
                        const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 }));
                        userLocation = position.coords;
                    } catch (e) {
                        console.warn("Could not get user location:", e);
                        // Re-throw to be caught by the main error handler
                        throw e;
                    }
                 }
                const textResponse = await geminiService.generateText(userMessageText, currentMode, userLocation);
                response.text = textResponse.text;
                response.groundingChunks = textResponse.groundingChunks;
            }

            setMessages(prev => prev.map(m => m.id === loadingMessageId ? { ...m, ...response, isLoading: false } : m));

        } catch (error: any) {
            console.error("API Error:", error);
            let errorMessage = "An unexpected error occurred. Please try again later.";

            if (error.code && typeof error.code === 'number') { // GeolocationPositionError
                switch (error.code) {
                    case 1: // PERMISSION_DENIED
                        errorMessage = "Location permission denied. Please enable location services in your browser settings to use Maps Search.";
                        break;
                    case 2: // POSITION_UNAVAILABLE
                        errorMessage = "Your location could not be determined. Please check your network or try again.";
                        break;
                    case 3: // TIMEOUT
                        errorMessage = "The request to get your location timed out. Please try again.";
                        break;
                }
            } else if (error.message) {
                const msg = error.message.toLowerCase();
                 if (msg.includes("requested entity was not found")) {
                    errorMessage = "API Key error. The selected key may not have access to the Video API. Please re-select your API key.";
                    setIsApiKeySelected(false);
                } else if (msg.includes("api key not valid")) {
                    errorMessage = "Your API Key is not valid. Please check your configuration.";
                } else if (msg.includes("quota") || msg.includes("resource has been exhausted")) {
                    errorMessage = "You have exceeded your API quota. Please check your billing account or try again later.";
                } else if (msg.includes("safety policy")) {
                    errorMessage = "The request was blocked due to the safety policy. Please modify your prompt and try again.";
                } else if (msg.includes("failed to fetch") || msg.includes("network")) {
                    errorMessage = "A network error occurred. Please check your internet connection and try again.";
                } else if (msg.includes("400")) {
                    errorMessage = "There was a problem with your request (Bad Request). Please check your input and try again.";
                } else if (msg.includes("500") || msg.includes("internal error")) {
                    errorMessage = "The AI server encountered an internal error. Please try again in a few moments.";
                }
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
                            <button key={ratio} onClick={() => setAspectRatio(ratio as AspectRatio)} className={`px-2 py-1 text-xs rounded-md transition-all ${aspectRatio === ratio ? 'bg-gradient-to-r from-[#9B59B6] to-[#00FFD1] text-black font-semibold shadow-lg' : 'bg-[#1F2937] text-gray-300 hover:bg-[#374151]'}`}>
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
        <div className="h-screen w-screen bg-[#0A1628] flex flex-col font-sans text-white">
            {/* Header */}
            <header className="flex-shrink-0 bg-[#0A1628]/80 backdrop-blur-sm border-b border-[#9B59B6]/30 p-4 flex justify-between items-center shadow-lg shadow-[#9B59B6]/10">
                <div className="flex items-center gap-4">
                    <img src={AG_TECH_LOGO_BASE64} alt="A&G Tech Logo" className="h-10 w-10 object-contain" />
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-wider">A&G Tech</h1>
                        <p className="text-xs text-gray-400 tracking-wide uppercase">ERYON AI ASSISTANT</p>
                    </div>
                </div>
            </header>

            <main className="flex-1 flex flex-col min-h-0">
                <div className="flex-shrink-0 overflow-x-auto p-3">
                     <div className="flex gap-2 justify-center">
                        {MODES.filter(m => m !== AiMode.LIVE_CONVERSATION).map(mode => (
                           <button key={mode} onClick={() => handleModeChange(mode)} 
                           className={`px-4 py-2 text-sm rounded-full whitespace-nowrap transition-all duration-300 transform hover:scale-105 ${currentMode === mode ? 'bg-gradient-to-r from-[#9B59B6] to-[#00FFD1] text-black font-bold shadow-lg shadow-[#00FFD1]/20' : 'bg-[#1F2937] text-gray-300 hover:bg-[#374151]'}`}>
                               {mode}
                           </button>
                        ))}
                    </div>
                </div>

                <ChatWindow messages={messages} liveTranscripts={transcripts} currentInterimTranscript={currentInterimTranscript} />

                <footer className="flex-shrink-0 bg-[#0A1628]/80 backdrop-blur-sm border-t border-[#9B59B6]/30 p-4 space-y-3">
                    {showApiKeySelector && <ApiKeySelector onKeySelected={() => setIsApiKeySelected(true)} />}
            
                    <div className="flex items-center gap-3 bg-[#1F2937] rounded-full p-2 shadow-inner shadow-black/30">
                        <button onClick={handleToggleLive} className={`p-3 rounded-full transition-all duration-300 ${isLive || isConnecting ? 'bg-red-500 animate-pulse' : 'bg-green-500 hover:bg-green-600'}`} aria-label={isLive || isConnecting ? "Stop live conversation" : "Start live conversation"}>
                            { isConnecting ? <LoadingSpinner /> : <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>}
                        </button>
            
                        {needsFileUpload && (
                            <button onClick={() => fileInputRef.current?.click()} className="p-3 bg-[#374151] rounded-full hover:bg-[#4b5563] transition-colors" aria-label="Upload file">
                                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,video/*" />
                                { uploadedFile ? 
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    :
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                                }
                            </button>
                        )}
                        
                        <input 
                            type="text" 
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder={isLive ? "Live conversation is active..." : (uploadedFile ? `${uploadedFile.name} is ready.` : `Message Eryon in ${currentMode} mode...`)}
                            className="flex-1 bg-transparent focus:outline-none px-2 placeholder-gray-500 disabled:cursor-not-allowed"
                            disabled={isLoading || isLive || isConnecting}
                            aria-label="Chat input"
                        />
            
                        <button onClick={handleSend} disabled={isLoading || isLive || isConnecting || (!input.trim() && !uploadedFile)} className="p-3 bg-gradient-to-r from-[#9B59B6] to-[#00FFD1] rounded-full hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Send message">
                            {isLoading ? <LoadingSpinner /> : <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>}
                        </button>
                    </div>
                    
                    {!showApiKeySelector && <div className="flex justify-center pt-2">{renderInputAccessory()}</div>}
                </footer>
            </main>
        </div>
    );
};

export default App;
