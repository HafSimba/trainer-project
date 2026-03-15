'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, Send, Trash2, X } from 'lucide-react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAiChatStore } from '@/lib/store/aiChatStore';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const markdownComponents: Components = {
    p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-2 first:mt-0">{children}</h1>,
    h2: ({ children }) => <h2 className="text-[15px] font-semibold mt-3 mb-2 first:mt-0">{children}</h2>,
    h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
    ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 my-2">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 my-2">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-blue-300 pl-3 italic text-slate-600">{children}</blockquote>,
    hr: () => <hr className="my-3 border-slate-200" />,
    a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 underline break-all">
            {children}
        </a>
    ),
    pre: ({ children }) => (
        <pre className="my-3 overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 text-slate-100 text-xs leading-relaxed">
            {children}
        </pre>
    ),
    code: ({ className, children, ...props }) => {
        const raw = String(children ?? '').replace(/\n$/, '');
        const isBlock = raw.includes('\n') || Boolean(className?.includes('language-'));

        if (isBlock) {
            return (
                <code className={className} {...props}>
                    {raw}
                </code>
            );
        }

        return (
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[12px] text-slate-800" {...props}>
                {raw}
            </code>
        );
    },
    table: ({ children }) => (
        <div className="my-3 overflow-x-auto">
            <table className="min-w-full border border-slate-200 text-xs">{children}</table>
        </div>
    ),
    thead: ({ children }) => <thead className="bg-slate-100">{children}</thead>,
    th: ({ children }) => <th className="border border-slate-200 px-2 py-1 text-left font-semibold">{children}</th>,
    td: ({ children }) => <td className="border border-slate-200 px-2 py-1 align-top">{children}</td>,
};

export function AiChatSheet() {
    const { messages, isOpen, setChatOpen, addMessage, clearMessages } = useAiChatStore();
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesContainerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        const container = messagesContainerRef.current;
        if (!container) return;
        container.scrollTop = container.scrollHeight;
    }, [messages, isLoading, isOpen]);

    const handleSend = async () => {
        if (!inputValue.trim() || isLoading) return;

        const userMessage = inputValue.trim();
        setInputValue('');

        // Aggiunge il messaggio utente a Zustand
        addMessage('user', userMessage);
        setIsLoading(true);

        try {
            // Costruiamo lo storico corrente da inviare all'API
            const chatHistory = messages.map(msg => ({ role: msg.role, content: msg.content }));

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: [...chatHistory, { role: 'user', content: userMessage }]
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Errore nella rete');
            }

            // Aggiungiamo la risposta reale generata localmente
            addMessage('assistant', data.content);
        } catch (error) {
            console.error('Chat error:', error);
            addMessage('assistant', '⚠️ Impossibile contattare TrAIner in questo momento. Il tunnel locale è attivo?');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Sheet open={isOpen} onOpenChange={setChatOpen} modal={false}>
            <SheetTrigger
                render={
                    <Button
                        size="icon"
                        className="fixed bottom-20 right-4 h-12 w-12 rounded-full shadow-lg z-50 bg-blue-600 hover:bg-blue-700"
                    />
                }
            >
                <Bot className="h-5 w-5 text-white" />
            </SheetTrigger>

            <SheetContent
                side="right"
                hideOverlay
                showCloseButton={false}
                className="right-2 left-auto top-auto bottom-20 h-[72vh] w-[calc(100vw-1rem)] max-w-sm rounded-2xl border border-gray-200 p-0 shadow-2xl flex flex-col min-h-0"
            >
                <SheetHeader className="px-4 py-3 border-b flex flex-row items-center justify-between shadow-sm">
                    <SheetTitle className="flex items-center gap-2">
                        <Bot className="h-5 w-5 text-blue-600" />
                        TrAIner Assistant
                    </SheetTitle>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={clearMessages} title="Cancella chat">
                            <Trash2 className="h-4 w-4 text-gray-500 hover:text-red-500" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setChatOpen(false)} title="Chiudi chat">
                            <X className="h-4 w-4 text-gray-500" />
                        </Button>
                    </div>
                </SheetHeader>

                <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto p-4 bg-gray-50">
                    <div className="flex flex-col gap-4 pb-4">
                        {messages.length === 0 ? (
                            <div className="text-center text-gray-500 mt-10 text-sm">
                                Nessun messaggio. Chiedimi un consiglio su allenamento o nutrizione!
                            </div>
                        ) : (
                            messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div
                                        className={`rounded-2xl px-4 py-2 ${msg.role === 'user'
                                            ? 'max-w-[80%] bg-blue-600 text-white rounded-br-none'
                                            : 'max-w-[88%] bg-white border text-gray-800 rounded-bl-none shadow-sm'
                                            }`}
                                    >
                                        {msg.role === 'assistant' ? (
                                            <div className="text-[13px] sm:text-sm leading-6">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                                    {msg.content}
                                                </ReactMarkdown>
                                            </div>
                                        ) : (
                                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                        )}
                                        <p className="text-[10px] opacity-70 mt-1 text-right">
                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-white border text-gray-800 rounded-bl-none shadow-sm flex gap-1">
                                    <span className="animate-bounce">●</span>
                                    <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
                                    <span className="animate-bounce" style={{ animationDelay: '0.4s' }}>●</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-3 bg-white border-t flex gap-2">
                    <Input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Chiedi a TrAIner..."
                        className="flex-1 rounded-full bg-gray-100 border-none px-4 disabled:opacity-50"
                        disabled={isLoading}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSend();
                        }}
                    />
                    <Button size="icon" className="rounded-full bg-blue-600 hover:bg-blue-700 shrink-0" disabled={isLoading} onClick={handleSend}>
                        <Send className="h-4 w-4 text-white" />
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
