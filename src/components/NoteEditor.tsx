// NoteEditor.tsx
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Sparkles, Hash, Save, Brain, RefreshCw, UploadCloud, Volume2, StopCircle, Menu, FileText, ChevronDown, ChevronUp, Download, Copy, FileDown, Mic, Play, Pause, XCircle, Check, AlertTriangle, Loader2, TypeOutline } from 'lucide-react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Note, NoteCategory, UserProfile } from '../types';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import Mermaid from './Mermaid';
import { SectionSelectionDialog } from './SectionSelectionDialog';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { DocumentViewerDialog } from './DocumentViewerDialog';
import { CodeBlockErrorBoundary } from './AIChat';
// Import Supabase generated types
import { Database } from '../integrations/supabase/types'; // Adjust path if your supabase.ts is elsewhere

// Explicitly type the supabase client for better type inference with custom tables
const typedSupabase = supabase as any; // Cast to any for broader compatibility, or use createClient<Database>() if your setup allows

// Import languages for syntax highlighting
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import sql from 'highlight.js/lib/languages/sql';
import xml from 'highlight.js/lib/languages/xml';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/typescript';

// Create lowlight instance and register languages
import { lowlight } from 'lowlight';
import { LanguageFn } from 'highlight.js';
lowlight.registerLanguage('javascript', javascript as LanguageFn);
lowlight.registerLanguage('python', python as LanguageFn);
lowlight.registerLanguage('java', java as LanguageFn);
lowlight.registerLanguage('cpp', cpp as LanguageFn);
lowlight.registerLanguage('sql', sql as LanguageFn);
lowlight.registerLanguage('xml', xml as LanguageFn);
lowlight.registerLanguage('bash', bash as LanguageFn);
lowlight.registerLanguage('json', json as LanguageFn);
// Direct import for Graphviz
import { Graphviz } from '@hpcc-js/wasm';

// Direct import for Chart.js
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables); // Register Chart.js components globally

// Define a mapping of highlight.js classes to Tailwind CSS color classes for dark theme
const syntaxColorMap: { [key: string]: string } = {
  'hljs-comment': 'text-gray-400', // Lighter grey for comments in dark mode
  'hljs-keyword': 'text-purple-300', // Lighter purple for keywords
  'hljs-built_in': 'text-cyan-300', // Lighter cyan for built-in functions/types
  'hljs-string': 'text-green-300', // Lighter green for strings
  'hljs-variable': 'text-blue-200', // Lighter blue for variables
  'hljs-number': 'text-orange-200', // Lighter orange for numbers
  'hljs-literal': 'text-orange-200', // Lighter orange for literals (true, false, null)
  'hljs-function': 'text-blue-200', // Lighter blue for function names
  'hljs-params': 'text-yellow-200', // Lighter yellow for function parameters
  'hljs-tag': 'text-pink-300', // Lighter pink for HTML/XML tags
  'hljs-attr': 'text-cyan-300', // Lighter cyan for HTML/XML attributes
  'hljs-selector-tag': 'text-purple-300', // Lighter purple for CSS selectors
  'hljs-selector-id': 'text-orange-300', // Lighter orange for CSS IDs
  'hljs-selector-class': 'text-green-300', // Lighter green for CSS classes
  'hljs-regexp': 'text-pink-300', // Lighter pink for regular expressions
  'hljs-meta': 'text-sky-300', // Lighter sky blue for meta information (e.g., #include)
  'hljs-type': 'text-teal-300', // Lighter teal for types
  'hljs-symbol': 'text-red-300', // Lighter red for symbols
  'hljs-operator': 'text-pink-200', // Lighter pink for operators
  // Default text color for code content not specifically highlighted
  'hljs-code-text': 'text-gray-100', // White-ish for general code text
};

// Helper function to convert highlight.js output to React elements with custom colors
const renderHighlightedCode = (result: any) => {
  const renderNode = (node: any, index: number): React.ReactNode => {
    if (node.type === 'text') {
      return node.value;
    }
    if (node.type === 'element') {
      const { tagName, properties, children } = node;
      let appliedClassNames = '';

      // Get highlight.js classes and map them to Tailwind colors
      if (properties?.className && Array.isArray(properties.className)) {
        appliedClassNames = properties.className
          .map((cls: string) => syntaxColorMap[cls] || cls)
          .join(' ');
      } else if (typeof properties?.className === 'string') {
        // Handle case where className might be a single string
        appliedClassNames = syntaxColorMap[properties.className] || properties.className;
      }

      // Fallback to default code text color if no specific highlight class applies
      if (!appliedClassNames && tagName === 'span') {
        appliedClassNames = syntaxColorMap['hljs-code-text'];
      }

      const newProperties = { ...properties };
      // Ensure the original className is not duplicated or overridden by spread properties
      delete newProperties.className;

      return React.createElement(
        tagName,
        {
          key: index,
          ...newProperties, // Spread original properties first
          className: appliedClassNames, // Then apply our custom classNames
        },
        children?.map((child: any, childIndex: number) => renderNode(child, childIndex))
      );
    }
    return null;
  };

  return result.children.map((node: any, index: number) => renderNode(node, index));
};


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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

  // State to hold the public URL of the uploaded document file
  const [uploadedDocumentPublicUrl, setUploadedDocumentPublicUrl] = useState<string | null>(null);


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

    if ('speechSynthesis' in window && speechSynthesis.speaking) {
      speechSynthesis.cancel();
    }
    setIsSpeaking(false);

    setIsSummaryVisible(true); // Ensure summary is visible by default when note loads

    return () => {
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
        if (!selectedVoiceURI) {
          const defaultVoice = availableVoices.find(voice => voice.name === 'Google US English') || availableVoices[0];
          if (defaultVoice) setSelectedVoiceURI(defaultVoice.voiceURI);
        }
      }
    };

    populateVoiceList();
    if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = populateVoiceList;
    }
  }, []);

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
            // Update the note content and link to the newly created document
            setContent(audioResult.transcript || 'No transcription available.');
            setDraftContent(audioResult.transcript || 'No transcription available.'); // Also update draftContent
            onNoteUpdate({
              ...note,
              content: audioResult.transcript || '', // Ensure content is updated in the note object
              aiSummary: audioResult.summary || 'No summary available.',
              document_id: audioResult.document_id || null // Set the document_id from the audio result
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
        console.error('Polling error:', error);
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
      content, // Use the debounced content
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
      setContent(newNote.content); // Update debounced content
      setDraftContent(newNote.content); // Update draft content
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
      console.error('Error regenerating note:', error);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Function to close mobile menu, but not trigger file input directly
  const handleMobileMenuClose = () => {
    setIsMobileMenuOpen(false);
  };


  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log("handleFileSelect triggered!"); // New debug log
    toast.info("File selected, starting upload..."); // Added for debugging
    const file = event.target.files?.[0];
    if (!file || !userProfile) {
      if (!userProfile) toast.error("Cannot upload: User profile is missing.");
      return;
    }

    const allowedDocumentTypes = ['application/pdf', 'text/plain', 'text/markdown', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
    const allowedAudioTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/webm'];

    if (allowedAudioTypes.includes(file.type)) {
      // If it's an audio file, route it to the audio handler
      handleAudioFileSelect(event); // Pass the event to reuse its logic
      return;
    }

    if (!allowedDocumentTypes.includes(file.type)) {
      toast.error('Unsupported file type. Please upload a PDF, TXT, Word document, or an audio file.');
      if (event.target) event.target.value = '';
      return;
    }

    // Proceed with document upload logic
    setIsUploading(true);
    setSelectedFile(file);
    setUploadedDocumentPublicUrl(null); // Reset URL state
    const toastId = toast.loading('Uploading document...');

    try {
      const filePath = `${userProfile.id}/${Date.now()}_${file.name}`;
      console.log('Uploading file to path:', filePath); // LOG
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      toast.loading('Extracting text from document...', { id: toastId });

      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      if (!urlData?.publicUrl) {
        throw new Error("Could not get public URL for the uploaded file.");
      }
      console.log('Public URL generated:', urlData.publicUrl); // LOG
      setUploadedDocumentPublicUrl(urlData.publicUrl); // Store the public URL

      const { data: extractionData, error: extractionError } = await supabase.functions.invoke('gemini-document-extractor', {
        body: {
          file_url: urlData.publicUrl,
          file_type: file.type
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
        setIsSectionDialogOpen(true);
        toast.dismiss(toastId);
      } else {
        // If no sections, generate note from full content
        // Pass the stored public URL here
        await generateNoteFromExtractedContent(extractedContent, file.name, urlData.publicUrl, file.type, toastId.toString());
      }

    } catch (error) {
      let errorMessage = 'An unknown error occurred.';
      if (error instanceof FunctionsHttpError) {
        errorMessage = `Function error (${error.context.status}): ${error.context.statusText}. Check function logs.`;
        // Specific check for Gemini model overloaded error
        if (error.message.includes("The model is overloaded")) {
          errorMessage = "AI model is currently overloaded. Please try again in a few moments.";
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
        // Specific check for Gemini model overloaded error
        if (error.message.includes("The model is overloaded")) {
          errorMessage = "AI model is currently overloaded. Please try again in a few moments.";
        }
      }

      toast.error(errorMessage, { id: toastId });
      console.error('Error during upload and generate process:', error);
    } finally {
      setIsUploading(false);
      if (event.target) event.target.value = '';
    }
  };

  const generateNoteFromExtractedContent = async (contentToUse: string, fileName: string, fileUrl: string, fileType: string, toastId: string, selectedSection: string | null = null) => {
    if (!userProfile) {
      toast.error("User profile not found. Cannot generate personalized note.");
      return;
    }

    setIsGeneratingAI(true);
    toast.loading('Generating AI note...', { id: toastId });

    try {
      // Create a new document entry for the file first
      const { data: newDocument, error: docError } = await supabase
        .from('documents')
        .insert({
          user_id: userProfile.id,
          title: fileName,
          file_name: fileName,
          file_url: fileUrl, // Use the passed fileUrl (which is the public URL from upload)
          content_extracted: contentToUse, // Store the extracted content
          file_type: fileType, // Ensure file_type is passed
          type: 'text', // Explicitly set the type to 'document'
          processing_status: 'completed', // Mark as completed since content is extracted
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          file_size: selectedFile?.size || 0, // Store file size if available


        })
        .select('id')
        .single();

      if (docError || !newDocument) throw new Error(docError?.message || 'Failed to create document record.');
      console.log('Document record created with ID:', newDocument.id, 'and URL:', fileUrl); // LOG

      const { data: newNote, error: generationError } = await supabase.functions.invoke('generate-note-from-document', {
        body: {
          documentId: newDocument.id,
          userProfile,
          selectedSection,
        },
      });

      if (generationError) throw new Error(generationError.message || 'Failed to generate note.');

      onNoteUpdate(newNote);
      setContent(newNote.content); // Update debounced content
      setDraftContent(newNote.content); // Update draft content
      toast.success('New note generated from document!', { id: toastId });

    } catch (error) {
      let errorMessage = 'An unknown error occurred.';
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
      console.error('Error during note generation:', error);
    } finally {
      setIsGeneratingAI(false);
      setIsSectionDialogOpen(false);
      setDocumentSections([]);
      setSelectedFile(null);
      setExtractedContent(null);
      setUploadedDocumentPublicUrl(null); // Clear the stored URL after use
    }
  };

  const handleSectionSelect = async (section: string | null) => {
    if (!selectedFile || !extractedContent || !userProfile || !uploadedDocumentPublicUrl) {
      toast.error("Missing file, extracted content, user profile, or uploaded document URL to generate note.");
      return;
    }

    const toastId = toast.loading(`Generating note from ${section ? `section: ${section}` : 'full document'}...`);
    // Pass the already stored public URL
    await generateNoteFromExtractedContent(extractedContent, selectedFile.name, uploadedDocumentPublicUrl, selectedFile.type, toastId as string, section);
  };

  const handleTextToSpeech = () => {
    if (!('speechSynthesis' in window)) {
      toast.error('Your browser does not support text-to-speech.');
      return;
    }

    if (isSpeaking) {
      speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    if (!content.trim()) {
      toast.info("There's no content to read.");
      return;
    }

    // Function to process markdown and replace code blocks with descriptions
    const processMarkdownForSpeech = (markdownContent: string): string => {
      let processedText = markdownContent;

      // Regular expression to find code blocks with language specifiers
      // This covers ```lang ... ``` and also ``` ... ``` without lang
      const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
      processedText = processedText.replace(codeBlockRegex, (match, lang, code) => {
        const lowerLang = lang.toLowerCase();
        if (lowerLang === 'mermaid') {
          return '(A Mermaid diagram is present here.)';
        } else if (lowerLang === 'dot') {
          return '(A DOT graph is present here.)';
        } else if (lowerLang === 'chartjs') {
          return '(A Chart.js graph is present here.)';
        } else if (lang) {
          // For other programming languages
          return `(A ${lang} code block is present here.)`;
        } else {
          // For generic code blocks without a specified language
          return '(A code block is present here.)';
        }
      });

      // Remove other common markdown formatting
      processedText = processedText
        .replace(/#{1,6}\s/g, '') // Remove headers (e.g., # Heading)
        .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, '$1$2') // Bold (**text**, __text__)
        .replace(/\*([^*]+)\*|_([^_]+)_/g, '$1$2') // Italic (*text*, _text_)
        .replace(/`([^`]+)`/g, '$1') // Inline code (`code`)
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Links ([text](url)) - keep text
        .replace(/!\[([^\]]+)\]\([^\)]+\)/g, '(Image: $1)') // Images (![alt](url)) - describe image
        .replace(/^- /gm, '') // List items (dashes)
        .replace(/^\d+\. /gm, '') // List items (numbers)
        .replace(/>\s/g, '') // Blockquotes
        .replace(/\|/g, ' ') // Table pipes
        .replace(/---/g, ' ') // Horizontal rules
        .replace(/(\r\n|\n|\r)/gm, " ") // Replace newlines with spaces
        .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
        .trim(); // Trim leading/trailing whitespace

      return processedText;
    };

    const textToRead = processMarkdownForSpeech(content);

    const utterance = new SpeechSynthesisUtterance(textToRead);

    if (selectedVoiceURI) {
      const selectedVoice = voices.find(v => v.voiceURI === selectedVoiceURI);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = (e) => {
      console.error("Speech synthesis error", e);
      toast.error("An error occurred while reading the note.");
      setIsSpeaking(false);
    };

    speechSynthesis.speak(utterance);
  };

  const handleViewOriginalDocument = async () => {
    if (!note.document_id) {
      toast.info('No original document linked to this note.');
      return;
    }

    setIsLoadingDocument(true);
    const toastId = toast.loading('Loading original document...');

    try {
      console.log('Attempting to fetch document with ID:', note.document_id); // LOG
      const { data, error } = await supabase
        .from('documents')
        .select('content_extracted, file_url, file_type')
        .eq('id', note.document_id)
        .single();

      if (error) throw new Error(error.message);
      if (!data) throw new Error('Document not found.');

      console.log('Fetched document URL:', data.file_url); // LOG
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
      console.error('Error loading original document:', error);
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
        console.error('html2pdf.js is not loaded. Please ensure it is included in your project, e.g., in public/index.html via <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>');
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
          console.error('Error generating PDF:', error);
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
      console.error('Failed to copy text: ', err);
      toast.error('Failed to copy note content.');
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const handleAudioFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log("handleAudioFileSelect triggered!"); // New debug log
    toast.info("Audio file selected, starting upload..."); // Added for debugging
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
      console.log('Uploading audio file to path:', filePath); // LOG

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw new Error(`Audio upload failed: ${uploadError.message}`);

      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      if (!urlData?.publicUrl) {
        throw new Error("Could not get public URL for the uploaded audio file.");
      }
      console.log('Public audio URL generated:', urlData.publicUrl); // LOG

      setUploadedAudioDetails({ url: urlData.publicUrl, type: file.type, name: file.name });
      setIsAudioOptionsVisible(true);
      toast.success('Audio file uploaded. Choose an action.', { id: toastId });

    } catch (error) {
      let errorMessage = 'An unknown error occurred during audio upload.';
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
      console.error('Error during audio upload:', error);
    } finally {
      setIsProcessingAudio(false);
      if (event.target) event.target.value = '';
    }
  };

  const handleGenerateNoteFromAudio = async () => {
    if (!uploadedAudioDetails || !userProfile) {
      toast.error("No audio uploaded or user profile missing.");
      return;
    }

    setIsGeneratingAudioNote(true);
    const toastId = toast.loading('Initiating full note generation from audio...');

    try {
      // Create a new document entry for the audio file first
      const { data: newDocument, error: docError } = await supabase
        .from('documents')
        .insert({
          user_id: userProfile.id,
          title: `Audio Note: ${uploadedAudioDetails.name}`,
          file_name: uploadedAudioDetails.name,
          file_url: uploadedAudioDetails.url,
          content_extracted: 'Processing audio for content...', // Placeholder
          type: 'audio', // Explicitly set the type to 'audio'
          processing_status: 'processing', // Mark as processing
          file_type: uploadedAudioDetails.type,
        })
        .select('id')
        .single();

      if (docError || !newDocument) throw new Error(docError?.message || 'Failed to create document record for audio.');
      console.log('Audio document record created with ID:', newDocument.id, 'and URL:', uploadedAudioDetails.url); // LOG

      // Call the new background processing Edge Function, passing the new document_id
      const { data, error } = await supabase.functions.invoke('process-audio', {
        body: {
          file_url: uploadedAudioDetails.url,
          target_language: targetLanguage,
          user_id: userProfile.id,
          document_id: newDocument.id // Pass the newly created document ID
        },
      });

      if (error) throw error;
      if (!data || !data.job_id) throw new Error('No job ID received from audio processor.');

      setAudioProcessingJobId(data.job_id);
      toast.success('Audio processing job started. You will be notified when it\'s complete.', { id: toastId });
      setIsProcessingAudio(true);
    } catch (error) {
      let errorMessage = 'Failed to start audio note generation.';
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
      console.error('Error initiating audio note generation:', error);
    } finally {
      setIsGeneratingAudioNote(false);
    }
  };

  const handleGenerateSummaryFromAudio = async () => {
    if (!uploadedAudioDetails || !userProfile) {
      toast.error("No audio uploaded or user profile missing.");
      return;
    }

    setIsGeneratingAudioSummary(true);
    const toastId = toast.loading('Initiating summary generation from audio...');

    try {
      const { data, error } = await supabase.functions.invoke('process-audio', {
        body: {
          file_url: uploadedAudioDetails.url,
          target_language: targetLanguage,
          user_id: userProfile.id,
          // document_id is not passed here as we are only generating a summary, not a full note linked to a new document
        },
      });

      if (error) throw error;
      if (!data || !data.job_id) throw new Error('No job ID received from audio processor.');

      setAudioProcessingJobId(data.job_id);
      toast.success('Audio summary job started. You will be notified when it\'s complete.', { id: toastId });
      setIsProcessingAudio(true);
    } catch (error) {
      let errorMessage = 'Failed to start audio summary generation.';
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
      console.error('Error initiating audio summary generation:', error);
    } finally {
      setIsGeneratingAudioSummary(false);
    }
  };

  const handleTranslateAudio = async () => {
    if (!uploadedAudioDetails || !userProfile) {
      toast.error("No audio uploaded or user profile missing.");
      return;
    }
    if (targetLanguage === 'en') {
      toast.info("Please select a target language other than English for translation.");
      return;
    }

    setIsTranslatingAudio(true);
    const toastId = toast.loading(`Initiating translation of audio transcript to ${targetLanguage.toUpperCase()}...`);

    try {
      const { data, error } = await supabase.functions.invoke('process-audio', {
        body: {
          file_url: uploadedAudioDetails.url,
          target_language: targetLanguage,
          user_id: userProfile.id,
          // document_id is not passed here
        },
      });

      if (error) throw error;
      if (!data || !data.job_id) throw new Error('No job ID received from audio processor.');

      setAudioProcessingJobId(data.job_id);
      toast.success(`Audio translation job started. You will be notified when it's complete.`, { id: toastId });
      setIsProcessingAudio(true);
    } catch (error) {
      let errorMessage = 'Failed to start audio translation.';
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
      console.error('Error initiating audio translation:', error);
    } finally {
      setIsTranslatingAudio(false);
    }
  };

  const handlePlayAudio = () => {
    if (audioPlayerRef.current && uploadedAudioDetails) {
      if (isPlayingAudio) {
        audioPlayerRef.current.pause();
      } else {
        audioPlayerRef.current.play();
      }
      setIsPlayingAudio(!isPlayingAudio);
    } else {
      toast.info("No audio file to play.");
    }
  };

  const handleAudioEnded = () => {
    setIsPlayingAudio(false);
  };

  const handleDownloadAudio = () => {
    if (!uploadedAudioDetails) {
      toast.info("No audio file to download.");
      return;
    }
    const link = document.createElement('a');
    link.href = uploadedAudioDetails.url;
    link.download = uploadedAudioDetails.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Audio file downloaded!');
  };

  const handleCopyAudioUrl = () => {
    if (!uploadedAudioDetails) {
      toast.info("No audio URL to copy.");
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = uploadedAudioDetails.url;
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      toast.success('Audio URL copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy text: ', err);
      toast.error('Failed to copy audio URL.');
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const handleClearAudioProcessing = () => {
    setUploadedAudioDetails(null);
    setIsAudioOptionsVisible(false);
    setAudioProcessingJobId(null);
    setIsProcessingAudio(false);
    setIsGeneratingAudioNote(false);
    setIsGeneratingAudioSummary(false);
    setIsTranslatingAudio(false);
    setTranslatedContent(null);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      setIsPlayingAudio(false);
    }
    toast.dismiss('audio-job-status');
  };


  const CodeRenderer = ({ inline, className, children, ...props }: any) => {
    const { copied, copy } = useCopyToClipboard();
    const match = /language-(\w+)/.exec(className || '');
    const lang = match && match[1];
    const codeContent = String(children).trim();

    // State for DOT graph rendering
    const [dotSvgContent, setDotSvgContent] = useState<string | null>(null);
    const [dotError, setDotError] = useState<string | null>(null);
    const [isDotLoading, setIsDotLoading] = useState(false);
    const dotContainerRef = useRef<HTMLDivElement>(null); // Ref for DOT graph container

    // State for Chart.js rendering
    const chartCanvasRef = useRef<HTMLCanvasElement>(null);
    const chartInstanceRef = useRef<Chart | null>(null);
    const [chartJsError, setChartJsError] = useState<string | null>(null);
    const [isChartJsLoading, setIsChartJsLoading] = useState(false);
    const chartContainerRef = useRef<HTMLDivElement>(null); // Ref for Chart.js container div


    // Effect for DOT graph rendering - now automatic on codeContent change
    useEffect(() => {
      if (lang === 'dot' && codeContent) {
        setIsDotLoading(true);
        setDotError(null);
        setDotSvgContent(null);

        const renderDot = async () => {
          try {
            // Ensure Graphviz WASM is loaded if it's not already
            // This is typically handled by @hpcc-js/wasm itself or a global setup
            // For safety, we can ensure the instance is new each time.
            const gv = await Graphviz.load();
            const svg = gv.layout(codeContent, 'svg', 'dot');
            setDotSvgContent(svg);
          } catch (e: any) {
            console.error("DOT rendering error:", e);
            setDotError(`Failed to render DOT graph: ${e.message || 'Invalid DOT syntax.'}`);
          } finally {
            setIsDotLoading(false);
          }
        };
        renderDot();
      } else if (lang === 'dot' && !codeContent) { // Clear if code content is empty
        setDotSvgContent(null);
        setDotError(null);
        setIsDotLoading(false);
      }
    }, [codeContent, lang]);

    // Effect for Chart.js rendering - now automatic on codeContent change
    useEffect(() => {
      if (lang === 'chartjs' && codeContent) {
        setIsChartJsLoading(true);
        setChartJsError(null);

        // Destroy existing chart instance before creating a new one
        if (chartInstanceRef.current) {
          chartInstanceRef.current.destroy();
          chartInstanceRef.current = null;
        }

        try {
          // Remove comments from Chart.js JSON before parsing
          const cleanedCodeContent = codeContent.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
          const chartConfig = JSON.parse(cleanedCodeContent);
          if (chartCanvasRef.current) {
            const ctx = chartCanvasRef.current.getContext('2d');
            if (ctx) {
              chartInstanceRef.current = new Chart(ctx, chartConfig);

              // Add ResizeObserver for responsiveness
              if (chartContainerRef.current) {
                const resizeObserver = new ResizeObserver(() => {
                  if (chartInstanceRef.current) {
                    chartInstanceRef.current.resize(); // Chart.js has a resize method
                  }
                });
                resizeObserver.observe(chartContainerRef.current);

                // Cleanup ResizeObserver
                return () => {
                  resizeObserver.disconnect();
                  if (chartInstanceRef.current) {
                    chartInstanceRef.current.destroy();
                    chartInstanceRef.current = null;
                  }
                };
              }
            }
          }
        } catch (e: any) {
          console.error("Chart.js rendering error:", e);
          setChartJsError(`Failed to render Chart.js graph: ${e.message || 'Invalid JSON configuration.'}`);
        } finally {
          setIsChartJsLoading(false);
        }
      } else if (lang === 'chartjs' && !codeContent) { // Clear if code content is empty
        if (chartInstanceRef.current) {
          chartInstanceRef.current.destroy();
          chartInstanceRef.current = null;
        }
        setChartJsError(null);
        setIsChartJsLoading(false);
      }
      // Cleanup function for Chart.js effect
      return () => {
        if (chartInstanceRef.current) {
          chartInstanceRef.current.destroy();
          chartInstanceRef.current = null;
        }
      };
    }, [codeContent, lang]);


    // Create a ref for the Mermaid component
    const mermaidDiagramRef = useRef<HTMLDivElement>(null);

    // Handle Mermaid diagrams
    if (!inline && lang === 'mermaid') {
      return (
        <CodeBlockErrorBoundary
          fallback={
            <div className="my-4 p-4 bg-yellow-900 border border-yellow-700 rounded-lg">
              <div className="flex items-center gap-2 text-yellow-300">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">Mermaid Diagram Error</span>
              </div>
              <p className="text-sm text-yellow-400 mt-1">
                Failed to render Mermaid diagram. Raw content:
              </p>
              <pre className="text-sm text-gray-300 mt-2 p-2 bg-gray-800 rounded overflow-x-auto">
                {codeContent}
              </pre>
            </div>
          }
        >
          {/* Pass the mermaidDiagramRef to the Mermaid component */}
          <Mermaid
            chart={codeContent}
            onMermaidError={() => { }} // Provide an empty function or a proper handler
            diagramRef={mermaidDiagramRef}
          // onSuggestAiCorrection is optional, so no need to pass if not needed here
          />
        </CodeBlockErrorBoundary>
      );
    }

    // Handle DOT diagrams
    if (!inline && lang === 'dot') {
      return (
        <div className="my-4 p-3 sm:p-4 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg shadow-sm border border-gray-700">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                DOT Graph
              </span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copy(codeContent)}
                className="h-7 px-2 text-xs hover:bg-gray-700 whitespace-nowrap text-gray-300"
                title="Copy source code"
              >
                {copied ? <Check className="h-3 w-3 sm:mr-1 text-green-500" /> : <Copy className="h-3 w-3 sm:mr-1 text-gray-300" />}
                <span className="hidden sm:inline">Copy</span>
              </Button>
            </div>
          </div>

          {dotError && (
            <div className="my-2 p-3 bg-red-900 border border-red-700 rounded-md text-red-300 text-sm">
              <AlertTriangle className="inline h-4 w-4 mr-2" />
              {dotError}
              <pre className="mt-2 text-xs text-red-400 overflow-x-auto">{codeContent}</pre>
            </div>
          )}

          {/* Always render the container for the DOT graph */}
          <div ref={dotContainerRef} className="relative w-full h-80 bg-gray-700 p-4 rounded-lg shadow-inner flex items-center justify-center">
            {isDotLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-700 bg-opacity-75 z-10">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
              </div>
            )}
            {dotSvgContent && (
              <div
                className="dot-graph-container overflow-x-auto overflow-y-hidden p-2 w-full h-full"
                dangerouslySetInnerHTML={{ __html: dotSvgContent }}
              />
            )}
            {!isDotLoading && !dotError && !dotSvgContent && (
              <p className="text-sm text-gray-400">Enter DOT graph code to render.</p>
            )}
          </div>
        </div>
      );
    }

    // Handle Chart.js diagrams
    if (!inline && lang === 'chartjs') {
      return (
        <div className="my-4 p-3 sm:p-4 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg shadow-sm border border-gray-700">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Chart.js Graph
              </span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copy(codeContent)}
                className="h-7 px-2 text-xs hover:bg-gray-700 whitespace-nowrap text-gray-300"
                title="Copy source code"
              >
                {copied ? <Check className="h-3 w-3 sm:mr-1 text-green-500" /> : <Copy className="h-3 w-3 sm:mr-1 text-gray-300" />}
                <span className="hidden sm:inline">Copy</span>
              </Button>
            </div>
          </div>

          {chartJsError && (
            <div className="my-2 p-3 bg-red-900 border border-red-700 rounded-md text-red-300 text-sm">
              <AlertTriangle className="inline h-4 w-4 mr-2" />
              {chartJsError}
              <pre className="mt-2 text-xs text-red-400 overflow-x-auto">{codeContent}</pre>
            </div>
          )}

          {/* Always render the canvas for the Chart.js graph */}
          <div ref={chartContainerRef} className="relative w-full h-80 bg-gray-700 p-4 rounded-lg shadow-inner flex items-center justify-center">
            {isChartJsLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-700 bg-opacity-75 z-10">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
              </div>
            )}
            {/* The canvas element is always present here */}
            <canvas ref={chartCanvasRef}></canvas>
            {!isChartJsLoading && !chartJsError && !codeContent && (
              <p className="text-sm text-gray-400">Enter Chart.js configuration to render.</p>
            )}
          </div>
        </div>
      );
    }

    // Handle code blocks with syntax highlighting (including 'text' and 'plaintext')
    if (!inline && lang) {
      // For 'text' or 'plaintext', we don't apply syntax highlighting, just preserve whitespace
      const isPlainText = lang === 'text' || lang === 'plaintext';
      const renderedCode = isPlainText ? escapeHtml(codeContent) : highlightCode(codeContent, lang); // Use highlightCode

      return (
        <div className="relative my-4 rounded-lg overflow-hidden shadow-sm border border-gray-700">
          {/* Header with language badge and copy button */}
          <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-300 uppercase tracking-wide">
                {lang}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copy(codeContent)}
                className="h-6 w-6 p-0 text-gray-400 hover:text-gray-100 hover:bg-gray-700"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          {/* Code content with enhanced syntax highlighting */}
          <div className="p-4 bg-gray-900 overflow-x-auto">
            <pre className="font-mono text-sm leading-relaxed">
              <code
                className="text-gray-100"
                dangerouslySetInnerHTML={{
                  __html: renderedCode
                }}
              />
            </pre>
          </div>
        </div>
      );
    }

    // Inline code
    return (
      <code className="bg-purple-900 text-purple-300 px-2 py-1 rounded-md font-mono text-sm border border-purple-700" {...props}>
        {children}
      </code>
    );
  };

  // Enhanced syntax highlighting function
  const highlightCode = (code: string, language: string) => {
    try {
      const result = lowlight.highlight(language, code);
      return toHtml(result);
    } catch (error) {
      console.warn('Syntax highlighting failed:', error);
      return escapeHtml(code);
    }
  };

  // Helper function to escape HTML
  const escapeHtml = (text: string) => {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  };

  // Helper function to convert lowlight result to HTML with inline styles
  const toHtml = (result: any) => {
    const nodeToHtml = (node: any): string => {
      if (node.type === 'text') {
        return escapeHtml(node.value);
      }
      if (node.type === 'element') {
        const { tagName, properties, children } = node;
        const classNames = (properties?.className || []).join(' ');

        // Map highlight.js classes to inline styles for guaranteed rendering
        const styleMap: { [key: string]: string } = {
          'hljs-comment': 'color: #9ca3af; font-style: italic;', // gray-400
          'hljs-keyword': 'color: #c084fc; font-weight: 600;', // purple-300
          'hljs-string': 'color: #86efac;', // green-300
          'hljs-number': 'color: #fdba74;', // orange-200
          'hljs-built_in': 'color: #93c5fd; font-weight: 500;', // blue-300
          'hljs-function': 'color: #93c5fd; font-weight: 500;', // blue-300
          'hljs-variable': 'color: #bfdbfe;', // blue-200
          'hljs-type': 'color: #5eead4;', // teal-300
          'hljs-class': 'color: #fcd34d;', // amber-300
          'hljs-attr': 'color: #93c5fd;', // blue-300
          'hljs-tag': 'color: #f472b6;', // pink-300
          'hljs-operator': 'color: #fbcfe8;', // pink-200
          'hljs-literal': 'color: #fdba74;', // orange-200
          'hljs-meta': 'color: #7dd3fc;', // sky-300
          'hljs-title': 'color: #86efac;', // green-300
          'hljs-selector-tag': 'color: #c084fc;', // purple-300
          'hljs-selector-class': 'color: #86efac;', // green-300
          'hljs-selector-id': 'color: #fca5a5;', // red-300
          'hljs-regexp': 'color: #f472b6;', // pink-300
          'hljs-symbol': 'color: #fca5a5;', // red-300
          'hljs-bullet': 'color: #fbcfe8;', // pink-200
          'hljs-params': 'color: #fde68a;', // yellow-200
          'hljs-name': 'color: #93c5fd;', // blue-300
          'hljs-attribute': 'color: #fcd34d;', // amber-300
          'hljs-selector-attr': 'color: #67e8f9;', // cyan-300
          'hljs-selector-pseudo': 'color: #fbcfe8;', // pink-200
          'hljs-template-variable': 'color: #bfdbfe;', // blue-200
          'hljs-quote': 'color: #9ca3af; font-style: italic;', // gray-400
          'hljs-deletion': 'color: #f87171; background-color: #450a0a;', // red-400, bg-red-950
          'hljs-addition': 'color: #4ade80; background-color: #064e3b;', // green-400, bg-green-950
          'hljs-meta-keyword': 'color: #7dd3fc; font-weight: 600;', // sky-300
          'hljs-meta-string': 'color: #38bdf8;', // sky-400
          'hljs-subst': 'color: #c084fc;', // purple-300
          'hljs-section': 'color: #86efac;', // green-300
          'hljs-boolean': 'color: #fdba74;', // orange-200
        };

        let style = '';
        classNames.split(' ').forEach(cls => {
          if (styleMap[cls]) {
            style += styleMap[cls] + ' ';
          }
        });

        const childrenHtml = children?.map(nodeToHtml).join('') || '';
        return `<${tagName}${style ? ` style="${style.trim()}"` : ''}>${childrenHtml}</${tagName}>`;
      }
      return '';
    };

    return result.children.map(nodeToHtml).join('');
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 border border-slate-200 rounded-lg shadow-md dark:bg-gray-900 dark:border-gray-800 overflow-hidden">
      {/* Editor Header */}
      <div className="p-3 sm:p-4 border-b border-slate-200 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          {/* Mobile toggle for notes history */}
          {onToggleNotesHistory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleNotesHistory}
              className="lg:hidden h-8 w-8 p-0 mr-2 text-slate-600 hover:bg-slate-50 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              {isNotesHistoryOpen ? <FileText className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          )}
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title..."
            className="text-2xl font-bold border-none p-0 shadow-none focus-visible:ring-0 bg-transparent flex-1 min-w-0 text-slate-800 dark:text-gray-100"
          />
          {/* Desktop buttons */}
          <div className="hidden lg:flex items-center gap-2 flex-wrap justify-end">
            {/* Document Upload Button (Desktop) */}
            <label
              htmlFor="document-upload-input"
              className={`
                inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-9 px-3
                border border-input bg-background hover:bg-accent hover:text-accent-foreground
                text-slate-600 border-slate-200 hover:bg-slate-50
                dark:text-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100
                ${(isUploading || isGeneratingAI || isProcessingAudio || !userProfile) ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {isUploading ? (
                <Brain className="h-4 w-4 mr-2 animate-pulse" />
              ) : (
                <UploadCloud className="h-4 w-4 mr-2" />
              )}
              {isUploading ? 'Processing...' : 'Upload Doc & Generate'}
            </label>
            <input type="file" id="document-upload-input" ref={fileInputRef} onChange={handleFileSelect} style={{ position: 'absolute', left: '-9999px' }} accept=".pdf,.txt,.doc,.docx,audio/*" />

            {/* Audio Upload Button (Desktop) */}
            <label
              htmlFor="audio-upload-input"
              className={`
                inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-9 px-3
                border border-input bg-background hover:bg-accent hover:text-accent-foreground
                text-slate-600 border-slate-200 hover:bg-slate-50
                dark:text-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100
                ${(isProcessingAudio || isUploading || isGeneratingAI || !userProfile) ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {isProcessingAudio ? (
                <Brain className="h-4 w-4 mr-2 animate-pulse" />
              ) : (
                <Mic className="h-4 w-4 mr-2" />
              )}
              {isProcessingAudio ? 'Uploading Audio...' : 'Upload Audio'}
            </label>
            <input type="file" id="audio-upload-input" ref={audioInputRef} onChange={handleAudioFileSelect} style={{ position: 'absolute', left: '-9999px' }} accept="audio/*" />

            <Button
              variant="outline"
              size="sm"
              onClick={regenerateNoteFromDocument}
              disabled={isUploading || isGeneratingAI || isProcessingAudio || !note.document_id}
              className="text-slate-600 border-slate-200 hover:bg-slate-50 dark:text-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100"
            >
              {isGeneratingAI ? (
                <Brain className="h-4 w-4 mr-2 animate-pulse" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {isGeneratingAI ? 'Generating...' : 'Regenerate Note'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleViewOriginalDocument}
              disabled={!note.document_id || isLoadingDocument || isProcessingAudio}
              className="text-slate-600 border-slate-200 hover:bg-slate-50 dark:text-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100"
            >
              {isLoadingDocument ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              View Original Document
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadNote}
              disabled={!content.trim()}
              className="text-slate-600 border-slate-200 hover:bg-slate-50 dark:text-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Markdown
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={!content.trim()}
              className="text-slate-600 border-slate-200 hover:bg-slate-50 dark:text-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100"
            >
              <FileDown className="h-4 w-4 mr-2" />
              Download PDF
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyNoteContent}
              disabled={!content.trim()}
              className="text-slate-600 border-slate-200 hover:bg-slate-50 dark:text-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Content
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleTextToSpeech}
              disabled={isUploading || isGeneratingAI || isProcessingAudio}
              className="text-slate-600 border-slate-200 hover:bg-slate-50 dark:text-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100"
            >
              {isSpeaking ? (
                <StopCircle className="h-4 w-4 mr-2 animate-pulse text-red-500" />
              ) : (
                <Volume2 className="h-4 w-4 mr-2" />
              )}
              {isSpeaking ? 'Stop' : 'Read Aloud'}
            </Button>
            <Button onClick={handleSave} size="sm" className="bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md hover:from-blue-700 hover:to-purple-700">
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
              className="text-slate-600 border-slate-200 hover:bg-slate-50 dark:text-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100"
            >
              {isEditing ? 'Full Preview' : 'Edit with Live Preview'}
            </Button>
          </div>

          {/* Mobile buttons toggler */}
          <div className="relative lg:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-slate-600 border-slate-200 hover:bg-slate-50 dark:text-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100"
            >
              <Menu className="h-4 w-4" />
              <span className="ml-2">More</span>
            </Button>
            {isMobileMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-md shadow-lg z-10 flex flex-col py-2 dark:bg-gray-800 dark:border-gray-700">
                {/* Action Buttons */}
                <label
                  htmlFor="document-upload-input-mobile"
                  className={`
                    inline-flex items-center justify-start whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-9 px-4 py-2
                    text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-700
                    ${(isUploading || isGeneratingAI || isProcessingAudio || !userProfile) ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                // Removed onClick={handleMobileMenuClose}
                >
                  {isUploading ? (
                    <Brain className="h-4 w-4 mr-2 animate-pulse" />
                  ) : (
                    <UploadCloud className="h-4 w-4 mr-2" />
                  )}
                  {isUploading ? 'Processing...' : 'Upload Doc & Generate'}
                </label>
                <input type="file" id="document-upload-input-mobile" ref={fileInputRef} onChange={handleFileSelect} style={{ position: 'absolute', left: '-9999px' }} accept=".pdf,.txt,.doc,.docx,audio/*" />

                <label
                  htmlFor="audio-upload-input-mobile"
                  className={`
                    inline-flex items-center justify-start whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-9 px-4 py-2
                    text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-700
                    ${(isProcessingAudio || isUploading || isGeneratingAI || !userProfile) ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                // Removed onClick={handleMobileMenuClose}
                >
                  {isProcessingAudio ? (
                    <Brain className="h-4 w-4 mr-2 animate-pulse" />
                  ) : (
                    <Mic className="h-4 w-4 mr-2" />
                  )}
                  {isProcessingAudio ? 'Uploading Audio...' : 'Upload Audio'}
                </label>
                <input type="file" id="audio-upload-input-mobile" ref={audioInputRef} onChange={handleAudioFileSelect} style={{ position: 'absolute', left: '-9999px' }} accept="audio/*" />

                <Button
                  variant="ghost"
                  className="justify-start px-4 py-2 text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  onClick={() => { regenerateNoteFromDocument(); handleMobileMenuClose(); }}
                  disabled={isUploading || isGeneratingAI || isProcessingAudio || !note.document_id}
                >
                  {isGeneratingAI ? (
                    <Brain className="h-4 w-4 mr-2 animate-pulse" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {isGeneratingAI ? 'Generating...' : 'Regenerate Note'}
                </Button>
                {/* New "View Original Document" button for mobile */}
                <Button
                  variant="ghost"
                  className="justify-start px-4 py-2 text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  onClick={() => { handleViewOriginalDocument(); handleMobileMenuClose(); }}
                  disabled={!note.document_id || isLoadingDocument || isProcessingAudio}
                >
                  {isLoadingDocument ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4 mr-2" />
                  )}
                  View Original Document
                </Button>
                {/* New "Download Note" button for mobile */}
                <Button
                  variant="ghost"
                  className="justify-start px-4 py-2 text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  onClick={() => { handleDownloadNote(); handleMobileMenuClose(); }}
                  disabled={!content.trim()}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Markdown
                </Button>
                {/* New "Download PDF" button for mobile */}
                <Button
                  variant="ghost"
                  className="justify-start px-4 py-2 text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  onClick={() => { handleDownloadPdf(); handleMobileMenuClose(); }}
                  disabled={!content.trim()}
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
                {/* New "Copy Note Content" button for mobile */}
                <Button
                  variant="ghost"
                  className="justify-start px-4 py-2 text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  onClick={() => { handleCopyNoteContent(); handleMobileMenuClose(); }}
                  disabled={!content.trim()}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Content
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start px-4 py-2 text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  onClick={() => { handleTextToSpeech(); handleMobileMenuClose(); }}
                  disabled={isUploading || isGeneratingAI || isProcessingAudio}
                >
                  {isSpeaking ? (
                    <StopCircle className="h-4 w-4 mr-2 animate-pulse text-red-500" />
                  ) : (
                    <Volume2 className="h-4 w-4 mr-2" />
                  )}
                  {isSpeaking ? 'Stop' : 'Read Aloud'}
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md hover:from-blue-700 hover:to-purple-700"
                  onClick={() => { handleSave(); handleMobileMenuClose(); }}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
                <Button
                  variant="ghost"
                  className="justify-start px-4 py-2 text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  onClick={() => { setIsEditing(!isEditing); handleMobileMenuClose(); }}
                >
                  {isEditing ? <FileText className="h-4 w-4 mr-2" /> : <Menu className="h-4 w-4 mr-2" />}
                  {isEditing ? 'Full Preview' : 'Edit with Live Preview'}
                </Button>

                {/* Separator */}
                <div className="border-t border-slate-200 my-2 mx-4 dark:border-gray-700" />
                <p className="text-sm font-semibold text-slate-600 px-4 mb-2 dark:text-gray-300">Note Settings</p>

                {/* Category Select */}
                <div className="px-4 py-2">
                  <Select value={category} onValueChange={(value: NoteCategory) => setCategory(value)}>
                    <SelectTrigger className="w-full dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600">
                      <SelectValue placeholder="Select Category" />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                      <SelectItem value="general" className="dark:text-gray-100 dark:hover:bg-gray-600">General</SelectItem>
                      <SelectItem value="math" className="dark:text-gray-100 dark:hover:bg-gray-600">Mathematics</SelectItem>
                      <SelectItem value="science" className="dark:text-gray-100 dark:hover:bg-gray-600">Science</SelectItem>
                      <SelectItem value="history" className="dark:text-gray-100 dark:hover:bg-gray-600">History</SelectItem>
                      <SelectItem value="language" className="dark:text-gray-100 dark:hover:bg-gray-600">Languages</SelectItem>
                      <SelectItem value="other" className="dark:text-gray-100 dark:hover:bg-gray-600">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Voice Select */}
                <div className="px-4 py-2">
                  <Select
                    value={selectedVoiceURI || ''}
                    onValueChange={(value) => setSelectedVoiceURI(value)}
                    disabled={isSpeaking || voices.length === 0}
                  >
                    <SelectTrigger className="w-full dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600">
                      <SelectValue placeholder="Select a voice" />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                      {voices.map((voice, index) => (
                        <SelectItem key={`${voice.voiceURI}-${index.toString()}`} value={voice.voiceURI} className="dark:text-gray-100 dark:hover:bg-gray-600">
                          {`${voice.name} (${voice.lang})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Tags Input */}
                <div className="flex items-center gap-2 px-4 py-2">
                  <Hash className="h-4 w-4 text-slate-400 dark:text-gray-500" />
                  <Input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="Add tags (comma separated)..."
                    className="border-none shadow-none focus-visible:ring-0 bg-transparent flex-1 text-slate-700 dark:text-gray-200"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* This section is now hidden on mobile and moved into the toggler */}
        <div className="hidden lg:flex items-center gap-4 flex-wrap">
          <Select value={category} onValueChange={(value: NoteCategory) => setCategory(value)}>
            <SelectTrigger className="w-40 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
              <SelectItem value="general" className="dark:text-gray-100 dark:hover:bg-gray-700">General</SelectItem>
              <SelectItem value="math" className="dark:text-gray-100 dark:hover:bg-gray-700">Mathematics</SelectItem>
              <SelectItem value="science" className="dark:text-gray-100 dark:hover:bg-gray-700">Science</SelectItem>
              <SelectItem value="history" className="dark:text-gray-100 dark:hover:bg-gray-700">History</SelectItem>
              <SelectItem value="language" className="dark:text-gray-100 dark:hover:bg-gray-700">Languages</SelectItem>
              <SelectItem value="other" className="dark:text-gray-100 dark:hover:bg-gray-700">Other</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={selectedVoiceURI || ''}
            onValueChange={(value) => setSelectedVoiceURI(value)}
            disabled={isSpeaking || voices.length === 0}
          >
            <SelectTrigger className="w-full sm:w-[240px] dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700">
              <SelectValue placeholder="Select a voice" />
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
              {voices.map((voice, index) => (
                <SelectItem key={`${voice.voiceURI}-${index.toString()}`} value={voice.voiceURI} className="dark:text-gray-100 dark:hover:bg-gray-700">
                  {`${voice.name} (${voice.lang})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Hash className="h-4 w-4 text-slate-400 dark:text-gray-500" />
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Add tags (comma separated)..."
              className="border-none shadow-none focus-visible:ring-0 bg-transparent flex-1 text-slate-700 dark:text-gray-200"
            />
          </div>
        </div>
      </div>

      {/* Audio Options Panel */}
      {uploadedAudioDetails && isAudioOptionsVisible && (
        <div className="p-3 sm:p-4 border-b border-slate-200 bg-slate-50 dark:bg-gray-900 dark:border-gray-800 flex flex-col gap-3">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-gray-100">Audio Options: {uploadedAudioDetails.name}</h3>
          <audio ref={audioPlayerRef} src={uploadedAudioDetails.url} onEnded={handleAudioEnded} className="w-full hidden" />
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePlayAudio}
              disabled={isGeneratingAudioNote || isGeneratingAudioSummary || isTranslatingAudio || isProcessingAudio}
              className="text-slate-600 border-slate-200 hover:bg-slate-50 dark:text-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100"
            >
              {isPlayingAudio ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {isPlayingAudio ? 'Pause Audio' : 'Play Audio'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadAudio}
              disabled={isGeneratingAudioNote || isGeneratingAudioSummary || isTranslatingAudio || isProcessingAudio}
              className="text-slate-600 border-slate-200 hover:bg-slate-50 dark:text-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Audio
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyAudioUrl}
              disabled={isGeneratingAudioNote || isGeneratingAudioSummary || isTranslatingAudio || isProcessingAudio}
              className="text-slate-600 border-slate-200 hover:bg-slate-50 dark:text-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100"
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Audio URL
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAudioProcessing}
              disabled={isGeneratingAudioNote || isGeneratingAudioSummary || isTranslatingAudio || isProcessingAudio}
              className="text-slate-600 hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Clear Audio
            </Button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={handleGenerateNoteFromAudio}
              disabled={isGeneratingAudioNote || isGeneratingAudioSummary || isTranslatingAudio || isProcessingAudio || !userProfile}
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md hover:from-blue-700 hover:to-purple-700"
            >
              {isGeneratingAudioNote ? (
                <Brain className="h-4 w-4 mr-2 animate-pulse" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {isGeneratingAudioNote ? 'Generating Note...' : 'Generate Full Note'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleGenerateSummaryFromAudio}
              disabled={isGeneratingAudioNote || isGeneratingAudioSummary || isTranslatingAudio || isProcessingAudio || !userProfile}
              className="bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              {isGeneratingAudioSummary ? (
                <Brain className="h-4 w-4 mr-2 animate-pulse" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {isGeneratingAudioSummary ? 'Generating Summary...' : 'Generate Only Summary'}
            </Button>
            <Select value={targetLanguage} onValueChange={setTargetLanguage} disabled={isGeneratingAudioNote || isGeneratingAudioSummary || isTranslatingAudio || isProcessingAudio}>
              <SelectTrigger className="w-[180px] dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600">
                <SelectValue placeholder="Translate to..." />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                <SelectItem value="en" className="dark:text-gray-100 dark:hover:bg-gray-600">English</SelectItem>
                <SelectItem value="es" className="dark:text-gray-100 dark:hover:bg-gray-600">Spanish</SelectItem>
                <SelectItem value="fr" className="dark:text-gray-100 dark:hover:bg-gray-600">French</SelectItem>
                <SelectItem value="de" className="dark:text-gray-100 dark:hover:bg-gray-600">German</SelectItem>
                <SelectItem value="zh" className="dark:text-gray-100 dark:hover:bg-gray-600">Chinese</SelectItem>
                <SelectItem value="ja" className="dark:text-gray-100 dark:hover:bg-gray-600">Japanese</SelectItem>
                <SelectItem value="ko" className="dark:text-gray-100 dark:hover:bg-gray-600">Korean</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTranslateAudio}
              disabled={isGeneratingAudioNote || isGeneratingAudioSummary || isTranslatingAudio || isProcessingAudio || targetLanguage === 'en' || !userProfile}
              className="text-slate-600 border-slate-200 hover:bg-slate-50 dark:text-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100"
            >
              {isTranslatingAudio ? (
                <Brain className="h-4 w-4 mr-2 animate-pulse" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              {isTranslatingAudio ? 'Translating...' : 'Translate Transcript'}
            </Button>
          </div>
        </div>
      )}

      {/* Main Content Area (Editor/Preview + AI Summary) */}
      {/* This flex container now manages the layout for editor/preview and the AI Summary */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Editor/Preview Area */}
        {isEditing ? (
          // Split view: Textarea on left, ReactMarkdown preview on right
          <div className="flex-1 p-3 sm:p-6 flex flex-col dark:bg-gray-800 lg:flex-row gap-4 modern-scrollbar overflow-y-auto min-w-0">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Start writing your note here..."
              className="flex-1 resize-none border shadow-sm focus-visible:ring-0 text-base leading-relaxed dark:bg-gray-800 min-h-[50vh] lg:min-h-0 border-slate-200 dark:border-gray-700 dark:text-gray-100"
            />
            <div className="flex-1 prose prose-sm max-w-none text-slate-700 leading-relaxed modern-scrollbar overflow-y-auto min-h-[50vh] lg:min-h-0 border rounded-md p-4 shadow-sm border-slate-200 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-200" id="note-preview-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  code: CodeRenderer,
                  table: ({ node, ...props }) => (
                    <div className="overflow-x-auto my-4 rounded-lg shadow-md border border-slate-200 dark:border-gray-700">
                      <table className="w-full border-collapse" {...props} />
                    </div>
                  ),
                  thead: ({ node, ...props }) => <thead className="bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900" {...props} />,
                  th: ({ node, ...props }) => <th className="p-3 text-left border-b border-slate-300 font-semibold text-slate-800 dark:border-gray-600 dark:text-gray-100" {...props} />,
                  td: ({ node, ...props }) => <td className="p-3 border-b border-slate-200 group-last:border-b-0 even:bg-slate-50 hover:bg-blue-50 transition-colors dark:border-gray-700 dark:even:bg-gray-800 dark:hover:bg-blue-900 dark:text-gray-200" {...props} />,
                  h1: ({ node, ...props }) => <h1 className="text-3xl font-extrabold text-blue-700 mt-6 mb-3 dark:text-blue-400" {...props} />,
                  h2: ({ node, ...props }) => <h2 className="text-2xl font-bold text-purple-700 mt-5 mb-2 dark:text-purple-400" {...props} />,
                  h3: ({ node, ...props }) => <h3 className="text-xl font-semibold text-green-700 mt-4 mb-2 dark:text-green-400" {...props} />,
                  h4: ({ node, ...props }) => <h4 className="text-lg font-semibold text-orange-700 mt-3 mb-1 dark:text-orange-400" {...props} />,
                  ul: ({ node, ...props }) => <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-gray-200" {...props} />,
                  ol: ({ node, ...props }) => <ol className="list-decimal list-inside space-y-1 text-slate-700 dark:text-gray-200" {...props} />,
                  blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-blue-400 pl-4 py-2 italic text-slate-600 bg-blue-50 rounded-r-md my-4 dark:border-blue-700 dark:text-gray-300 dark:bg-blue-950" {...props} />,
                  p: ({ node, ...props }) => <p className="mb-3 text-slate-700 leading-relaxed dark:text-gray-200" {...props} />,
                  a: ({ node, ...props }) => <a className="text-blue-600 hover:underline dark:text-blue-400 dark:hover:underline" {...props} />,
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          </div>
        ) : (
          // Full preview mode
          <div className="flex-1 p-3 sm:p-6 flex flex-col overflow-y-auto min-w-0">
            <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed flex-1 modern-scrollbar overflow-y-auto min-h-0 dark:text-gray-200" id="note-preview-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  code: CodeRenderer,
                  table: ({ node, ...props }) => (
                    <div className="overflow-x-auto my-4 rounded-lg shadow-md border border-slate-200 dark:border-gray-700">
                      <table className="w-full border-collapse" {...props} />
                    </div>
                  ),
                  thead: ({ node, ...props }) => <thead className="bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900" {...props} />,
                  th: ({ node, ...props }) => <th className="p-3 text-left border-b border-slate-300 font-semibold text-slate-800 dark:border-gray-600 dark:text-gray-100" {...props} />,
                  td: ({ node, ...props }) => <td className="p-3 border-b border-slate-200 group-last:border-b-0 even:bg-slate-50 hover:bg-blue-50 transition-colors dark:border-gray-700 dark:even:bg-gray-800 dark:hover:bg-blue-900 dark:text-gray-200" {...props} />,
                  h1: ({ node, ...props }) => <h1 className="text-3xl font-extrabold text-blue-700 mt-6 mb-3 dark:text-blue-400" {...props} />,
                  h2: ({ node, ...props }) => <h2 className="text-2xl font-bold text-purple-700 mt-5 mb-2 dark:text-purple-400" {...props} />,
                  h3: ({ node, ...props }) => <h3 className="text-xl font-semibold text-green-700 mt-4 mb-2 dark:text-green-400" {...props} />,
                  h4: ({ node, ...props }) => <h4 className="text-lg font-semibold text-orange-700 mt-3 mb-1 dark:text-orange-400" {...props} />,
                  ul: ({ node, ...props }) => <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-gray-200" {...props} />,
                  ol: ({ node, ...props }) => <ol className="list-decimal list-inside space-y-1 text-slate-700 dark:text-gray-200" {...props} />,
                  blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-blue-400 pl-4 py-2 italic text-slate-600 bg-blue-50 rounded-r-md my-4 dark:border-blue-700 dark:text-gray-300 dark:bg-blue-950" {...props} />,
                  p: ({ node, ...props }) => <p className="mb-3 text-slate-700 leading-relaxed dark:text-gray-200" {...props} />,
                  a: ({ node, ...props }) => <a className="text-blue-600 hover:underline dark:text-blue-400 dark:hover:underline" {...props} />,
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* AI Summary Section - Now positioned responsively */}
        {note.aiSummary && (
          <>
            {/* Mobile backdrop for summary */}
            {isSummaryVisible && (
              <div
                className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                onClick={() => setIsSummaryVisible(false)}
              />
            )}
            <div
              className={`
                lg:w-1/3 lg:max-w-sm lg:flex-shrink-0 lg:border-l lg:border-slate-200 lg:relative lg:h-auto lg:transform-none lg:rounded-none
                fixed bottom-0 left-0 right-0 h-1/2 bg-gradient-to-r from-blue-50 to-purple-50 z-50
                transition-transform duration-300 ease-in-out transform
                ${isSummaryVisible ? 'translate-y-0' : 'translate-y-full'}
                flex flex-col
                p-3 sm:p-6
                dark:from-blue-950 dark:to-purple-950 dark:border-l-gray-800
              `}
            >
              <div className="flex items-center justify-between gap-2 mb-3 cursor-pointer" onClick={() => setIsSummaryVisible(!isSummaryVisible)}>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  <h4 className="font-medium text-slate-800 dark:text-gray-100">AI Summary</h4>
                </div>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-600 hover:bg-slate-50 dark:text-gray-400 dark:hover:bg-gray-800">
                  {isSummaryVisible ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </Button>
              </div>
              <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed modern-scrollbar overflow-y-auto flex-1 dark:text-gray-200">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={{
                    code: CodeRenderer,
                    table: ({ node, ...props }) => (
                      <div className="overflow-x-auto my-4 rounded-lg shadow-md border border-slate-200 dark:border-gray-700">
                        <table className="w-full border-collapse" {...props} />
                      </div>
                    ),
                    thead: ({ node, ...props }) => <thead className="bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900" {...props} />,
                    th: ({ node, ...props }) => <th className="p-3 text-left border-b border-slate-300 font-semibold text-slate-800 dark:border-gray-600 dark:text-gray-100" {...props} />,
                    td: ({ node, ...props }) => <td className="p-3 border-b border-slate-200 group-last:border-b-0 even:bg-slate-50 hover:bg-blue-50 transition-colors dark:border-gray-700 dark:even:bg-gray-800 dark:hover:bg-blue-900 dark:text-gray-200" {...props} />,
                    h1: ({ node, ...props }) => <h1 className="text-3xl font-extrabold text-blue-700 mt-6 mb-3 dark:text-blue-400" {...props} />,
                    h2: ({ node, ...props }) => <h2 className="text-2xl font-bold text-purple-700 mt-5 mb-2 dark:text-purple-400" {...props} />,
                    h3: ({ node, ...props }) => <h3 className="text-xl font-semibold text-green-700 mt-4 mb-2 dark:text-green-400" {...props} />,
                    h4: ({ node, ...props }) => <h4 className="text-lg font-semibold text-orange-700 mt-3 mb-1 dark:text-orange-400" {...props} />,
                    ul: ({ node, ...props }) => <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-gray-200" {...props} />,
                    ol: ({ node, ...props }) => <ol className="list-decimal list-inside space-y-1 text-slate-700 dark:text-gray-200" {...props} />,
                    blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-blue-400 pl-4 py-2 italic text-slate-600 bg-blue-50 rounded-r-md my-4 dark:border-blue-700 dark:text-gray-300 dark:bg-blue-950" {...props} />,
                    p: ({ node, ...props }) => <p className="mb-3 text-slate-700 leading-relaxed dark:text-gray-200" {...props} />,
                    a: ({ node, ...props }) => <a className="text-blue-600 hover:underline dark:text-blue-400 dark:hover:underline" {...props} />,
                  }}
                >
                  {note.aiSummary}
                </ReactMarkdown>
              </div>
            </div>
          </>
        )}

        {/* Translated Content Section - Still at the bottom, but within the main content area */}
        {translatedContent && (
          <div className="p-3 sm:p-6 border-t border-slate-200 bg-slate-50 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between gap-2 mb-3 cursor-pointer" onClick={() => setTranslatedContent(null)}>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-600 dark:text-gray-400" />
                <h4 className="font-medium text-slate-800 dark:text-gray-100">Translated Content ({targetLanguage.toUpperCase()})</h4>
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-600 hover:bg-slate-50 dark:text-gray-400 dark:hover:bg-gray-800">
                <ChevronUp className="h-4 w-4" />
              </Button>
            </div>
            <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed dark:text-gray-200">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  code: CodeRenderer,
                  table: ({ node, ...props }) => (
                    <div className="overflow-x-auto my-4 rounded-lg shadow-md border border-slate-200 dark:border-gray-700">
                      <table className="w-full border-collapse" {...props} />
                    </div>
                  ),
                  thead: ({ node, ...props }) => <thead className="bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900" {...props} />,
                  th: ({ node, ...props }) => <th className="p-3 text-left border-b border-slate-300 font-semibold text-slate-800 dark:border-gray-600 dark:text-gray-100" {...props} />,
                  td: ({ node, ...props }) => <td className="p-3 border-b border-slate-200 group-last:border-b-0 even:bg-slate-50 hover:bg-blue-50 transition-colors dark:border-gray-700 dark:even:bg-gray-800 dark:hover:bg-blue-900 dark:text-gray-200" {...props} />,
                  h1: ({ node, ...props }) => <h1 className="text-3xl font-extrabold text-blue-700 mt-6 mb-3 dark:text-blue-400" {...props} />,
                  h2: ({ node, ...props }) => <h2 className="text-2xl font-bold text-purple-700 mt-5 mb-2 dark:text-purple-400" {...props} />,
                  h3: ({ node, ...props }) => <h3 className="text-xl font-semibold text-green-700 mt-4 mb-2 dark:text-green-400" {...props} />,
                  h4: ({ node, ...props }) => <h4 className="text-lg font-semibold text-orange-700 mt-3 mb-1 dark:text-orange-400" {...props} />,
                  ul: ({ node, ...props }) => <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-gray-200" {...props} />,
                  ol: ({ node, ...props }) => <ol className="list-decimal list-inside space-y-1 text-slate-700 dark:text-gray-200" {...props} />,
                  blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-blue-400 pl-4 py-2 italic text-slate-600 bg-blue-50 rounded-r-md my-4 dark:border-blue-700 dark:text-gray-300 dark:bg-blue-950" {...props} />,
                  p: ({ node, ...props }) => <p className="mb-3 text-slate-700 leading-relaxed dark:text-gray-200" {...props} />,
                  a: ({ node, ...props }) => <a className="text-blue-600 hover:underline dark:text-blue-400 dark:hover:underline" {...props} />,
                }}
              >
                {translatedContent}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>


      <SectionSelectionDialog
        isOpen={isSectionDialogOpen}
        sections={documentSections}
        onSectionSelect={handleSectionSelect}
        onCancel={() => {
          setIsSectionDialogOpen(false);
          setIsUploading(false);
          setSelectedFile(null);
          setExtractedContent(null);
        }}
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
