// Index.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation, Routes, Route } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { TabContent } from '../components/TabContent';
import { useAuth } from '../hooks/useAuth';
import { useAppData } from '../hooks/useAppData';
import { useAppOperations } from '../hooks/useAppOperations';
import { Button } from '../components/ui/button';
import { LogOut, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Message } from '../types/Class'; // Assuming Message type is here
import { Document as AppDocument, UserProfile } from '../types/Document';
import { Note } from '../types/Note';
import { User } from '@supabase/supabase-js'; // Import User type
import { generateId } from '@/utils/helpers'; // Assuming this is where generateId comes from

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  document_ids: string[];
  message_count?: number;
}

// Pagination constants
const CHAT_SESSIONS_PER_PAGE = 10;
const CHAT_MESSAGES_PER_PAGE = 20; // Load 20 messages at a time

const Index = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Theme state
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(() => {
    // Initialize theme from localStorage or default to 'dark'
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark';
    }
    return 'dark';
  });

  // Effect to apply theme class to HTML element
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const html = document.documentElement;
      if (currentTheme === 'dark') {
        html.classList.add('dark');
      } else {
        html.classList.remove('dark');
      }
      localStorage.setItem('theme', currentTheme); // Persist theme
    }
  }, [currentTheme]);

  const handleThemeChange = useCallback((theme: 'light' | 'dark') => {
    setCurrentTheme(theme);
  }, []);

  const {
    notes,
    recordings,
    scheduleItems,
    chatMessages,
    documents, // Get documents from useAppData
    userProfile,
    activeNote,
    searchQuery,
    selectedCategory,
    isSidebarOpen,
    isAILoading,
    filteredNotes,
    loading: dataLoading,
    setNotes,
    setRecordings,
    setScheduleItems,
    setChatMessages,
    setDocuments, // Get setDocuments from useAppData
    setUserProfile,
    setActiveNote,
    setSearchQuery,
    setSelectedCategory,
    setIsSidebarOpen,
    setActiveTab,
    setIsAILoading,
    loadUserData,
  } = useAppData();

  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [isNotesHistoryOpen, setIsNotesHistoryOpen] = useState(false);
  const [isSubmittingUserMessage, setIsSubmittingUserMessage] = useState(false); // State to prevent double submission

  // Pagination states for chat sessions
  const [chatSessionsLoadedCount, setChatSessionsLoadedCount] = useState(CHAT_SESSIONS_PER_PAGE);
  const [hasMoreChatSessions, setHasMoreChatSessions] = useState(true);

  // Pagination states for chat messages (per session)
  const [hasMoreMessages, setHasMoreMessages] = useState(true); // Tracks if more messages can be loaded for the active session

  // Derive activeTab from URL pathname
  const currentActiveTab = useMemo(() => {
    const path = location.pathname.split('/')[1];
    switch (path) {
      case 'notes': return 'notes';
      case 'recordings': return 'recordings';
      case 'schedule': return 'schedule';
      case 'chat': return 'chat';
      case 'documents': return 'documents';
      case 'settings': return 'settings';
      default: return 'notes';
    }
  }, [location.pathname]);

  useEffect(() => {
    setActiveTab(currentActiveTab);
  }, [currentActiveTab, setActiveTab]);

  const loadChatSessions = useCallback(async () => {
    try {
      if (!user) return;

      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false })
        .range(0, chatSessionsLoadedCount - 1); // Fetch up to chatSessionsLoadedCount

      if (error) throw error;

      const formattedSessions: ChatSession[] = data.map(session => ({
        id: session.id,
        title: session.title,
        created_at: session.created_at,
        updated_at: session.updated_at,
        last_message_at: session.last_message_at,
        document_ids: session.document_ids || [],
      }));

      setChatSessions(formattedSessions);
      setHasMoreChatSessions(formattedSessions.length === chatSessionsLoadedCount); // Check if more sessions exist
    } catch (error) {
      console.error('Error loading chat sessions:', error);
      toast.error('Failed to load chat sessions.');
    }
  }, [user, setChatSessions, chatSessionsLoadedCount]);

  const handleLoadMoreChatSessions = useCallback(() => {
    setChatSessionsLoadedCount(prevCount => prevCount + CHAT_SESSIONS_PER_PAGE);
  }, []);

  const loadSessionMessages = useCallback(async (sessionId: string) => {
    try {
      if (!user) return;

      // Fetch the latest N messages initially
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('timestamp', { ascending: false }) // Get most recent messages first
        .limit(CHAT_MESSAGES_PER_PAGE);

      if (error) throw error;

      const formattedMessages: Message[] = data.map((msg: any) => ({ // Cast msg to any for direct Supabase property access
        id: msg.id,
        content: msg.content,
        role: msg.role as 'user' | 'assistant',
        timestamp: msg.timestamp || new Date().toISOString(),
        isError: msg.is_error || false, // Ensure isError is populated
        // Corrected property names from snake_case to camelCase for Message interface
        attachedDocumentIds: msg.attached_document_ids || [],
        attachedNoteIds: msg.attached_note_ids || [],
        imageUrl: msg.image_url || undefined,
        imageMimeType: msg.image_mime_type || undefined,
      })).reverse(); // Reverse to display oldest first

      setChatMessages(formattedMessages);
      setHasMoreMessages(data.length === CHAT_MESSAGES_PER_PAGE); // If we got exactly limit, there might be more
    } catch (error) {
      console.error('Error loading session messages:', error);
      setChatMessages([]);
      toast.error('Failed to load chat messages for this session.');
    }
  }, [user, setChatMessages]);

  const handleLoadOlderChatMessages = useCallback(async () => {
    if (!activeChatSessionId || !user || chatMessages.length === 0) return;

    const oldestMessageTimestamp = chatMessages[0].timestamp;

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', activeChatSessionId)
        .lt('timestamp', oldestMessageTimestamp) // Get messages older than the current oldest
        .order('timestamp', { ascending: false }) // Still order desc to get latest of older batch
        .limit(CHAT_MESSAGES_PER_PAGE);

      if (error) throw error;

      const olderMessages: Message[] = data.map((msg: any) => ({ // Cast msg to any
        id: msg.id,
        content: msg.content,
        role: msg.role as 'user' | 'assistant',
        timestamp: msg.timestamp || new Date().toISOString(),
        isError: msg.is_error || false,
        // Corrected property names from snake_case to camelCase for Message interface
        attachedDocumentIds: msg.attached_document_ids || [],
        attachedNoteIds: msg.attached_note_ids || [],
        imageUrl: msg.image_url || undefined,
        imageMimeType: msg.image_mime_type || undefined,
      })).reverse(); // Reverse to display oldest first

      setChatMessages(prevMessages => [...olderMessages, ...prevMessages]);
      setHasMoreMessages(data.length === CHAT_MESSAGES_PER_PAGE); // If we got exactly limit, there might be more
    } catch (error) {
      console.error('Error loading older messages:', error);
      toast.error('Failed to load older messages.');
    }
  }, [activeChatSessionId, user, chatMessages, setChatMessages]);


  useEffect(() => {
    if (user) {
      loadChatSessions();
    }
  }, [user, loadChatSessions, chatSessionsLoadedCount]); // Dependency on chatSessionsLoadedCount

  useEffect(() => {
    if (activeChatSessionId) {
      loadSessionMessages(activeChatSessionId);
    } else {
      setChatMessages([]);
      setHasMoreMessages(false); // No active session, no more messages
    }
  }, [activeChatSessionId, user, loadSessionMessages]);

  useEffect(() => {
    if (activeChatSessionId && chatSessions.length > 0) {
      const currentSession = chatSessions.find(s => s.id === activeChatSessionId);
      if (currentSession) {
        setSelectedDocumentIds(currentSession.document_ids || []);
      }
    } else if (!activeChatSessionId) {
      setSelectedDocumentIds([]);
    }
  }, [activeChatSessionId, chatSessions]);

  const createNewChatSession = useCallback(async (): Promise<string | null> => {
    console.log('createNewChatSession: Attempting to create new session...');
    try {
      if (!user) {
        console.log('createNewChatSession: User is null, cannot create session.');
        toast.error('Please sign in to create a new chat session.');
        return null;
      }
      console.log('createNewChatSession: User ID for new session:', user.id);

      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: user.id,
          title: 'New Chat',
          document_ids: selectedDocumentIds,
        })
        .select()
        .single();

      if (error) {
        console.error('createNewChatSession: Database error creating session:', error);
        throw error;
      }

      if (!data) {
        console.error('createNewChatSession: No data returned from session creation');
        throw new Error('No data returned from session creation');
      }

      const newSession: ChatSession = {
        id: data.id,
        title: data.title,
        created_at: data.created_at,
        updated_at: data.updated_at,
        last_message_at: data.last_message_at,
        document_ids: data.document_ids || [],
      };

      console.log('createNewChatSession: New session created with ID:', newSession.id);

      // Reset loaded count to ensure new session appears at top of list
      setChatSessionsLoadedCount(CHAT_SESSIONS_PER_PAGE);
      // Reload sessions to reflect the new session immediately
      await loadChatSessions();
      console.log('createNewChatSession: Chat sessions reloaded.');

      setActiveChatSessionId(newSession.id);
      setChatMessages([]);
      setHasMoreMessages(false); // New chat, no older messages yet
      console.log('createNewChatSession: Active chat session ID set to:', newSession.id);

      return newSession.id;
    } catch (error: any) {
      console.error('createNewChatSession: Error creating new session:', error);
      toast.error(`Failed to create new chat session: ${error.message || 'Unknown error'}`);
      return null;
    }
  }, [user, selectedDocumentIds, setChatSessionsLoadedCount, loadChatSessions, setActiveChatSessionId, setChatMessages]);

  const deleteChatSession = useCallback(async (sessionId: string) => {
    try {
      if (!user) return;

      const { error } = await supabase
        .from('chat_sessions')
        .delete()
        .eq('id', sessionId)
        .eq('user_id', user.id);

      if (error) throw error;

      // After deleting, reset loaded count and reload to ensure correct pagination
      setChatSessionsLoadedCount(CHAT_SESSIONS_PER_PAGE);
      await loadChatSessions();

      if (activeChatSessionId === sessionId) {
        if (chatSessions.length > 1) { // If there are other sessions, pick the most recent one
          const remainingSessions = chatSessions.filter(s => s.id !== sessionId);
          if (remainingSessions.length > 0) {
            const mostRecent = remainingSessions.sort((a, b) =>
              new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
            )[0];
            setActiveChatSessionId(mostRecent.id);
          } else {
            setActiveChatSessionId(null);
            setChatMessages([]);
            setHasMoreMessages(false);
          }
        } else { // If this was the last session
          setActiveChatSessionId(null);
          setChatMessages([]);
          setHasMoreMessages(false);
        }
      }

      toast.success('Chat session deleted.');
    } catch (error: any) {
      console.error('Error deleting session:', error);
      toast.error(`Failed to delete chat session: ${error.message || 'Unknown error'}`);
    }
  }, [user, chatSessions, activeChatSessionId, setChatSessionsLoadedCount, loadChatSessions, setActiveChatSessionId, setChatMessages]);

  const renameChatSession = useCallback(async (sessionId: string, newTitle: string) => {
    try {
      if (!user) return;

      const { error } = await supabase
        .from('chat_sessions')
        .update({ title: newTitle })
        .eq('id', sessionId)
        .eq('user_id', user.id);

      if (error) throw error;

      setChatSessions(prev =>
        prev.map(s => (s.id === sessionId ? { ...s, title: newTitle } : s))
      );
      toast.success('Chat session renamed.');
    } catch (error) {
      console.error('Error renaming session:', error);
      toast.error('Failed to rename chat session');
    }
  }, [user, setChatSessions]);

  // Updated buildRichContext to accept specific document and note IDs
  const buildRichContext = useCallback((
    documentIdsToInclude: string[],
    noteIdsToInclude: string[],
    allDocuments: AppDocument[],
    allNotes: Note[]
  ) => {
    const selectedDocs = (allDocuments ?? []).filter(doc => (documentIdsToInclude ?? []).includes(doc.id));
    const selectedNotes = (allNotes ?? []).filter(note => (noteIdsToInclude ?? []).includes(note.id));

    let context = '';

    if (selectedDocs.length > 0) {
      context += 'DOCUMENTS:\n';
      selectedDocs.forEach(doc => {
        context += `Title: ${doc.title}\n`;
        context += `File: ${doc.file_name}\n`;
        if (doc.type === 'image') {
            context += `Type: Image\n`;
        } else if (doc.type === 'text') {
            context += `Type: Text Document\n`;
        }
        // IMPORTANT: For image documents, use content_extracted if available
        if (doc.type === 'image' && doc.content_extracted) {
            const content = doc.content_extracted.length > 2000
                ? doc.content_extracted.substring(0, 2000) + '...'
                : doc.content_extracted;
            context += `Content (Image Description): ${content}\n`;
        } else if (doc.content_extracted) { // For text documents
          const content = doc.content_extracted.length > 2000
            ? doc.content_extracted.substring(0, 2000) + '...'
            : doc.content_extracted;
          context += `Content: ${content}\n`;
        } else {
            if (doc.type === 'image' && doc.processing_status !== 'completed') {
                context += `Content: Image processing ${doc.processing_status || 'pending'}. No extracted text yet.\n`;
            } else if (doc.type === 'image' && doc.processing_status === 'completed' && !doc.content_extracted) {
                context += `Content: Image analysis completed, but no text or detailed description was extracted.\n`;
            } else {
                context += `Content: No content extracted or available.\n`;
            }
        }
        context += '\n';
      });
    }

    if (selectedNotes.length > 0) {
      context += 'NOTES:\n';
      selectedNotes.forEach(note => {
        context += `Title: ${note.title}\n`;
        context += `Category: ${note.category}\n`;
        if (note.content) {
          const content = note.content.length > 1500
            ? note.content.substring(0, 1500) + '...'
            : note.content;
          context += `Content: ${content}\n`;
        }
        if (note.aiSummary) {
          context += `AI Summary: ${note.aiSummary}\n`;
        }
        if ((note.tags ?? []).length > 0) {
          context += `Tags: ${(note.tags ?? []).join(', ')}\n`;
        }
        context += '\n';
      });
    }
    console.log("Generated Context:", context);
    return context;
  }, []);
  // Refresh a single document and update state


  // Modified _getAIResponse to accept attached document and note IDs directly
  const _getAIResponse = useCallback(async (
    userMessageContent: string,
    currentUser: User,
    sessionId: string,
    attachedDocumentIds: string[], // New parameter
    attachedNoteIds: string[],     // New parameter
    aiMessageIdToUpdate: string | null = null,
    // NEW: Pass imageDataBase64 and imageMimeType to _getAIResponse
    imageDataBase64?: string,
    imageMimeType?: string,
  ) => {
    console.log('_getAIResponse: Called with currentUser:', currentUser?.id, 'sessionId:', sessionId);
    if (!currentUser || !sessionId) {
      console.error('_getAIResponse: Authentication or active session missing. currentUser:', currentUser, 'sessionId:', sessionId);
      toast.error('Authentication required or no active chat session.');
      return;
    }

    setIsAILoading(true);

    try {
      // Prepare chat history for AI, including inline image data for the *current* user message
      let chatHistory: Array<{ role: string; parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> }> = [];

      // Add previous messages to chat history, including attached document/note content for user messages
      const historicalMessages = (chatMessages || []).filter(msg => {
        if (aiMessageIdToUpdate && msg.id === aiMessageIdToUpdate) {
          return false; // Exclude the AI message that is being regenerated/retried
        }
        return true;
      });

      historicalMessages.forEach(msg => {
        if (msg.role === 'user') {
          const userParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: msg.content }];

          // Re-build context for historical user messages if they had attachments
          if (msg.attachedDocumentIds && msg.attachedDocumentIds.length > 0 || msg.attachedNoteIds && msg.attachedNoteIds.length > 0) {
            const historicalContext = buildRichContext(msg.attachedDocumentIds || [], msg.attachedNoteIds || [], documents, notes);
            if (historicalContext) {
              userParts.push({ text: `\n\nContext from previous attachments:\n${historicalContext}` });
            }
          }
          // Include historical image if available (though base64 data isn't persisted, URL is)
          // For Gemini, we typically need base64 data to "see" the image again.
          // If the image is critical for historical context, you'd need to re-fetch its base64 here.
          // For now, we rely on the text description generated by image analysis.
          chatHistory.push({ role: 'user', parts: userParts });
        } else if (msg.role === 'assistant') {
          chatHistory.push({ role: 'model', parts: [{ text: msg.content }] });
        }
      });

      // Add the current user message (and image if present) as the last turn.
      const currentUserParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
      if (userMessageContent) {
        currentUserParts.push({
          text: userMessageContent
        });
      }

      // Only include inlineData if imageDataBase64 is provided for the *current* turn
      if (imageDataBase64 && imageMimeType) {
        // Extract the base64 string part from the data URL (e.g., "data:image/png;base64,iVBORw...")
        const base64Data = imageDataBase64.split(',')[1];
        currentUserParts.push({
          inlineData: {
            mimeType: imageMimeType,
            data: base64Data
          }
        });
      }

      chatHistory.push({
        role: 'user',
        parts: currentUserParts.map(part => {
          if (part.text) {
            return { text: part.text };
          } else if (part.inlineData) {
            return { inlineData: part.inlineData };
          }
          throw new Error('Invalid part structure');
        }),
      });


      console.log('_getAIResponse: Invoking gemini-chat function...');
      const { data, error } = await supabase.functions.invoke('gemini-chat', {
        body: {
          // No longer sending 'message' and 'context' as top-level params,
          // as they are now integrated into chatHistory for better context management.
          userId: currentUser.id,
          sessionId: sessionId,
          learningStyle: userProfile?.learning_style || 'visual',
          learningPreferences: userProfile?.learning_preferences || {
            explanation_style: userProfile?.learning_preferences?.explanation_style || 'detailed',
            examples: userProfile?.learning_preferences?.examples || false,
            difficulty: userProfile?.learning_preferences?.difficulty || 'intermediate',
          },
          chatHistory: chatHistory, // Pass the prepared chat history
          // attachedDocumentIds and attachedNoteIds are now part of chatHistory for historical messages,
          // and for the current message, their content is handled by buildRichContext within this function.
          // So, they don't need to be passed as separate top-level parameters to the Edge Function anymore.
        },
      });

      if (error) {
        console.error('_getAIResponse: AI service error:', error);
        throw new Error(`AI service error: ${error.message}`);
      }

      const aiResponseContent = data.response;
      if (!aiResponseContent) {
        console.error('_getAIResponse: Empty response from AI service');
        throw new Error('Empty response from AI service');
      }

      console.log('_getAIResponse: AI response received. Content length:', aiResponseContent.length);

      if (aiMessageIdToUpdate) {
        console.log('_getAIResponse: Updating existing AI message with ID:', aiMessageIdToUpdate);
        const { error: updateDbError } = await supabase
          .from('chat_messages')
          .update({
            content: aiResponseContent,
            timestamp: new Date().toISOString(),
            is_error: false,
          })
          .eq('id', aiMessageIdToUpdate)
          .eq('session_id', sessionId);

        if (updateDbError) {
          console.error('_getAIResponse: Error updating AI message:', updateDbError);
          throw new Error('Failed to save AI response');
        }
        console.log('_getAIResponse: AI message updated in DB.');

        setChatMessages(prev =>
          prev.map(msg =>
            msg.id === aiMessageIdToUpdate
              ? { ...msg, content: aiResponseContent, timestamp: new Date().toISOString(), isError: false }
              : msg // Corrected: Removed the duplicate ": msg"
          )
        );
      } else {
        console.log('_getAIResponse: Inserting new AI message...');
        const { data: newAiMessageData, error: insertDbError } = await supabase
          .from('chat_messages')
          .insert({
            session_id: sessionId,
            user_id: currentUser.id,
            content: aiResponseContent,
            role: 'assistant',
            timestamp: new Date().toISOString(),
            is_error: false,
          })
          .select()
          .single();

        if (insertDbError) {
          console.error('_getAIResponse: Error inserting AI message:', insertDbError);
          throw new Error('Failed to save AI response');
        }
        console.log('_getAIResponse: New AI message inserted with ID:', newAiMessageData?.id);

        const newAiMessage: Message = {
          id: newAiMessageData?.id || crypto.randomUUID(),
          content: aiResponseContent,
          role: 'assistant',
          timestamp: newAiMessageData?.timestamp || new Date().toISOString(),
          isError: false,
        };
        setChatMessages(prev => [...(prev || []), newAiMessage]);
      }

      console.log('_getAIResponse: Updating chat session last_message_at...');
      const { error: updateSessionError } = await supabase
        .from('chat_sessions')
        .update({
          last_message_at: new Date().toISOString(),
          document_ids: attachedDocumentIds, // Update session with the documents used for this message
        })
        .eq('id', sessionId);

      if (updateSessionError) {
        console.error('_getAIResponse: Error updating session:', updateSessionError);
      }
      console.log('_getAIResponse: Chat session updated.');

      setChatSessions(prev => {
        const updated = prev.map(session =>
          session.id === sessionId
            ? { ...session, last_message_at: new Date().toISOString(), document_ids: attachedDocumentIds }
            : session
        );
        return updated.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
      });
    } catch (error: any) {
      console.error('_getAIResponse: Caught error:', error);
      toast.error(`Failed to get AI response: ${error.message || 'Unknown error'}`);

      if (aiMessageIdToUpdate) {
        setChatMessages(prev =>
          prev.map(msg =>
            msg.id === aiMessageIdToUpdate
              ? {
                  ...msg,
                  content: `Failed to regenerate response: ${error.message || 'Unknown error'}. Please try again.`,
                  isError: true,
                  timestamp: new Date().toISOString(),
                }
              : msg
          )
        );
      } else {
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `I'm sorry, I couldn't generate a response: ${error.message || 'Unknown error'}. Please try again.`,
          timestamp: new Date().toISOString(),
          isError: true,
          originalUserMessageContent: userMessageContent,
        };
        setChatMessages(prev => [...(prev || []), errorMessage]);
      }
    } finally {
      setIsAILoading(false);
      console.log('_getAIResponse: Finished, isAILoading set to false.');
    }
  }, [setIsAILoading, buildRichContext, documents, notes, chatMessages, userProfile, setChatMessages, setChatSessions]);

  const validateActiveSession = useCallback(async (): Promise<boolean> => {
    if (!activeChatSessionId) {
      console.log('validateActiveSession: No activeChatSessionId, returning false.');
      return false;
    }

    try {
      console.log('validateActiveSession: Checking session ID:', activeChatSessionId, 'for user:', user?.id);
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('id', activeChatSessionId)
        .eq('user_id', user?.id)
        .single();

      if (error || !data) {
        console.log('validateActiveSession: Active session no longer exists or unauthorized. Error:', error);
        setActiveChatSessionId(null);
        setChatMessages([]);
        setHasMoreMessages(false); // No active session, no more messages
        return false;
      }
      console.log('validateActiveSession: Session is valid.');
      return true;
    } catch (error) {
      console.error('validateActiveSession: Error validating session:', error);
      return false;
    }
  }, [activeChatSessionId, user, setActiveChatSessionId, setChatMessages]);

  // FIX: Added explicit type casting for processing_error and processing_status
  const refreshUploadedDocument = async (docId: string) => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', docId)
      .single();
  
    if (error) {
      console.error('Failed to refresh uploaded document:', error.message);
      return null;
    }
  
    // Explicitly convert String objects to primitive strings if they exist
    // This addresses the 'String' vs 'string' type incompatibility.
    const refreshedDocData: AppDocument = {
      ...(data as AppDocument), // Spread existing properties
      processing_error: typeof (data as any).processing_error === 'string'
        ? (data as any).processing_error
        : (data as any).processing_error?.toString() || undefined,
      processing_status: typeof (data as any).processing_status === 'string'
        ? (data as any).processing_status
        : (data as any).processing_status?.toString() || 'unknown', // Provide a default if conversion fails
    };

    setDocuments((prev) =>
      prev.map((doc) => (doc.id === docId ? refreshedDocData : doc))
    );
  
    return refreshedDocData; // Return the correctly typed data
  };
  
  
  // Modified handleSubmit to accept attachedDocumentIds and attachedNoteIds, and image data
  const handleSubmit = useCallback(async (
    messageContent: string,
    attachedDocumentIds?: string[],
    attachedNoteIds?: string[],
    imageUrl?: string, // Public URL for display
    imageMimeType?: string, // MIME type for image
    imageDataBase64?: string // Base64 data for AI consumption
  ) => {
    console.log('handleSubmit: Initiated with message:', messageContent, 'attached docs:', attachedDocumentIds, 'attached notes:', attachedNoteIds, 'imageUrl:', imageUrl ? 'present' : 'absent');
    console.log('handleSubmit: Current isAILoading:', isAILoading, 'isSubmittingUserMessage:', isSubmittingUserMessage);

    if (!messageContent.trim() && (!attachedDocumentIds || attachedDocumentIds.length === 0) && (!attachedNoteIds || attachedNoteIds.length === 0) && !imageUrl || isAILoading || isSubmittingUserMessage) {
      console.log('handleSubmit: Aborting due to empty message/no attachments/no image, AI loading, or already submitting.');
      return;
    }

    const trimmedMessage = messageContent.trim();
    setIsSubmittingUserMessage(true);
    console.log('handleSubmit: setIsSubmittingUserMessage set to true.');

    try {
      console.log('handleSubmit: Getting current user from Supabase auth...');
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        console.error('handleSubmit: No current user found after auth.getUser().');
        toast.error('You must be logged in to chat.');
        return;
      }
      console.log('handleSubmit: Current user found:', currentUser.id);

      let currentSessionId = activeChatSessionId;
      console.log('handleSubmit: Initial activeChatSessionId:', activeChatSessionId);

      if (!currentSessionId) {
        console.log('handleSubmit: No active session, creating new one...');
        currentSessionId = await createNewChatSession(); 
        if (!currentSessionId) {
          console.error('handleSubmit: Failed to create chat session.');
          toast.error('Failed to create chat session. Please try again.');
          return;
        }
        toast.info('New chat session created.');
        console.log('handleSubmit: New session ID after creation:', currentSessionId);
      }

      // Ensure attachedDocumentIds and attachedNoteIds are arrays, even if empty
      let finalAttachedDocumentIds = attachedDocumentIds || [];
      const finalAttachedNoteIds = attachedNoteIds || [];

      // If an image was just uploaded and has an ID, ensure its content_extracted is fresh
      // This is crucial for the AI to get the image description immediately
      if (imageUrl && finalAttachedDocumentIds.length > 0) {
        const imageDocId = finalAttachedDocumentIds.find(docId => {
            const doc = documents.find(d => d.id === docId);
            return doc && doc.type === 'image' && doc.file_url === imageUrl;
        });

        if (imageDocId) {
            console.log(`handleSubmit: Refreshing document with ID ${imageDocId} to ensure latest content_extracted.`);
            const refreshedDoc = await refreshUploadedDocument(imageDocId);
            if (refreshedDoc) {
                // The refreshUploadedDocument already updates the state via setDocuments.
                // We just need to ensure the 'documents' state is fully updated before buildRichContext is called.
                // Since setDocuments is asynchronous, we rely on React's batching or the next render cycle.
                // For immediate use, we might need to pass the refreshedDoc directly to buildRichContext
                // or ensure 'documents' in useAppData is reactive to this change.
                // Given buildRichContext is called inside _getAIResponse, and _getAIResponse is awaited,
                // the state should be consistent by then if useAppData's documents state is correctly updated.
                console.log(`handleSubmit: Document ${imageDocId} refreshed and state updated.`);
            } else {
                console.warn(`handleSubmit: Failed to refresh document ${imageDocId}. AI might not get full image context.`);
            }
        }
      }

      // Update selectedDocumentIds state with the new attachments for UI display
      setSelectedDocumentIds(finalAttachedDocumentIds);

      console.log('handleSubmit: Proceeding with session ID:', currentSessionId);

      console.log('handleSubmit: Saving user message to DB...');
      const { data: userMessageData, error: userMessageError } = await supabase
        .from('chat_messages')
        .insert({
          session_id: currentSessionId,
          user_id: currentUser.id,
          content: trimmedMessage,
          role: 'user',
          timestamp: new Date().toISOString(),
          attached_document_ids: finalAttachedDocumentIds,
          attached_note_ids: finalAttachedNoteIds,
          image_url: imageUrl, // Save image URL to DB
          image_mime_type: imageMimeType, // Save image MIME type to DB
        })
        .select()
        .single();

      if (userMessageError) {
        console.error('handleSubmit: Error saving user message:', userMessageError);
        throw new Error('Failed to save your message');
      }
      console.log('handleSubmit: User message saved. Message ID:', userMessageData.id);

      const newUserMessage: Message = {
        id: (userMessageData as any).id, // Cast to any for Supabase snake_case access
        content: (userMessageData as any).content, // Cast to any
        role: (userMessageData as any).role as 'user', // Cast to any
        timestamp: (userMessageData as any).timestamp || new Date().toISOString(), // Cast to any
        attachedDocumentIds: (userMessageData as any).attached_document_ids || [], // Cast to any
        attachedNoteIds: (userMessageData as any).attached_note_ids || [], // Cast to any
        imageUrl: (userMessageData as any).image_url, // Use the URL saved to DB
        imageMimeType: (userMessageData as any).image_mime_type, // Use the MIME type saved to DB
      };
      setChatMessages(prev => [...(prev || []), newUserMessage]);
      console.log('handleSubmit: User message added to state.');

      console.log('handleSubmit: Calling _getAIResponse...');
      // Pass the specific attached IDs and image data to _getAIResponse
      await _getAIResponse(trimmedMessage, currentUser, currentSessionId, finalAttachedDocumentIds, finalAttachedNoteIds, null, imageDataBase64, imageMimeType);

      const { error: updateSessionDocsError } = await supabase
        .from('chat_sessions')
        .update({ document_ids: finalAttachedDocumentIds })
        .eq('id', currentSessionId);

      if (updateSessionDocsError) {
        console.error('handleSubmit: Error updating session document_ids:', updateSessionDocsError);
      }
      console.log('handleSubmit: _getAIResponse call completed.');

    } catch (error: any) {
      console.error('handleSubmit: Caught error:', error);
      toast.error(`Failed to send message: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSubmittingUserMessage(false);
      console.log('handleSubmit: setIsSubmittingUserMessage set to false.');
    }
  }, [isAILoading, activeChatSessionId, createNewChatSession, setChatMessages, _getAIResponse, isSubmittingUserMessage, documents, setSelectedDocumentIds, notes, refreshUploadedDocument, setDocuments]);

  const handleNewMessage = useCallback((message: Message) => {
    setChatMessages(prev => [...(prev || []), message]);
  }, [setChatMessages]);

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    try {
      if (!user || !activeChatSessionId) {
        toast.error('Authentication required or no active chat session.');
        return;
      }

      setChatMessages(prevMessages => (prevMessages || []).filter(msg => msg.id !== messageId));
      toast.info('Deleting message...');

      const { error } = await supabase
        .from('chat_messages')
        .delete()
        .eq('id', messageId)
        .eq('session_id', activeChatSessionId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error deleting message from DB:', error);
        toast.error('Failed to delete message from database.');
      } else {
        toast.success('Message deleted successfully.');
      }
    } catch (error: any) {
      console.error('Error in handleDeleteMessage:', error);
      toast.error(`Error deleting message: ${error.message || 'Unknown error'}`);
    }
  }, [user, activeChatSessionId, setChatMessages]);

  const handleRegenerateResponse = useCallback(async (lastUserMessageContent: string) => {
    if (!user || !activeChatSessionId) {
      toast.error('Authentication required or no active chat session.');
      return;
    }

    const lastAssistantMessage = chatMessages.slice().reverse().find(msg => msg.role === 'assistant');
    const lastUserMessage = chatMessages.slice().reverse().find(msg => msg.role === 'user');

    if (!lastUserMessage) {
      toast.info('No previous user message to regenerate from.');
      return;
    }

    if (!lastAssistantMessage) {
      toast.info('No previous AI message to regenerate.');
      return;
    }

    setChatMessages(prevMessages =>
      (prevMessages || []).map(msg =>
        msg.id === lastAssistantMessage.id
          ? { ...msg, content: 'AI is thinking...', timestamp: new Date().toISOString(), isError: false }
          : msg
      )
    );

    toast.info('Regenerating response...');

    // Pass the specific attached IDs from the last user message to _getAIResponse
    // Also pass image data if available for the last user message
    await _getAIResponse(
      lastUserMessageContent,
      user,
      activeChatSessionId,
      lastUserMessage.attachedDocumentIds || [],
      lastUserMessage.attachedNoteIds || [],
      lastAssistantMessage.id,
      // For regeneration, we don't have the base64 data readily available unless stored.
      // If the AI needs to "see" the image again, you'd need to re-fetch/convert it here.
      // For now, it relies on the text context and the image_url being present in the message history.
      undefined, // imageDataBase64
      undefined // imageMimeType
    );
  }, [user, activeChatSessionId, chatMessages, setChatMessages, _getAIResponse]);

  const handleRetryFailedMessage = useCallback(async (originalUserMessageContent: string, failedAiMessageId: string) => {
    if (!user || !activeChatSessionId) {
      toast.error('Authentication required or no active chat session.');
      return;
    }

    const lastUserMessage = chatMessages.slice().reverse().find(msg => msg.role === 'user' && msg.content === originalUserMessageContent);
    if (!lastUserMessage) {
      toast.error('Could not find original user message to retry.');
      return;
    }

    setChatMessages(prevMessages =>
      (prevMessages || []).map(msg =>
        msg.id === failedAiMessageId
          ? { ...msg, content: 'AI is thinking...', timestamp: new Date().toISOString(), isError: false }
          : msg
      )
    );

    toast.info('Retrying message...');

    // Pass the specific attached IDs from the original user message to _getAIResponse
    // Also pass image data if available for the original user message
    await _getAIResponse(
      originalUserMessageContent,
      user,
      activeChatSessionId,
      lastUserMessage.attachedDocumentIds || [],
      lastUserMessage.attachedNoteIds || [],
      failedAiMessageId,
      // For retry, similar to regeneration, we don't have the base64 data readily available.
      // If full image data is needed for retry, it would need to be re-fetched or stored.
      undefined, // imageDataBase64
      undefined // imageMimeType
    );
  }, [user, activeChatSessionId, chatMessages, setChatMessages, _getAIResponse]);

  const {
    createNewNote,
    updateNote,
    deleteNote,
    addRecording,
    generateQuiz,
    addScheduleItem,
    updateScheduleItem,
    deleteScheduleItem,
    handleDocumentUploaded,
    updateDocument, // Get the new updateDocument function
    handleDocumentDeleted,
    handleProfileUpdate,
  } = useAppOperations({
    notes,
    recordings,
    scheduleItems,
    chatMessages,
    documents, // Pass documents
    userProfile,
    activeNote,
    setNotes,
    setRecordings,
    setScheduleItems,
    setChatMessages,
    setDocuments, // Pass setDocuments
    setUserProfile,
    setActiveNote,
    setActiveTab,
    setIsAILoading,
  });

  // Memoize the onToggleSidebar and onCategoryChange functions
  const memoizedOnToggleSidebar = useCallback(() => setIsSidebarOpen(prev => !prev), [setIsSidebarOpen]);
  const memoizedOnCategoryChange = useCallback((category: string) => setSelectedCategory(category), [setSelectedCategory]);

  // Modified onTabChange to use navigate
  const memoizedOnTabChange = useCallback((tab: string) => {
    navigate(`/${tab}`); // Navigate to the new tab's URL
    setIsSidebarOpen(false); // Close sidebar on tab change for mobile
  }, [navigate, setIsSidebarOpen]);

  // Memoize the header props
  const headerProps = useMemo(() => ({
    searchQuery,
    onSearchChange: setSearchQuery,
    onNewNote: createNewNote,
    isSidebarOpen,
    onToggleSidebar: memoizedOnToggleSidebar,
    activeTab: currentActiveTab as 'notes' | 'recordings' | 'schedule' | 'chat' | 'documents' | 'settings', // Explicitly cast
  }), [searchQuery, setSearchQuery, createNewNote, isSidebarOpen, memoizedOnToggleSidebar, currentActiveTab]);

  // Memoize the sidebar props
  const sidebarProps = useMemo(() => ({
    isOpen: isSidebarOpen,
    onToggle: memoizedOnToggleSidebar,
    selectedCategory: selectedCategory,
    onCategoryChange: memoizedOnCategoryChange,
    noteCount: notes.length,
    activeTab: currentActiveTab as 'notes' | 'recordings' | 'schedule' | 'chat' | 'documents' | 'settings', // Explicitly cast
    onTabChange: memoizedOnTabChange,
    // Pass chat session props to Sidebar
    chatSessions: chatSessions,
    activeChatSessionId: activeChatSessionId,
    onChatSessionSelect: setActiveChatSessionId,
    onNewChatSession: createNewChatSession,
    onDeleteChatSession: deleteChatSession,
    onRenameChatSession: renameChatSession,
    hasMoreChatSessions: hasMoreChatSessions, // Pass pagination state
    onLoadMoreChatSessions: handleLoadMoreChatSessions, // Pass load more function
    // Pass theme props to Sidebar
    currentTheme: currentTheme,
    onThemeChange: handleThemeChange,
  }), [
    isSidebarOpen,
    memoizedOnToggleSidebar,
    selectedCategory,
    memoizedOnCategoryChange,
    notes.length,
    currentActiveTab,
    memoizedOnTabChange,
    chatSessions,
    activeChatSessionId,
    setActiveChatSessionId,
    createNewChatSession,
    deleteChatSession,
    renameChatSession,
    hasMoreChatSessions,
    handleLoadMoreChatSessions,
    currentTheme, // Add currentTheme to dependencies
    handleThemeChange, // Add handleThemeChange to dependencies
  ]);

  // Memoize the TabContent props
  const tabContentProps = useMemo(() => ({
    activeTab: currentActiveTab as 'notes' | 'recordings' | 'schedule' | 'chat' | 'documents' | 'settings', // Pass derived activeTab
    filteredNotes,
    activeNote,
    recordings: recordings ?? [],
    scheduleItems,
    chatMessages,
    documents,
    userProfile,
    isAILoading,
    setIsAILoading,
    onNoteSelect: setActiveNote,
    onNoteUpdate: updateNote,
    onNoteDelete: deleteNote,
    onAddRecording: addRecording,
    onGenerateQuiz: generateQuiz,
    onAddScheduleItem: addScheduleItem,
    onUpdateScheduleItem: updateScheduleItem,
    onDeleteScheduleItem: deleteScheduleItem,
    onSendMessage: handleSubmit, // This is where the updated handleSubmit is passed
    onDocumentUploaded: handleDocumentUploaded,
    onDocumentUpdated: updateDocument, // Pass the new updateDocument function
    onDocumentDeleted: handleDocumentDeleted,
    onProfileUpdate: handleProfileUpdate,
    chatSessions,
    activeChatSessionId,
    onChatSessionSelect: setActiveChatSessionId,
    onNewChatSession: createNewChatSession,
    onDeleteChatSession: deleteChatSession,
    onRenameChatSession: renameChatSession,
    onSelectedDocumentIdsChange: setSelectedDocumentIds,
    selectedDocumentIds: selectedDocumentIds,
    onNewMessage: handleNewMessage,
    isNotesHistoryOpen: isNotesHistoryOpen,
    onToggleNotesHistory: () => setIsNotesHistoryOpen(prev => !prev),
    onDeleteMessage: handleDeleteMessage,
    onRegenerateResponse: handleRegenerateResponse,
    isSubmittingUserMessage: isSubmittingUserMessage,
    onRetryFailedMessage: handleRetryFailedMessage,
    hasMoreMessages: hasMoreMessages, // Pass pagination state for messages
    onLoadOlderMessages: handleLoadOlderChatMessages, // Pass load older messages function
  }), [
    currentActiveTab,
    filteredNotes,
    activeNote,
    recordings,
    scheduleItems,
    chatMessages,
    documents,
    userProfile,
    isAILoading,
    setIsAILoading,
    setActiveNote,
    updateNote,
    deleteNote,
    addRecording,
    generateQuiz,
    addScheduleItem,
    updateScheduleItem,
    deleteScheduleItem,
    handleSubmit, // Ensure this is the updated handleSubmit
    handleDocumentUploaded,
    updateDocument, // Ensure updateDocument is in dependencies
    handleDocumentDeleted,
    handleProfileUpdate,
    chatSessions,
    activeChatSessionId,
    setActiveChatSessionId,
    createNewChatSession,
    deleteChatSession,
    renameChatSession,
    setSelectedDocumentIds, // This is now correctly handled
    selectedDocumentIds,
    handleNewMessage,
    isNotesHistoryOpen,
    handleDeleteMessage,
    handleRegenerateResponse,
    isSubmittingUserMessage,
    handleRetryFailedMessage,
    hasMoreMessages,
    handleLoadOlderChatMessages,
  ]);


  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
      toast.success('Signed out successfully');
      navigate('/auth');
    } catch (error) {
      toast.error('Error signing out');
    }
  }, [signOut, navigate]);

  console.log('Index recordings state:', recordings); // Debug log

  if (loading || dataLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-gray-800"> {/* Added dark mode */}
        <div className="text-center">
          <Sparkles className="h-12 w-12 text-blue-600 mx-auto mb-4 animate-spin" />
          <p className="text-slate-600 dark:text-gray-300">Loading your data...</p> {/* Added dark mode */}
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="h-screen flex  overflow-hidden">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div
        className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        fixed lg:relative inset-y-0 left-0 z-50 lg:z-auto
        transition-transform duration-300 ease-in-out`}
      >
        <Sidebar {...sidebarProps} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 lg:ml-0 bg-slate-50 dark:bg-gray-900"> {/* Added dark mode background */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b-0 shadow-none bg-transparent border-b-0 border-l-0 border-r-0 border-gray-200 dark:border-gray-700">
          <Header {...headerProps} />
          <div className="hidden sm:flex items-center gap-3">
            <span className="text-sm text-slate-600 hidden md:block dark:text-gray-300">Welcome, {user.email}</span> {/* Added dark mode */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="flex items-center gap-2 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700" 
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            className="sm:hidden dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700" 
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>

        {/* Use React Router Routes to render TabContent based on URL */}
        <Routes>
          <Route path="/notes" element={<TabContent {...tabContentProps} activeTab="notes" />} />
          <Route path="/recordings" element={<TabContent {...tabContentProps} activeTab="recordings" />} />
          <Route path="/schedule" element={<TabContent {...tabContentProps} activeTab="schedule" />} />
          <Route path="/chat" element={<TabContent {...tabContentProps} activeTab="chat" />} />
          <Route path="/documents" element={<TabContent {...tabContentProps} activeTab="documents" />} />
          <Route path="/settings" element={<TabContent {...tabContentProps} activeTab="settings" />} />
          {/* Default route, redirects to /notes */}
          <Route path="/" element={<TabContent {...tabContentProps} activeTab="notes" />} />
          <Route path="*" element={<TabContent {...tabContentProps} activeTab="notes" />} /> {/* Fallback for unknown paths */}
        </Routes>
      </div>
    </div>
  );
};

export default Index;
