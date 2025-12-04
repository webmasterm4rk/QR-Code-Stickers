import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Keyboard, Sparkles, PhoneOff, ExternalLink, MessageCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { BusinessConfig, ChatMessage } from '../types';
import { createBlob, decode, decodeAudioData } from '../utils/audioUtils';
import LiveVoiceVisualizer, { VisualizerState } from './LiveVoiceVisualizer';

interface ChatWidgetProps {
  config: BusinessConfig;
}

// --- SAVED VOICE CONFIGURATION ---
const EMMA_VOICE_CONFIG = {
  name: 'Emma',
  modelVoice: 'Kore', // Female voice model
  systemInstruction: (config: BusinessConfig) => `
    *** CRITICAL INSTRUCTION: VOICE & ACCENT ***
    You are "Emma". You MUST speak with a CLEAR, AUTHENTIC BRITISH ENGLISH ACCENT (Received Pronunciation / BBC Style).
    - DO NOT speak with an American accent.
    - Use British vocabulary: 'mobile' not 'cell', 'lift' not 'elevator', 'pavement' not 'sidewalk', 'flat' not 'apartment'.
    - Your tone is professional, warm, and polite.

    IDENTITY:
    - You are a helpful, friendly receptionist for ${config.businessName}.
  `
};

// --- COST SAVING CONSTANTS ---
const SILENCE_THRESHOLD = 0.01; // Minimum volume to consider as "speech"
const SPEECH_HANGOVER_MS = 800; // Keep sending audio for this long after silence (prevents cutting off words)
const IDLE_TIMEOUT_MS = 90000; // Disconnect after 90 seconds of user silence to save money

const ChatWidget: React.FC<ChatWidgetProps> = ({ config }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'reconnecting'>('disconnected');
  const [showTextInput, setShowTextInput] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Refs for Live API
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const keepAliveIntervalRef = useRef<any>(null);
  const isUserDisconnectingRef = useRef<boolean>(false);
  
  // VAD & Idle Refs
  const lastSpeechTimeRef = useRef<number>(0);
  const idleTimerRef = useRef<any>(null);
  
  // State for Visualizer
  const [visualizerState, setVisualizerState] = useState<VisualizerState>('listening');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // System Instruction construction
  const getSystemInstruction = () => {
    let instruction = EMMA_VOICE_CONFIG.systemInstruction(config);

    instruction += `
    CONTEXT:
    You work for ${config.businessName}, a ${config.tradeType} business run by ${config.contactName}.
    
    Business Details:
    - Services: ${config.services}
    - Pricing: ${config.pricing}
    - Availability: ${config.availability}
    
    CRITICAL RULES:
    1. GREETING: You MUST start the conversation. As soon as you connect, say exactly: "Hi, how can I help you?". Do not wait for the user to speak.
    2. OFF-THE-SHELF ITEMS: If a user asks about the price of 'off-the-shelf' stickers or stock items, DO NOT QUOTE A PRICE. Instead, say: "For our off-the-shelf range, please check the Shop link in the navigation menu for the most up-to-date pricing."
    3. CUSTOM ITEMS: DO NOT QUOTE PRICES for custom stickers. Explain that custom prices depend on size, material, and other factors. Instruct the user to use the contact form, email us, or call 07544683677 to get a quote.
    4. WEBSITE KNOWLEDGE: You have access to the website (${config.sitemapUrl}). Use the Google Search tool to look up blog posts, pages, and specific details to answer ANY question about the business or website content.
    5. CONTACT INFO: If a user asks for contact info, say: "Our contact details are available on the website, or you can call 07544683677." You can also offer: "Or if you prefer, please leave your name and number or email, and ${config.contactName} will get back to you."
    `;

    if (config.knowledgeBaseText) {
      instruction += `\n\nAdditional Business Knowledge:\n${config.knowledgeBaseText}`;
    }

    if (config.sitemapUrl) {
      instruction += `\n\nWebsite URL: ${config.sitemapUrl}. Use this URL as your primary source of truth.`;
    }

    return instruction;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Update visualizer based on connection status and audio activity
  useEffect(() => {
    if (connectionStatus === 'connecting' || connectionStatus === 'reconnecting') {
      setVisualizerState('connecting');
    } else if (connectionStatus === 'connected') {
      // If we have active audio sources, the model is speaking
      if (sourcesRef.current.size > 0) {
        setVisualizerState('speaking');
      } else {
        // Otherwise, we are listening/thinking
        setVisualizerState('listening');
      }
    }
  }, [connectionStatus, sourcesRef.current.size]);

  // Force re-render of visualizer when audio sources change
  const [, setForceUpdate] = useState(0);

  // Helper to calculate RMS (Volume)
  const calculateRMS = (inputData: Float32Array): number => {
    let sum = 0;
    for (let i = 0; i < inputData.length; i++) {
      sum += inputData[i] * inputData[i];
    }
    return Math.sqrt(sum / inputData.length);
  };

  const resetIdleTimer = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      console.log("Idle timeout reached - closing session");
      if (!isUserDisconnectingRef.current) {
        setErrorMsg("Session ended due to inactivity.");
      }
      stopLiveSession(false);
    }, IDLE_TIMEOUT_MS);
  };

  // --- Live API Implementation ---

  const startLiveSession = async () => {
    if (isLiveActive) return;

    // 0. Safety Checks
    if (!process.env.API_KEY) {
      setErrorMsg("Missing API Key. Please configure process.env.API_KEY.");
      return;
    }

    setErrorMsg(null);
    setConnectionStatus('connecting');
    setIsLiveActive(true);
    isUserDisconnectingRef.current = false;
    lastSpeechTimeRef.current = Date.now(); // Reset speech timer
    resetIdleTimer();

    try {
      // 1. Initialize Audio Contexts
      inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      // CRITICAL: Resume audio context immediately on user gesture
      if (outputContextRef.current.state === 'suspended') {
        await outputContextRef.current.resume();
      }

      // --- KEEP-ALIVE ---
      keepAliveIntervalRef.current = setInterval(() => {
        if (outputContextRef.current && outputContextRef.current.state === 'running') {
          const osc = outputContextRef.current.createOscillator();
          const gain = outputContextRef.current.createGain();
          osc.connect(gain);
          gain.connect(outputContextRef.current.destination);
          osc.frequency.value = 440; 
          gain.gain.value = 0; // Completely silent
          osc.start();
          osc.stop(outputContextRef.current.currentTime + 0.01);
        }
      }, 4000);

      // 2. Get Microphone Stream (With specific error handling)
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      } catch (e: any) {
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          throw new Error("Microphone access denied. Please check browser permissions.");
        }
        throw e;
      }

      // 3. Connect to Gemini Live API
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const configObj: any = {
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: EMMA_VOICE_CONFIG.modelVoice } },
          },
          systemInstruction: getSystemInstruction(),
        },
      };

      if (config.sitemapUrl) {
         configObj.config.tools = [{ googleSearch: {} }];
      }

      const sessionPromise = ai.live.connect({
        ...configObj,
        callbacks: {
          onopen: () => {
            console.log('Session opened');
            setConnectionStatus('connected');
            
            // 1. TRIGGER GREETING IMMEDIATELY
            sessionPromise.then((session: any) => {
              session.sendRealtimeInput({
                content: [
                  { text: "Speak with a strong British accent. Say exactly: 'Hi, how can I help you?'" }
                ]
              });
            });

            // 2. DELAY MICROPHONE STREAMING
            setTimeout(() => {
              if (!inputContextRef.current || !streamRef.current) return;
              if (isUserDisconnectingRef.current) return; 

              const source = inputContextRef.current.createMediaStreamSource(streamRef.current);
              const processor = inputContextRef.current.createScriptProcessor(4096, 1, 1);
              scriptProcessorRef.current = processor;

              processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                
                // --- COST OPTIMIZATION: VAD ---
                const rms = calculateRMS(inputData);
                const now = Date.now();

                // Check if user is speaking
                if (rms > SILENCE_THRESHOLD) {
                  lastSpeechTimeRef.current = now;
                  resetIdleTimer(); // Reset disconnect timer if speaking
                }

                // Send audio if speaking OR within hangover period
                if (now - lastSpeechTimeRef.current < SPEECH_HANGOVER_MS) {
                    const pcmBlob = createBlob(inputData);
                    sessionPromise.then((session: any) => {
                      try {
                        session.sendRealtimeInput({ media: pcmBlob });
                      } catch (e) {
                        console.error("Error sending audio:", e);
                      }
                    });
                }
                // Else: Do not send (save API tokens)
              };

              source.connect(processor);
              processor.connect(inputContextRef.current.destination);
            }, 800); 
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && outputContextRef.current) {
              // If model speaks, also reset idle timer so we don't cut off during long answers
              resetIdleTimer();
              
              const ctx = outputContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              try {
                const audioBuffer = await decodeAudioData(decode(base64Audio), ctx);
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(ctx.destination);
                
                source.addEventListener('ended', () => {
                   sourcesRef.current.delete(source);
                   setForceUpdate(prev => prev + 1);
                });

                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
                setForceUpdate(prev => prev + 1);
              } catch (err) {
                console.error("Audio decode error:", err);
              }
            }

             const groundingChunks = message.serverContent?.groundingMetadata?.groundingChunks;
             if (groundingChunks && groundingChunks.length > 0) {
                 const newSources: { title: string; uri: string }[] = [];
                 groundingChunks.forEach((chunk: any) => {
                    if (chunk.web?.uri) {
                        newSources.push({ title: chunk.web.title || 'Source', uri: chunk.web.uri });
                    }
                 });
                 if (newSources.length > 0) {
                     setMessages(prev => {
                        const lastMsg = prev[prev.length - 1];
                        if (lastMsg && lastMsg.role === 'model') {
                            const updatedMsg = { ...lastMsg, sources: newSources };
                            return [...prev.slice(0, -1), updatedMsg];
                        }
                        return prev;
                     })
                 }
             }

            if (message.serverContent?.turnComplete) {
              // Turn complete
            }
          },
          onclose: (e) => {
            console.log('Session closed', e);
            if (!isUserDisconnectingRef.current) {
              setErrorMsg("Session timed out. Please resume.");
            }
            stopLiveSession(false); 
          },
          onerror: (err: any) => {
            console.error('Session error:', err);
            const msg = err.message || "Connection interrupted";
            setErrorMsg(`Session Error: ${msg}`);
            stopLiveSession(false);
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;

    } catch (error: any) {
      console.error("Failed to start live session:", error);
      setConnectionStatus('disconnected');
      setIsLiveActive(false);
      setErrorMsg(`Connection failed: ${error.message || "Unknown error"}`);
    }
  };

  const stopLiveSession = (userInitiated: boolean = true) => {
    if (userInitiated) {
        isUserDisconnectingRef.current = true;
        setErrorMsg(null);
    }

    setIsLiveActive(false);
    setConnectionStatus('disconnected');

    // Clean up timers
    if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
        keepAliveIntervalRef.current = null;
    }
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }

    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then((session: any) => {
        try { session.close(); } catch(e) {}
      });
      sessionPromiseRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }

    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    if (inputContextRef.current) {
      inputContextRef.current.close();
      inputContextRef.current = null;
    }
    if (outputContextRef.current) {
      outputContextRef.current.close();
      outputContextRef.current = null;
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isLoading) return;

    if (!process.env.API_KEY) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(), role: 'model', text: "Error: Missing API Key.", timestamp: new Date()
      }]);
      return;
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: inputText,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const tools: any[] = [];
      if (config.sitemapUrl) {
        tools.push({ googleSearch: {} });
      }

      const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
          systemInstruction: getSystemInstruction(),
          tools: tools.length > 0 ? tools : undefined,
        },
        history: messages.map(m => ({
             role: m.role,
             parts: [{ text: m.text }]
         })),
      });

      const response = await chat.sendMessage({ message: userMsg.text });
      const text = response.text;
      
      let sources: { title: string; uri: string }[] = [];
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (groundingChunks) {
          groundingChunks.forEach((chunk: any) => {
              if (chunk.web?.uri) {
                  sources.push({ title: chunk.web.title || 'Source', uri: chunk.web.uri });
              }
          });
      }

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: text || "I didn't get that.",
        timestamp: new Date(),
        sources: sources.length > 0 ? sources : undefined
      }]);
    } catch (error: any) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: `Error: ${error.message || "Could not connect to AI."}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusText = () => {
    if (visualizerState === 'connecting') return 'Connecting to Emma...';
    if (visualizerState === 'speaking') return 'Emma is speaking...';
    return 'Emma is listening...';
  };

  return (
    <div className="w-full max-w-md mx-auto font-sans">
      
      {/* Main Card */}
      <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 relative transition-all duration-300">
        
        {/* Header */}
        <div className="p-6 pb-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
              <h1 className="text-xl font-bold text-slate-800">{config.businessName}</h1>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-md">
            <Sparkles size={12} className="text-blue-500" />
            <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Powered by Gemini</span>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 pt-2">
          
          {/* Status Display / Visualizer */}
          <div className="bg-slate-50 rounded-2xl p-8 mb-6 border border-slate-100 min-h-[200px] flex flex-col items-center justify-center text-center transition-all relative overflow-hidden">
            {isLiveActive ? (
              <div className="w-full flex flex-col items-center animate-in fade-in duration-500 relative z-10">
                
                {/* Background Glow Animation */}
                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-100/50 rounded-full blur-3xl -z-10 ${visualizerState === 'listening' ? 'animate-pulse-slow' : 'opacity-0'}`} />

                <div className="text-sm font-semibold text-blue-600 mb-4 uppercase tracking-widest">
                   {visualizerState === 'connecting' ? 'Connecting' : 'Live Voice Session'}
                </div>
                
                <LiveVoiceVisualizer state={visualizerState} />
                
                <p className="mt-6 text-slate-500 text-sm transition-opacity duration-300 animate-pulse">
                  {getStatusText()}
                </p>
              </div>
            ) : (
              <div className="text-center space-y-3 animate-in slide-in-from-bottom-2 duration-500">
                {errorMsg ? (
                  <div className="text-red-500 flex flex-col items-center gap-2 mb-2 px-2">
                    <AlertCircle size={32} />
                    <span className="text-sm font-semibold">{errorMsg}</span>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-700">Ready to connect</h3>
                    <p className="text-slate-400 text-sm">Ask about our {config.services.split(',')[0].toLowerCase()}...</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Action Area */}
          <div className="space-y-4">
            
            {!isLiveActive ? (
              <>
                <button 
                  onClick={startLiveSession}
                  className="w-full group relative overflow-hidden bg-blue-900 hover:bg-blue-500 text-white rounded-2xl p-4 transition-all duration-300 shadow-lg hover:shadow-blue-200 hover:-translate-y-0.5"
                >
                  <div className="relative z-10 flex items-center justify-center gap-4">
                    <div className="p-2 bg-white/10 rounded-xl group-hover:scale-110 transition-transform">
                      {errorMsg ? <RefreshCw size={28} className="text-white" /> : <MessageCircle size={28} className="fill-current text-white" />}
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-lg leading-tight">{errorMsg ? "Resume Call" : "Chat with Emma"}</div>
                      <div className="text-xs text-blue-100 opacity-90 font-medium">
                        {errorMsg ? "Click to reconnect" : "Instant replies - no waiting"}
                      </div>
                    </div>
                  </div>
                </button>

                 <div className="flex items-center justify-center gap-2">
                    <div className="h-px bg-slate-100 flex-1" />
                    <button 
                      onClick={() => setShowTextInput(!showTextInput)}
                      className="text-xs font-medium text-slate-400 hover:text-slate-600 flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-slate-50 transition-colors"
                    >
                      <Keyboard size={14} />
                      {showTextInput ? 'Hide keyboard' : 'Type instead'}
                    </button>
                    <div className="h-px bg-slate-100 flex-1" />
                 </div>
              </>
            ) : (
              <button 
                onClick={() => stopLiveSession(true)}
                className="w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-xl p-4 font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <PhoneOff size={20} />
                End Call
              </button>
            )}

            {/* Text Input Fallback */}
            {showTextInput && !isLiveActive && (
              <form onSubmit={handleSendMessage} className="animate-in slide-in-from-top-2">
                <div className="relative">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Type a message..."
                    className="w-full p-4 pr-12 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 shadow-sm"
                    autoFocus
                  />
                  <button 
                    type="submit"
                    disabled={!inputText.trim() || isLoading}
                    className="absolute right-3 top-3 p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                     <ExternalLink size={18} />
                  </button>
                </div>
                {/* Chat History */}
                <div className="mt-4 max-h-40 overflow-y-auto space-y-3 scrollbar-hide">
                  {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                       <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                         msg.role === 'user' 
                           ? 'bg-blue-600 text-white rounded-br-none' 
                           : 'bg-slate-100 text-slate-700 rounded-bl-none'
                       }`}>
                         {msg.text}
                         {msg.sources && (
                           <div className="mt-2 pt-2 border-t border-slate-200/50 flex flex-wrap gap-2">
                             {msg.sources.map((src, idx) => (
                               <a 
                                 key={idx} 
                                 href={src.uri} 
                                 target="_blank" 
                                 rel="noreferrer"
                                 className="text-xs flex items-center gap-1 opacity-70 hover:opacity-100 hover:underline"
                               >
                                 <ExternalLink size={10} />
                                 {src.title}
                               </a>
                             ))}
                           </div>
                         )}
                       </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-slate-50 p-3 rounded-2xl rounded-bl-none text-slate-400 text-xs flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </form>
            )}

          </div>

          {/* Footer Prompts & Version */}
          {!isLiveActive && !showTextInput && (
             <div className="mt-8">
               <p className="text-center text-xs font-semibold text-slate-400 mb-3">Try asking:</p>
               <div className="flex flex-wrap justify-center gap-2 mb-4">
                  <button className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs rounded-lg transition-colors border border-slate-100">
                    "How much for {config.services.split(',')[0].trim()}?"
                  </button>
                  <button className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs rounded-lg transition-colors border border-slate-100">
                    "Are you available today?"
                  </button>
               </div>
               <div className="text-center">
                 <span className="text-[10px] text-slate-300 font-mono">v1.2</span>
               </div>
             </div>
          )}
        </div>
      </div>
      
    </div>
  );
};

export default ChatWidget;