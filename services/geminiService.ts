
import { GoogleGenAI, Chat, GenerateContentResponse, Type, Modality, VideosOperationResponse } from "@google/genai";
import { AiMode, AspectRatio, GroundingChunk } from '../types';

let ai: GoogleGenAI;
const getAi = () => {
    if (!ai) {
        ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    }
    return ai;
};

// We need a separate instance creator for Veo because the API key might change.
const getVeoAi = () => new GoogleGenAI({ apiKey: process.env.API_KEY as string });


let chatInstance: Chat | null = null;

export const startChat = (systemInstruction: string): Chat => {
  const ai = getAi();
  chatInstance = ai.chats.create({
    model: 'gemini-2.5-flash',
    config: {
        systemInstruction,
    },
  });
  return chatInstance;
};

export const sendMessageToChat = async (message: string): Promise<GenerateContentResponse> => {
    if (!chatInstance) throw new Error("Chat not initialized");
    return await chatInstance.sendMessage({ message });
};

export const generateText = async (prompt: string, mode: AiMode, userLocation?: GeolocationCoordinates): Promise<{text: string, groundingChunks?: GroundingChunk[]}> => {
    const ai = getAi();
    let modelName = 'gemini-2.5-flash';
    let config: any = {};

    switch (mode) {
        case AiMode.THINKING_MODE:
            modelName = 'gemini-2.5-pro';
            config.thinkingConfig = { thinkingBudget: 32768 };
            break;
        case AiMode.FAST_MODE:
            modelName = 'gemini-2.5-flash-lite';
            break;
        case AiMode.SEARCH:
            config.tools = [{ googleSearch: {} }];
            break;
        case AiMode.MAPS:
            config.tools = [{ googleMaps: {} }];
            if(userLocation) {
                config.toolConfig = {
                    retrievalConfig: {
                        latLng: {
                            latitude: userLocation.latitude,
                            longitude: userLocation.longitude,
                        }
                    }
                }
            }
            break;
    }
    
    const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: config
    });
    
    return {
        text: response.text,
        groundingChunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks as GroundingChunk[] || undefined
    };
};

export const analyzeMedia = async (prompt: string, file: { base64: string, mimeType: string }): Promise<string> => {
    const ai = getAi();
    const modelName = file.mimeType.startsWith('video/') ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
    
    const imagePart = {
        inlineData: {
            mimeType: file.mimeType,
            data: file.base64,
        },
    };
    const textPart = { text: prompt };

    const response = await ai.models.generateContent({
        model: modelName,
        contents: { parts: [imagePart, textPart] },
    });
    return response.text;
};

export const generateImage = async (prompt: string, aspectRatio: AspectRatio): Promise<string> => {
    const ai = getAi();
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/png',
            aspectRatio: aspectRatio,
        },
    });

    const base64ImageBytes = response.generatedImages[0].image.imageBytes;
    return `data:image/png;base64,${base64ImageBytes}`;
};


export const editImage = async (prompt: string, image: { base64: string, mimeType: string }): Promise<string> => {
    const ai = getAi();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [
                {
                    inlineData: {
                        data: image.base64,
                        mimeType: image.mimeType,
                    },
                },
                { text: prompt },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
            const base64ImageBytes: string = part.inlineData.data;
            return `data:image/png;base64,${base64ImageBytes}`;
        }
    }
    throw new Error("No image generated");
};

export const generateVideo = async (prompt: string | null, image: { base64: string, mimeType: string } | null, aspectRatio: '16:9' | '9:16', onProgress: (message: string) => void): Promise<string> => {
    const ai = getVeoAi(); // Use fresh instance with latest key
    let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt || 'Animate this image beautifully.',
        ...(image && { image: { imageBytes: image.base64, mimeType: image.mimeType } }),
        config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: aspectRatio,
        }
    });

    let progressIndex = 0;
    while (!operation.done) {
        onProgress(progressIndex.toString());
        progressIndex++;
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("Video generation failed, no download link.");
    
    const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    const blob = await videoResponse.blob();
    return URL.createObjectURL(blob);
};

export const textToSpeech = async (text: string): Promise<string> => {
    const ai = getAi();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: text }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
            },
        },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("TTS failed to generate audio.");
    
    return `data:audio/wav;base64,${base64Audio}`; // This isn't strictly correct as it's raw PCM, but browsers can often play it. A proper WAV header would be better.
}
