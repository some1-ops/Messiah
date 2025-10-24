
import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, Blob } from '@google/genai';
import { ERYON_SYSTEM_PROMPT } from '../constants';
import { encode, decode, decodeAudioData } from '../services/utils';

export const useLiveConversation = () => {
    const [isConnecting, setIsConnecting] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const [transcripts, setTranscripts] = useState<{ user: string, eryon: string }[]>([]);
    const [currentInterimTranscript, setCurrentInterimTranscript] = useState({ user: '', eryon: '' });

    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const microphoneStreamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const outputSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const nextStartTimeRef = useRef<number>(0);
    const interimUserTranscriptRef = useRef('');
    const interimEryonTranscriptRef = useRef('');

    const stopConversation = useCallback(async () => {
        if (!sessionPromiseRef.current) return;
        
        try {
            const session = await sessionPromiseRef.current;
            session.close();
        } catch (error) {
            console.error("Error closing live session:", error);
        }

        if (microphoneStreamRef.current) {
            microphoneStreamRef.current.getTracks().forEach(track => track.stop());
            microphoneStreamRef.current = null;
        }
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
            await inputAudioContextRef.current.close();
            inputAudioContextRef.current = null;
        }
        if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
            await outputAudioContextRef.current.close();
            outputAudioContextRef.current = null;
        }

        outputSourcesRef.current.forEach(source => source.stop());
        outputSourcesRef.current.clear();
        nextStartTimeRef.current = 0;
        sessionPromiseRef.current = null;

        setIsActive(false);
        setIsConnecting(false);
        setTranscripts([]);
        setCurrentInterimTranscript({ user: '', eryon: '' });
        interimUserTranscriptRef.current = '';
        interimEryonTranscriptRef.current = '';

    }, []);

    const startConversation = useCallback(async () => {
        if (isActive || isConnecting) return;

        setIsConnecting(true);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            
            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            microphoneStreamRef.current = stream;

            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                    systemInstruction: ERYON_SYSTEM_PROMPT,
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                },
                callbacks: {
                    onopen: () => {
                        setIsConnecting(false);
                        setIsActive(true);
                        const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
                        const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                        scriptProcessorRef.current = scriptProcessor;

                        scriptProcessor.onaudioprocess = (event) => {
                            const inputData = event.inputBuffer.getChannelData(0);
                            const l = inputData.length;
                            const int16 = new Int16Array(l);
                            for (let i = 0; i < l; i++) {
                                int16[i] = inputData[i] * 32768;
                            }
                            const pcmBlob: Blob = {
                                data: encode(new Uint8Array(int16.buffer)),
                                mimeType: 'audio/pcm;rate=16000',
                            };
                            if (sessionPromiseRef.current) {
                                sessionPromiseRef.current.then((session) => {
                                    session.sendRealtimeInput({ media: pcmBlob });
                                });
                            }
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContextRef.current!.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        // Handle transcription
                        if (message.serverContent?.inputTranscription) {
                            interimUserTranscriptRef.current += message.serverContent.inputTranscription.text;
                            setCurrentInterimTranscript(prev => ({ ...prev, user: interimUserTranscriptRef.current }));
                        }
                        if (message.serverContent?.outputTranscription) {
                            interimEryonTranscriptRef.current += message.serverContent.outputTranscription.text;
                            setCurrentInterimTranscript(prev => ({ ...prev, eryon: interimEryonTranscriptRef.current }));
                        }
                        if (message.serverContent?.turnComplete) {
                            const finalUser = interimUserTranscriptRef.current;
                            const finalEryon = interimEryonTranscriptRef.current;
                            setTranscripts(prev => [...prev, { user: finalUser, eryon: finalEryon }]);
                            interimUserTranscriptRef.current = '';
                            interimEryonTranscriptRef.current = '';
                            setCurrentInterimTranscript({ user: '', eryon: '' });
                        }

                        // Handle audio playback
                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64Audio && outputAudioContextRef.current) {
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
                            const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContextRef.current, 24000, 1);
                            const source = outputAudioContextRef.current.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputAudioContextRef.current.destination);
                            
                            source.addEventListener('ended', () => {
                                outputSourcesRef.current.delete(source);
                            });
                            
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            outputSourcesRef.current.add(source);
                        }

                        if (message.serverContent?.interrupted) {
                            outputSourcesRef.current.forEach(source => source.stop());
                            outputSourcesRef.current.clear();
                            nextStartTimeRef.current = 0;
                        }
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error("Live session error:", e);
                        stopConversation();
                    },
                    onclose: (e: CloseEvent) => {
                        stopConversation();
                    }
                }
            });
            await sessionPromiseRef.current;

        } catch (error) {
            console.error("Failed to start conversation:", error);
            setIsConnecting(false);
            setIsActive(false);
            alert("Could not start microphone. Please check permissions.");
        }
    }, [isActive, isConnecting, stopConversation]);
    
    useEffect(() => {
        return () => {
            stopConversation();
        };
    }, [stopConversation]);

    return { startConversation, stopConversation, isActive, isConnecting, transcripts, currentInterimTranscript };
};
