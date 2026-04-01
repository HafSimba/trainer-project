import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Role = 'user' | 'assistant' | 'system';

export interface ChatMessage {
    id: string;
    role: Role;
    content: string;
    timestamp: number;
}

interface AiChatState {
    messages: ChatMessage[];
    isOpen: boolean;
    addMessage: (role: Role, content: string) => void;
    clearMessages: () => void;
    setChatOpen: (isOpen: boolean) => void;
}

function createMessageId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const useAiChatStore = create<AiChatState>()(
    persist(
        (set) => ({
            messages: [],
            isOpen: false,

            addMessage: (role, content) =>
                set((state) => ({
                    messages: [
                        ...state.messages,
                        {
                            id: createMessageId(),
                            role,
                            content,
                            timestamp: Date.now(),
                        },
                    ],
                })),

            clearMessages: () => set({ messages: [] }),

            setChatOpen: (isOpen: boolean) => set({ isOpen }),
        }),
        {
            name: 'trainer-ai-chat-storage', // key for localStorage
            partialize: (state) => ({ messages: state.messages }), // Persist only messages, not isOpen state
        }
    )
);
