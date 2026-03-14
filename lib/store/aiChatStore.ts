import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

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
    toggleChat: () => void;
    setChatOpen: (isOpen: boolean) => void;
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
                            id: uuidv4(),
                            role,
                            content,
                            timestamp: Date.now(),
                        },
                    ],
                })),

            clearMessages: () => set({ messages: [] }),

            toggleChat: () => set((state) => ({ isOpen: !state.isOpen })),

            setChatOpen: (isOpen: boolean) => set({ isOpen }),
        }),
        {
            name: 'trainer-ai-chat-storage', // key for localStorage
            partialize: (state) => ({ messages: state.messages }), // Persist only messages, not isOpen state
        }
    )
);
