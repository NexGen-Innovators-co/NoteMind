// NoteEditor.tsx
import React, { useState, useEffect, useRef } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Note, NoteCategory, UserProfile } from '../types';
import { Database } from '../integrations/supabase/types';

// Import refactored components
import { NoteEditorHeader } from './NoteEditorHeader';
import { NoteContentArea } from './NoteContentArea';
import { AISummarySection } from './AISummarySection';
import { TranslatedContentSection } from './TranslatedContentSection';
import { AudioOptionsSection } from './AudioOptionsSection';

// Dialogs
import { SectionSelectionDialog } from './SectionSelectionDialog';
import { DocumentViewerDialog } from './DocumentViewerDialog';

// Explicitly type the supabase client for better type inference with custom tables
const typedSupabase = supabase as any;

declare global {
  interface Window {
    html2pdf: any;
  }
}

interface NoteEditorProps {
  note: Note;
  onNoteUpdate: (note: Note) => void;
  userProfile: UserProfile | null;
  onToggleNotesHistory?: () => void;
  isNotesHistoryOpen?: boolean;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  onNoteUpdate,
  userProfile,
  onToggleNotesHistory,
  isNotesHistoryOpen
}) => {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content); // This is the debounced content
  const [draftContent, setDraftContent] = useState(note.content); // This updates instantly from textarea
  const [category, setCategory] = useState<NoteCategory>(note.category);
  const [tags, setTags] = useState(note.tags.join(', '));
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(true);
  const [documentSections, setDocumentSections] = useState<string[]>([]);
  const [isSectionDialogOpen, setIsSectionDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedContent, setExtractedContent] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSummaryVisible, setIsSummaryVisible] = useState(true);

  const [isDocumentViewerOpen, setIsDocumentViewerOpen] = useState(false);
  const [originalDocumentContent, setOriginalDocumentContent] = useState<string | null>(null);
  const [originalDocumentFileType, setOriginalDocumentFileType] = useState<string | null>(null);
  const [originalDocumentFileUrl, setOriginalDocumentFileUrl] = useState<string | null>(null);
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);

  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState<string>('en');
  const [uploadedAudioDetails, setUploadedAudioDetails] = useState<{ url: string; type: string; name: string; } | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isAudioOptionsVisible, setIsAudioOptionsVisible] = useState(false);
  const [audioProcessingJobId, setAudioProcessingJobId] = useState<string | null>(null);
  const [isGeneratingAudioNote, setIsGeneratingAudioNote] = useState(false);
  const [isGeneratingAudioSummary, setIsGeneratingAudioSummary] = useState(false);
  const [isTranslatingAudio, setIsTranslatingAudio] = useState(false);

  const [uploadedDocumentPublicUrl, setUploadedDocumentPublicUrl] = useState<string | null>(null);
  const [documentIdForDialog, setDocumentIdForDialog] = useState<string | null>(null);

  // Debounce effect for content
  useEffect(() => {
    const handler = setTimeout(() => {
      setContent(draftContent);
    }, 500); // Debounce for 500ms

    return () => {
      clearTimeout(handler);
    };
  }, [draftContent]);

  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
    setDraftContent(note.content); // Reset draftContent when note changes
    setCategory(note.category);
    setTags(note.tags.join(', '));

    setTranslatedContent(null);
    setTargetLanguage('en');
    setUploadedAudioDetails(null);
    setIsAudioOptionsVisible(false);
    setAudioProcessingJobId(null);

    // Ensure speech is cancelled when note changes
    if ('speechSynthesis' in window && speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }
    setIsSpeaking(false);

    return () => {
      // Cleanup: cancel speech and pause audio on component unmount or note change
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
      }
    };
  }, [note]);

  useEffect(() => {
    const populateVoiceList = () => {
      if (typeof speechSynthesis === 'undefined') {
        return;
      }
      const availableVoices = speechSynthesis.getVoices();
      if (availableVoices.length > 0) {
        setVoices(availableVoices);
        // Only set a default if one isn't already selected or if the selected one is no longer available
        if (!selectedVoiceURI || !availableVoices.some(v => v.voiceURI === selectedVoiceURI)) {
          const defaultVoice = availableVoices.find(voice => voice.name.includes('Google') && voice.lang.startsWith('en')) ||
            availableVoices.find(voice => voice.lang.startsWith('en')) ||
            availableVoices[0];
          if (defaultVoice) {
            setSelectedVoiceURI(defaultVoice.voiceURI);
          }
        }
      } else {
        // If no voices are immediately available, try again after a short delay
        // This helps with async loading of voices on some browsers/platforms
        setTimeout(populateVoiceList, 500);
      }
    };

    // Populate voices initially
    populateVoiceList();
    // Listen for voice changes (e.g., after network voices load)
    if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = populateVoiceList;
    }
  }, [selectedVoiceURI]); // Add selectedVoiceURI to dependency array to re-evaluate if it changes externally

  // Polling effect for audio processing job
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    const pollJobStatus = async () => {
      if (!audioProcessingJobId || !userProfile) return;

      try {
        const { data, error } = await typedSupabase
          .from('audio_processing_results')
          .select('*')
          .eq('id', audioProcessingJobId)
          .eq('user_id', userProfile.id)
          .single();

        if (error) {
          throw new Error(`Failed to fetch job status: ${error.message}`);
        }

        if (data) {
          const audioResult = data as Database['public']['Tables']['audio_processing_results']['Row'];

          if (audioResult.status === 'completed') {
            toast.success('Audio processing completed!');
            setContent(audioResult.transcript || 'No transcription available.');
            setDraftContent(audioResult.transcript || 'No transcription available.');
            onNoteUpdate({
              ...note,
              content: audioResult.transcript || '',
              aiSummary: audioResult.summary || 'No summary available.',
              document_id: audioResult.document_id || null
            });
            setTranslatedContent(audioResult.translated_content || null);
            setAudioProcessingJobId(null);
            setIsProcessingAudio(false);
            setIsGeneratingAudioNote(false);
            setIsGeneratingAudioSummary(false);
            setIsTranslatingAudio(false);
            setIsAudioOptionsVisible(false);
            if (pollInterval) clearInterval(pollInterval);
          } else if (audioResult.status === 'error') {
            toast.error(`Audio processing failed: ${audioResult.error_message || 'Unknown error'}`);
            setAudioProcessingJobId(null);
            setIsProcessingAudio(false);
            setIsGeneratingAudioNote(false);
            setIsGeneratingAudioSummary(false);
            setIsTranslatingAudio(false);
            setIsAudioOptionsVisible(false);
            if (pollInterval) clearInterval(pollInterval);
          } else if (audioResult.status === 'processing') {
            toast.loading('Audio processing in progress...', { id: 'audio-job-status', duration: Infinity });
          }
        }
      } catch (error) {
        let errorMessage = 'Error polling audio job status.';
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        toast.error(errorMessage, { id: 'audio-job-status' });
        //console.error('Polling error:', error);
        setAudioProcessingJobId(null);
        setIsProcessingAudio(false);
        setIsGeneratingAudioNote(false);
        setIsGeneratingAudioSummary(false);
        setIsTranslatingAudio(false);
        setIsAudioOptionsVisible(false);
        if (pollInterval) clearInterval(pollInterval);
      }
    };

    if (audioProcessingJobId) {
      pollInterval = setInterval(pollJobStatus, 5000);
      pollJobStatus();
    } else {
      if (pollInterval) clearInterval(pollInterval);
      toast.dismiss('audio-job-status');
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      toast.dismiss('audio-job-status');
    };
  }, [audioProcessingJobId, userProfile, note, onNoteUpdate, setDraftContent]);

  const handleSave = () => {
    const updatedNote: Note = {
      ...note,
      title: title || 'Untitled Note',
      content,
      category,
      tags: tags.split(',').map(tag => tag.trim()).filter(tag => tag !== ''),
      updatedAt: new Date()
    };

    onNoteUpdate(updatedNote);
    toast.success('Note saved successfully!');
  };

  const regenerateNoteFromDocument = async () => {
    if (!note.document_id) {
      toast.error('This note is not linked to a source document and cannot be regenerated.');
      return;
    }
    if (!userProfile) {
      toast.error('User profile not found. Cannot generate personalized note.');
      return;
    }

    setIsGeneratingAI(true);
    const toastId = toast.loading('Regenerating note with AI...');

    try {
      const { data: newNote, error } = await supabase.functions.invoke('generate-note-from-document', {
        body: {
          documentId: note.document_id,
          userProfile: userProfile,
        },
      });

      if (error) {
        throw new Error(error.message || 'An unknown error occurred');
      }

      onNoteUpdate(newNote);
      setContent(newNote.content);
      setDraftContent(newNote.content);
      toast.success('Note regenerated successfully!', { id: toastId });
    } catch (error) {
      let errorMessage = 'Failed to regenerate note.';
      if (error instanceof FunctionsHttpError) {
        errorMessage = `AI regeneration failed: ${error.context.statusText}. Please try again.`;
        if (error.message.includes("The model is overloaded")) {
          errorMessage = "AI model is currently overloaded. Please try again in a few moments.";
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes("The model is overloaded")) {
          errorMessage = "AI model is currently overloaded. Please try again in a few moments.";
        }
      }
      toast.error(errorMessage, { id: toastId });
      //console.error('Error regenerating note:', error);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    ("handleFileSelect triggered!");
    const file = event.target.files?.[0];
    if (!file || !userProfile) {
      if (!userProfile) toast.error("Cannot upload: User profile is missing.");
      return;
    }

    const allowedDocumentTypes = ['application/pdf', 'text/plain', 'text/markdown', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
    const allowedAudioTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/webm'];

    if (allowedAudioTypes.includes(file.type)) {
      handleAudioFileSelect(event);
      return;
    }

    if (!allowedDocumentTypes.includes(file.type)) {
      toast.error('Unsupported file type. Please upload a PDF, TXT, Word document, or an audio file.');
      if (event.target) event.target.value = '';
      return;
    }

    setIsUploading(true);
    setSelectedFile(file);
    setUploadedDocumentPublicUrl(null);
    const toastId = toast.loading('Uploading document...');

    try {
      const filePath = `${userProfile.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      if (!urlData?.publicUrl) {
        throw new Error("Could not get public URL for the uploaded file.");
      }
      setUploadedDocumentPublicUrl(urlData.publicUrl);

      await handleDocumentProcessingAndNoteUpdate(file, urlData.publicUrl, file.type, toastId.toString());

    } catch (error) {
      let errorMessage = 'An unknown error occurred during document upload.';
      if (error instanceof FunctionsHttpError) {
        errorMessage = `Function error (${error.context.status}): ${error.context.statusText}. Check function logs.`;
        if (error.message.includes("The model is overloaded")) {
          errorMessage = "AI model is currently overloaded. Please try again in a few moments.";
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes("The model is overloaded")) {
          errorMessage = "AI model is currently overloaded. Please try again in a few moments.";
        }
      }
      toast.error(errorMessage, { id: toastId });
      //console.error('Error during upload process:', error);
    } finally {
      setIsUploading(false);
      if (event.target) event.target.value = '';
    }
  };

  const handleDocumentProcessingAndNoteUpdate = async (file: File, fileUrl: string, fileType: string, toastId: string, selectedSection: string | null = null) => {
    if (!userProfile) {
      toast.error("User profile not found. Cannot process document.");
      return;
    }

    setIsGeneratingAI(true);
    toast.loading('Extracting text from document...', { id: toastId });

    let documentRecordId: string | null = null;

    try {
      if (note.id && note.document_id) {
        documentRecordId = note.document_id;
        (`Updating existing document record with ID: ${documentRecordId}`);
        const { error: updateDocError } = await supabase
          .from('documents')
          .update({
            title: file.name,
            file_name: file.name,
            file_url: fileUrl,
            file_type: fileType,
            file_size: file.size,
            processing_status: 'pending',
            processing_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', documentRecordId)
          .eq('user_id', userProfile.id);

        if (updateDocError) throw new Error(updateDocError.message || 'Failed to update existing document record.');

      } else {
        ('Creating new document record.');
        const { data: newDocument, error: createDocError } = await supabase
          .from('documents')
          .insert({
            user_id: userProfile.id,
            title: file.name,
            file_name: file.name,
            file_url: fileUrl,
            file_type: fileType,
            file_size: file.size,
            type: 'text',
            processing_status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (createDocError || !newDocument) throw new Error(createDocError?.message || 'Failed to create new document record.');
        documentRecordId = newDocument.id;

        onNoteUpdate({ ...note, document_id: documentRecordId });
      }

      if (!documentRecordId) {
        throw new Error("Document record ID could not be determined.");
      }

      const { data: extractionData, error: extractionError } = await supabase.functions.invoke('gemini-document-extractor', {
        body: {
          documentId: documentRecordId,
          file_url: fileUrl,
          file_type: fileType,
          userId: userProfile.id,
        }
      });

      if (extractionError) throw extractionError;
      const extractedContent = extractionData.content_extracted;
      setExtractedContent(extractedContent);

      toast.loading('Analyzing document structure...', { id: toastId });
      const { data: structureData, error: structureError } = await supabase.functions.invoke('analyze-document-structure', {
        body: { documentContent: extractedContent }
      });

      if (structureError) throw structureError;

      if (structureData && structureData.sections && structureData.sections.length > 0) {
        setDocumentSections(structureData.sections);
        setDocumentIdForDialog(documentRecordId);
        setIsSectionDialogOpen(true);
        toast.dismiss(toastId);
      } else {
        await generateAIContentForNote(
          note,
          userProfile,
          null,
          toastId,
          documentRecordId
        );
      }

    } catch (error) {
      let errorMessage = 'An unknown error occurred during document processing.';
      if (error instanceof FunctionsHttpError) {
        errorMessage = `Function error (${error.context.status}): ${error.context.statusText}. Check function logs.`;
        if (error.message.includes("The model is overloaded")) {
          errorMessage = "AI model is currently overloaded. Please try again in a few moments.";
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes("The model is overloaded")) {
          errorMessage = "AI model is currently overloaded. Please try again in a few moments.";
        }
      }
      toast.error(errorMessage, { id: toastId });
      //console.error('Error during document processing and note update:', error);
      if (documentRecordId) {
        await supabase
          .from('documents')
          .update({
            processing_status: 'failed',
            processing_error: errorMessage,
            updated_at: new Date().toISOString()
          })
          .eq('id', documentRecordId);
      }
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const generateAIContentForNote = async (
    targetNote: Note,
    user: UserProfile,
    selectedSection: string | null,
    toastId: string,
    documentIdForGeneration: string | null
  ) => {
    setIsGeneratingAI(true);
    toast.loading('Generating AI note content...', { id: toastId });

    try {

      const requestBody = {
        documentId: documentIdForGeneration,
        userProfile: user,
        selectedSection: selectedSection,
      };


      const { data: aiGeneratedNote, error: generationError } = await supabase.functions.invoke('generate-note-from-document', {
        body: requestBody,
      });

      if (generationError) throw new Error(generationError.message || 'Failed to generate note content.');

      const updatedNote: Note = {
        ...targetNote,
        title: aiGeneratedNote.title || targetNote.title,
        content: aiGeneratedNote.content,
        aiSummary: aiGeneratedNote.aiSummary,
        updatedAt: new Date(),
        document_id: documentIdForGeneration,
      };

      if (!targetNote.id) {
        const { data: newNoteData, error: createNoteError } = await supabase
          .from('notes')
          .insert({
            title: updatedNote.title,
            content: updatedNote.content,
            category: updatedNote.category,
            tags: updatedNote.tags,
            user_id: user.id,
            ai_summary: updatedNote.aiSummary,
            document_id: updatedNote.document_id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (createNoteError) throw createNoteError;
        onNoteUpdate({
          ...updatedNote,
          id: newNoteData.id,
          createdAt: new Date(newNoteData.created_at),
          updatedAt: new Date(newNoteData.updated_at),
        });
        toast.success('New note generated from document!', { id: toastId });
      } else {
        const { error: updateNoteError } = await supabase
          .from('notes')
          .update({
            title: updatedNote.title,
            content: updatedNote.content,
            ai_summary: updatedNote.aiSummary,
            updated_at: new Date().toISOString(),
            document_id: updatedNote.document_id,
          })
          .eq('id', updatedNote.id)
          .eq('user_id', user.id);

        if (updateNoteError) throw updateNoteError;
        onNoteUpdate(updatedNote);
        toast.success('Note updated from document!', { id: toastId });
      }

      setContent(updatedNote.content);
      setDraftContent(updatedNote.content);
      setTitle(updatedNote.title);

    } catch (error) {
      let errorMessage = 'An unknown error occurred.';
      if (error instanceof FunctionsHttpError) {
        errorMessage = `AI generation failed: ${error.context.statusText}. Check function logs.`;
        if (error.message.includes("The model is overloaded")) {
          errorMessage = "AI model is currently overloaded. Please try again in a few moments.";
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes("The model is overloaded")) {
          errorMessage = "AI model is currently overloaded. Please try again in a few moments.";
        }
      }
      toast.error(errorMessage, { id: toastId });
      //console.error('Error during AI note generation:', error);
    } finally {
      setIsGeneratingAI(false);
      setIsSectionDialogOpen(false);
      setDocumentSections([]);
      setSelectedFile(null);
      setExtractedContent(null);
      setUploadedDocumentPublicUrl(null);
    }
  };

  const handleSectionSelect = async (section: string | null, documentIdFromDialog: string) => {
    if (!selectedFile || !extractedContent || !userProfile || !uploadedDocumentPublicUrl || !documentIdFromDialog) {
      toast.error("Missing file, extracted content, user profile, uploaded document URL, or document ID to generate note.");
      return;
    }

    const toastId = toast.loading(`Generating note from ${section ? `section: ${section}` : 'full document'}...`);

    await generateAIContentForNote(
      note,
      userProfile,
      section,
      toastId as string,
      documentIdFromDialog
    );
  };

  const handleTextToSpeech = () => {
    if (!('speechSynthesis' in window)) {
      toast.error("Text-to-speech is not supported in this browser.");
      return;
    }

    // If speech is currently active (according to our state), the user wants to stop it.
    if (isSpeaking) {
      speechSynthesis.cancel();
      setIsSpeaking(false);
      toast.info("Speech stopped.");
      return; // Exit the function, as the action was to stop.
    }

    // If we reach here, the user wants to start speech.
    if (!content.trim()) {
      toast.info("There's no content to read aloud.");
      return;
    }

    const processMarkdownForSpeech = (markdownContent: string): string => {
      let processedText = markdownContent;

      // Replace code blocks with descriptive text
      const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
      processedText = processedText.replace(codeBlockRegex, (match, lang, code) => {
        const lowerLang = lang ? lang.toLowerCase() : '';
        if (lowerLang === 'mermaid') {
          return '(A Mermaid diagram is present here.)';
        } else if (lowerLang === 'dot') {
          return '(A DOT graph is present here.)';
        } else if (lowerLang === 'chartjs') {
          return '(A Chart.js graph is present here.)';
        } else if (lang) {
          return `(A ${lang} code block is present here.)`;
        } else {
          return '(A code block is present here.)';
        }
      });

      // Remove other markdown formatting
      processedText = processedText
        .replace(/#{1,6}\s/g, '') // Remove ATX headings
        .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, '$1$2') // Remove bold
        .replace(/\*([^*]+)\*|_([^_]+)_/g, '$1$2') // Remove italics
        .replace(/`([^`]+)`/g, '$1') // Remove inline code
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove links, keep text
        .replace(/!\[([^\]]+)\]\([^\)]+\)/g, '(Image: $1)') // Replace images with alt text
        .replace(/^- /gm, '') // Remove list item markers
        .replace(/^\d+\. /gm, '') // Remove numbered list markers
        .replace(/>\s/g, '') // Remove blockquote markers
        .replace(/\|/g, ' ') // Replace table separators
        .replace(/---/g, ' ') // Replace horizontal rules
        .replace(/(\r\n|\n|\r)/gm, " ") // Replace newlines with spaces
        .replace(/\s+/g, ' ') // Replace multiple spaces with a single space
        .trim();

      return processedText;
    };

    const textToRead = processMarkdownForSpeech(content);
    if (!textToRead) {
      toast.info("The note has no readable content after processing.");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(textToRead);

    // Re-fetch voices to ensure we have the most current list
    const currentAvailableVoices = speechSynthesis.getVoices();
    let voiceToUse: SpeechSynthesisVoice | undefined = undefined;

    // Try to find the previously selected voice first among current voices
    if (selectedVoiceURI) {
      voiceToUse = currentAvailableVoices.find(v => v.voiceURI === selectedVoiceURI);
    }

    // If selected voice not found or not set, try to find a suitable default
    if (!voiceToUse && currentAvailableVoices.length > 0) {
      voiceToUse = currentAvailableVoices.find(voice => voice.name.includes('Google') && voice.lang.startsWith('en')) ||
        currentAvailableVoices.find(voice => voice.lang.startsWith('en')) ||
        currentAvailableVoices[0];
      if (voiceToUse) {
        setSelectedVoiceURI(voiceToUse.voiceURI); // Update state with the fallback voice
      }
    }

    if (voiceToUse) {
      utterance.voice = voiceToUse;
    } else {
      // If no voice is found after all attempts, show error and prevent speaking
      toast.error("No suitable text-to-speech voice found on your device. Please check your device settings.");
      //console.error("No suitable voice found for speech synthesis.");
      return;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
      //console.error("Speech synthesis error:", e);
      let errorMessage = "An unknown error occurred while reading the note.";
      if (e.error === "interrupted") {
        errorMessage = "Speech was interrupted. This can happen if you switch apps, receive a call, or rapidly tap the read button.";
      } else if (e.error === "synthesis-failed") {
        errorMessage = "Speech synthesis failed. This may be due to voice unavailability or a browser issue.";
      } else if (e.error) {
        errorMessage = `Speech error: ${e.error}. This may be due to browser limitations or voice availability.`;
      }
      toast.error(errorMessage);
      setIsSpeaking(false);
    };

    try {
      speechSynthesis.speak(utterance);
    } catch (error) {
      //console.error("Error calling speechSynthesis.speak:", error);
      toast.error("Failed to start reading. Your browser might have restrictions.");
      setIsSpeaking(false);
    }
  };

  const handleViewOriginalDocument = async () => {
    if (!note.document_id) {
      toast.info('No original document linked to this note.');
      return;
    }

    setIsLoadingDocument(true);
    const toastId = toast.loading('Loading original document...');

    try {
      const { data, error } = await supabase
        .from('documents')
        .select('content_extracted, file_url, file_type')
        .eq('id', note.document_id)
        .single();

      if (error) throw new Error(error.message);
      if (!data) throw new Error('Document not found.');

      setOriginalDocumentContent(data.content_extracted);
      setOriginalDocumentFileType(data.file_type);
      setOriginalDocumentFileUrl(data.file_url);
      setIsDocumentViewerOpen(true);
      toast.success('Document loaded.', { id: toastId });
    } catch (error) {
      let errorMessage = 'Failed to load original document.';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast.error(errorMessage, { id: toastId });
      //console.error('Error loading original document:', error);
    } finally {
      setIsLoadingDocument(false);
    }
  };

  const handleDownloadNote = () => {
    if (!content.trim()) {
      toast.info("There's no content to download.");
      return;
    }
    const fileName = `${title || 'untitled-note'}.md`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    toast.success('Note downloaded as Markdown!');
  };

  const handleDownloadPdf = () => {
    if (!content.trim()) {
      toast.info("There's no content to convert to PDF.");
      return;
    }

    const previewElement = document.getElementById('note-preview-content');
    if (previewElement) {
      toast.loading('Generating PDF...', { id: 'pdf-download' });
      if (typeof window.html2pdf === 'undefined') {
        toast.error('PDF generation library not loaded. Please try again later.', { id: 'pdf-download' });
        //console.error('html2pdf.js is not loaded. Please ensure it is included in your project, e.g., in public/index.html via <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>');
        return;
      }

      window.html2pdf()
        .from(previewElement)
        .set({
          margin: [10, 10, 10, 10],
          filename: `${title || 'untitled-note'}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, logging: true, dpi: 192, letterRendering: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .save()
        .then(() => {
          toast.success('Note downloaded as PDF!', { id: 'pdf-download' });
        })
        .catch((error: any) => {
          toast.error('Failed to generate PDF.', { id: 'pdf-download' });
          //console.error('Error generating PDF:', error);
        });
    } else {
      toast.error('Could not find the note preview content to generate PDF.');
    }
  };

  const handleCopyNoteContent = () => {
    if (!content.trim()) {
      toast.info("There's no content to copy.");
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = content;
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      toast.success('Note content copied to clipboard!');
    } catch (err) {
      //console.error('Failed to copy text: ', err);
      toast.error('Failed to copy note content.');
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const handleAudioFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    ("handleAudioFileSelect triggered!");
    toast.info("Audio file selected, starting upload...");
    const file = event.target.files?.[0];
    if (!file || !userProfile) {
      if (!userProfile) toast.error("Cannot upload: User profile is missing.");
      return;
    }

    const allowedAudioTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/webm'];
    if (!allowedAudioTypes.includes(file.type)) {
      toast.error('Unsupported audio file type. Please upload an MP3, WAV, M4A, or WebM file.');
      if (event.target) event.target.value = '';
      return;
    }

    setIsProcessingAudio(true);
    const toastId = toast.loading('Uploading audio file...');

    try {
      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${userProfile.id}/audio/${Date.now()}_${safeFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      if (!publicUrlData?.publicUrl) {
        throw new Error("Could not get public URL for the uploaded audio file.");
      }

      setUploadedAudioDetails({
        url: publicUrlData.publicUrl,
        type: file.type,
        name: file.name
      });
      setIsAudioOptionsVisible(true);
      toast.success('Audio file uploaded. Processing options available.', { id: toastId });

    } catch (error) {
      let errorMessage = 'An error occurred during audio file upload.';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast.error(errorMessage, { id: toastId });
      //console.error('Error uploading audio file:', error);
      setIsProcessingAudio(false);
    } finally {
      if (event.target) event.target.value = '';
    }
  };

  const handleProcessAudio = async (
    action: 'transcribe' | 'summarize' | 'translate',
    language: string | null = null,
    documentId: string | null = null
  ) => {
    if (!uploadedAudioDetails || !userProfile) {
      toast.error("No audio file uploaded or user profile missing.");
      return;
    }

    let audioDocumentId = documentId;
    if (!audioDocumentId) {
      // If no documentId is provided, create a new document record for the audio file
      try {
        const { data: newDocument, error: createDocError } = await supabase
          .from('documents')
          .insert({
            user_id: userProfile.id,
            title: uploadedAudioDetails.name,
            file_name: uploadedAudioDetails.name,
            file_url: uploadedAudioDetails.url,
            file_type: uploadedAudioDetails.type,
            type: 'audio',
            processing_status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (createDocError || !newDocument) throw new Error(createDocError?.message || 'Failed to create new document record for audio.');
        audioDocumentId = newDocument.id;
        onNoteUpdate({ ...note, document_id: audioDocumentId });
        setDocumentIdForDialog(audioDocumentId); // Keep track of the document ID
      } catch (error) {
        let errorMessage = 'Failed to create document record for audio.';
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        toast.error(errorMessage);
        //console.error(errorMessage, error);
        setIsProcessingAudio(false);
        return;
      }
    }

    setIsProcessingAudio(true);
    let toastMessage = '';
    let edgeFunctionName = '';

    switch (action) {
      case 'transcribe':
        toastMessage = 'Transcribing audio...';
        edgeFunctionName = 'process-audio-for-transcription';
        setIsGeneratingAudioNote(true);
        break;
      case 'summarize':
        toastMessage = 'Generating audio summary...';
        edgeFunctionName = 'process-audio-for-summary';
        setIsGeneratingAudioSummary(true);
        break;
      case 'translate':
        toastMessage = `Translating audio to ${language}...`;
        edgeFunctionName = 'process-audio-for-translation';
        setIsTranslatingAudio(true);
        break;
      default:
        toast.error('Invalid audio processing action.');
        setIsProcessingAudio(false);
        return;
    }

    const toastId = toast.loading(toastMessage);

    try {
      const { data, error } = await supabase.functions.invoke(edgeFunctionName, {
        body: {
          audioUrl: uploadedAudioDetails.url,
          fileType: uploadedAudioDetails.type,
          userId: userProfile.id,
          documentId: audioDocumentId,
          targetLanguage: language
        },
      });

      if (error) throw error;
      if (!data || !data.jobId) throw new Error('No job ID received from audio processing function.');

      setAudioProcessingJobId(data.jobId);
      toast.success('Audio processing job started. We will notify you when it\'s done!', { id: toastId });

    } catch (error) {
      let errorMessage = `Failed to start audio ${action}.`;
      if (error instanceof FunctionsHttpError) {
        errorMessage = `Function error (${error.context.status}): ${error.context.statusText}.`;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast.error(errorMessage, { id: toastId });
      //console.error(`Error starting audio ${action}:`, error);
      setIsProcessingAudio(false);
      setIsGeneratingAudioNote(false);
      setIsGeneratingAudioSummary(false);
      setIsTranslatingAudio(false);
    }
  };

  const handleAudioPlayerPlay = () => setIsPlayingAudio(true);
  const handleAudioPlayerPause = () => setIsPlayingAudio(false);
  const handleAudioPlayerEnded = () => setIsPlayingAudio(false);


  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-950 rounded-lg shadow-sm">
      <NoteEditorHeader
        title={title}
        setTitle={setTitle}
        category={category}
        setCategory={setCategory}
        tags={tags}
        setTags={setTags}
        isUploading={isUploading}
        isGeneratingAI={isGeneratingAI}
        isProcessingAudio={isProcessingAudio}
        userProfile={userProfile}
        regenerateNoteFromDocument={regenerateNoteFromDocument}
        handleViewOriginalDocument={handleViewOriginalDocument}
        handleDownloadNote={handleDownloadNote}
        handleDownloadPdf={handleDownloadPdf}
        handleCopyNoteContent={handleCopyNoteContent}
        handleTextToSpeech={handleTextToSpeech}
        isSpeaking={isSpeaking}
        handleSave={handleSave}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        selectedVoiceURI={selectedVoiceURI}
        setSelectedVoiceURI={setSelectedVoiceURI}
        voices={voices}
        documentId={note.document_id}
        onToggleNotesHistory={onToggleNotesHistory}
        isNotesHistoryOpen={isNotesHistoryOpen}
        fileInputRef={fileInputRef}
        handleFileSelect={handleFileSelect}
        audioInputRef={audioInputRef}
        handleAudioFileSelect={handleAudioFileSelect}
      />

      <AudioOptionsSection
        uploadedAudioDetails={uploadedAudioDetails}
        isAudioOptionsVisible={isAudioOptionsVisible}
        audioPlayerRef={audioPlayerRef}
        isPlayingAudio={isPlayingAudio}
        handlePlayAudio={handleAudioPlayerPlay}
        handleAudioEnded={handleAudioPlayerEnded}
        handleDownloadAudio={() => { /* Placeholder if needed, but handled by NoteEditorHeader */ }}
        handleCopyAudioUrl={() => { /* Placeholder if needed, but handled by NoteEditorHeader */ }}
        handleClearAudioProcessing={() => { /* Placeholder if needed, but handled by NoteEditorHeader */ }}
        handleGenerateNoteFromAudio={() => handleProcessAudio('transcribe', null, note.document_id)}
        handleGenerateSummaryFromAudio={() => handleProcessAudio('summarize', null, note.document_id)}
        targetLanguage={targetLanguage}
        setTargetLanguage={setTargetLanguage}
        handleTranslateAudio={() => handleProcessAudio('translate', targetLanguage, note.document_id)}
        isGeneratingAudioNote={isGeneratingAudioNote}
        isGeneratingAudioSummary={isGeneratingAudioSummary}
        isTranslatingAudio={isTranslatingAudio}
        isProcessingAudio={isProcessingAudio}
        userProfile={userProfile}
      />

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <NoteContentArea
          content={draftContent}
          setContent={setDraftContent}
          isEditing={isEditing}
          userProfile={userProfile}
          
        />

        {note.aiSummary && (
          <AISummarySection
            aiSummary={note.aiSummary}
            isSummaryVisible={isSummaryVisible}
            setIsSummaryVisible={setIsSummaryVisible}
          />
        )}

        {translatedContent && (
          <TranslatedContentSection
            translatedContent={translatedContent}
            targetLanguage={targetLanguage}
            setTranslatedContent={setTranslatedContent}
          />
        )}
      </div>

      <SectionSelectionDialog
        isOpen={isSectionDialogOpen}
        sections={documentSections}
        onSectionSelect={(section) => handleSectionSelect(section, documentIdForDialog!)}
        onCancel={() => {
          setIsSectionDialogOpen(false);
          setIsUploading(false);
          setSelectedFile(null);
          setExtractedContent(null);
          setUploadedDocumentPublicUrl(null);
          setDocumentIdForDialog(null);
        }}
        documentId={documentIdForDialog!}
      />

      <DocumentViewerDialog
        isOpen={isDocumentViewerOpen}
        onClose={() => setIsDocumentViewerOpen(false)}
        content={originalDocumentContent}
        fileType={originalDocumentFileType}
        fileUrl={originalDocumentFileUrl}
      />
    </div>
  );
};
