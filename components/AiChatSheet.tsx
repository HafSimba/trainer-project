'use client';

import { useState } from 'react';
import { Bot, Send, User, Trash2 } from 'lucide-react';
import { useAiChatStore } from '@/lib/store/aiChatStore';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function AiChatSheet() {
    const { messages, isOpen, setChatOpen, addMessage, clearMessages } = useAiChatStore();
    const [inputValue, setInputValue] = useState('');

    const handleSend = () => {
        if (!inputValue.trim()) return;

        // Add user message
        addMessage('user', inputValue.trim());

        // TODO: Connect to backend for real AI response
        // Simulated AI response for now
        setTimeout(() => {
            addMessage('assistant', `Ho ricevuto il tuo messaggio! Questa è una risposta simulata per: "${inputValue}"`);
        }, 1000);

        setInputValue('');
    };

    return (
        <Sheet open={isOpen} onOpenChange={setChatOpen}>
            <SheetTrigger
                render={
                    <Button
                        size="icon"
                        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 bg-blue-600 hover:bg-blue-700"
                    />
                }
            >
                <Bot className="h-6 w-6 text-white" />
            </SheetTrigger>

            <SheetContent side="bottom" className="h-[85vh] sm:max-w-md sm:mx-auto sm:right-auto sm:left-auto flex flex-col p-0 rounded-t-3xl">
                <SheetHeader className="px-6 py-4 border-b flex flex-row items-center justify-between shadow-sm">
                    <SheetTitle className="flex items-center gap-2">
                        <Bot className="h-5 w-5 text-blue-600" />
                        TrAIner Assistant
                    </SheetTitle>
                    <Button variant="ghost" size="icon" onClick={clearMessages} title="Cancella chat">
                        <Trash2 className="h-4 w-4 text-gray-500 hover:text-red-500" />
                    </Button>
                </SheetHeader>

                <ScrollArea className="flex-1 p-4 bg-gray-50">
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
                                        className={`max-w-[80%] rounded-2xl px-4 py-2 ${msg.role === 'user'
                                                ? 'bg-blue-600 text-white rounded-br-none'
                                                : 'bg-white border text-gray-800 rounded-bl-none shadow-sm'
                                            }`}
                                    >
                                        <p className="text-sm">{msg.content}</p>
                                        <p className="text-[10px] opacity-70 mt-1 text-right">
                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>

                <div className="p-4 bg-white border-t flex gap-2">
                    <Input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Chiedi a TrAIner..."
                        className="flex-1 rounded-full bg-gray-100 border-none px-4"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSend();
                        }}
                    />
                    <Button size="icon" className="rounded-full bg-blue-600 hover:bg-blue-700 shrink-0" onClick={handleSend}>
                        <Send className="h-4 w-4 text-white" />
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
