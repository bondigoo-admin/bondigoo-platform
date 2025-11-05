import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, X, Download, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import Draggable from 'react-draggable';
import { Resizable } from 'react-resizable';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import debounce from 'lodash/debounce';
import jsPDF from 'jspdf';
import { logger } from '../utils/logger';
import { useVideoSocket } from '../contexts/SocketContext';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card.tsx';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu.tsx';

const NotesPanel = ({ sessionId, participantId, onClose, isCoach, userId }) => {
  const { t } = useTranslation();
  const [notesFiles, setNotesFiles] = useState([{ id: 'default', title: t('session.mainNotes'), html: '' }]);
  const [activeFileId, setActiveFileId] = useState('default');
  const [isSaving, setIsSaving] = useState(false);
  const [newFileTitle, setNewFileTitle] = useState('');
  const [panelSize, setPanelSize] = useState({ width: 500, height: 450 });
  const nodeRef = useRef(null);
  const quillRef = useRef(null);
  const token = localStorage.getItem('token') || '';
  const { socket, isConnected, connectionError } = useVideoSocket();

  const activeFile = notesFiles.find((file) => file.id === activeFileId) || notesFiles[0];

  useEffect(() => {
    const fetchNotes = async () => {
      if (!sessionId || !userId) {
        logger.warn('[NotesPanel] Missing sessionId or userId', { sessionId, userId });
        return;
      }
      try {
        const response = await axios.get(`/api/sessions/${sessionId}/notes/private/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        logger.info('[NotesPanel] Raw notes fetch response', { sessionId, userId, responseData: response.data });
        const fetchedFilesRaw = response.data.notesFiles || [];
        const fetchedFiles = fetchedFilesRaw
          .filter(file => file && typeof file === 'object' && file.id && file.title && typeof file.html === 'string')
          .length > 0
          ? fetchedFilesRaw
          : [{ id: 'default', title: t('session.mainNotes'), html: '' }];
        logger.info('[NotesPanel] Processed fetched notes', { sessionId, userId, fetchedFiles });
        setNotesFiles(fetchedFiles);
        setActiveFileId(fetchedFiles[0].id);
        logger.info('[NotesPanel] Notes fetched successfully', { sessionId, userId, notesCount: fetchedFiles.length });
      } catch (error) {
        logger.error('[NotesPanel] Fetch notes error', { error: error.message, sessionId, userId });
        toast.error(t('notesPanel.fetchError'));
      }
    };
    fetchNotes();
  }, [sessionId, userId, token, t]);

  useEffect(() => {
    if (!socket || !isConnected) {
      logger.warn('[NotesPanel] Socket not ready for listeners', { sessionId, userId, isConnected, connectionError });
      return;
    }

    logger.info('[NotesPanel] Setting up socket listeners', { sessionId, userId, socketId: socket.id });

    const handleNotesUpdated = ({ userId: updatedUserId, notesFiles: updatedNotesFiles }) => {
      if (updatedUserId !== userId) return;
      logger.info('[NotesPanel] Notes updated event received', { sessionId, userId, notesCount: updatedNotesFiles.length });
      setNotesFiles((prev) => {
        const newFiles = updatedNotesFiles.length > 0 
          ? updatedNotesFiles 
          : [{ id: 'default', title: t('session.mainNotes'), html: '' }];
        const deletedFileIds = prev.filter(p => !newFiles.some(n => n.id === p.id)).map(f => f.id);
        if (deletedFileIds.length > 0) {
          logger.info('[NotesPanel] Detected note file deletion via socket', { sessionId, userId, deletedFileIds });
        }
        const activeExists = newFiles.some(file => file.id === activeFileId);
        if (!activeExists && newFiles.length > 0) {
          setActiveFileId(newFiles[0].id);
          logger.info('[NotesPanel] Adjusted active file due to deletion', { sessionId, userId, newActiveId: newFiles[0].id });
        }
        return newFiles;
      });
    };

    socket.on('notes-updated-private', handleNotesUpdated);

    return () => {
      logger.info('[NotesPanel] Cleaning up socket listeners', { sessionId, userId });
      socket.off('notes-updated-private', handleNotesUpdated);
    };
  }, [socket, isConnected, sessionId, userId, t, connectionError, activeFileId]);

  const saveNotes = useCallback(
    async (updatedFiles) => {
      if (!sessionId || !userId) {
        logger.warn('[NotesPanel] Skipping save due to missing sessionId or userId', { sessionId, userId });
        return;
      }
      const validFiles = updatedFiles.filter(file => 
        file && typeof file === 'object' && file.id && file.title && typeof file.html === 'string'
      );
      if (validFiles.length === 0) {
        logger.warn('[NotesPanel] No valid note files to save after filtering', { sessionId, userId, originalCount: updatedFiles.length });
        return;
      }
      logger.info('[NotesPanel] Preparing to save valid notes', { sessionId, userId, validFilesCount: validFiles.length });
      setIsSaving(true);
      try {
        await axios.put(
          `/api/sessions/${sessionId}/notes/private/${userId}`,
          { notesFiles: validFiles },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        logger.info('[NotesPanel] Notes saved successfully', { sessionId, userId, notesCount: validFiles.length });
      } catch (error) {
        logger.error('[NotesPanel] Save notes error', { error: error.message, sessionId, userId, status: error.response?.status });
        toast.error(t('notesPanel.notesUpdateFailed'));
      } finally {
        setIsSaving(false);
      }
    },
    [sessionId, userId, token, t]
  );

  const debouncedSaveNotes = useCallback(debounce(saveNotes, 1000), [saveNotes]);

  const handleNotesChange = (content) => {
    const updatedFiles = notesFiles.map((file) =>
      file.id === activeFileId ? { ...file, html: content } : file
    );
    logger.info('[NotesPanel] Notes changed, preparing to save', { sessionId, userId, updatedFiles });
    setNotesFiles(updatedFiles);
    debouncedSaveNotes(updatedFiles);
  };

  const handleDeleteFile = async (fileIdToDelete) => {
    if (!window.confirm(t('notesPanel.confirmDeleteNote'))) return;
    if (notesFiles.length <= 1) {
      toast.error(t('notesPanel.cannotDeleteLastNote'));
      logger.warn('[NotesPanel] Attempted to delete the last note file', { sessionId, userId, fileId: fileIdToDelete });
      return;
    }
  
    const originalFiles = [...notesFiles];
    const updatedFiles = notesFiles.filter(file => file.id !== fileIdToDelete);
    logger.info('[NotesPanel] Optimistically deleting note file', { sessionId, userId, fileId: fileIdToDelete, remainingCount: updatedFiles.length });
    setNotesFiles(updatedFiles);
  
    if (activeFileId === fileIdToDelete) {
      setActiveFileId(updatedFiles[0].id);
      logger.info('[NotesPanel] Switched active file after deletion', { sessionId, userId, newActiveId: updatedFiles[0].id });
    }
  
    try {
      await axios.put(
        `/api/sessions/${sessionId}/notes/private/${userId}`,
        { notesFiles: updatedFiles },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      logger.info('[NotesPanel] Note file deleted successfully', { sessionId, userId, fileId: fileIdToDelete });
      toast.success(t('notesPanel.deleteSuccess'));
    } catch (error) {
      logger.error('[NotesPanel] Delete note file error', { error: error.message, sessionId, userId, fileId: fileIdToDelete });
      setNotesFiles(originalFiles);
      toast.error(t('notesPanel.deleteError'));
    }
  };
  
  const addNewFile = () => {
    if (!newFileTitle.trim()) {
      toast.error(t('notesPanel.emptyTitleError'));
      return;
    }
    const newId = `temp-${Date.now()}`;
    const newFile = { id: newId, title: newFileTitle.trim(), html: '' };
    const updatedFiles = [...notesFiles, newFile];
    logger.info('[NotesPanel] Adding new note file', { sessionId, userId, updatedFiles });
    setNotesFiles(updatedFiles);
    setActiveFileId(newId);
    setNewFileTitle('');
    debouncedSaveNotes(updatedFiles);
    logger.info('[NotesPanel] New note file added optimistically', { sessionId, userId, newId });
  };

  const handleExport = (format) => {
    if (!quillRef.current) return;
    const quill = quillRef.current.getEditor();
    const text = quill.getText();
    switch (format) {
      case 'pdf':
        const doc = new jsPDF();
        doc.text(`Notes: ${activeFile.title}\n\n${text}`, 10, 10);
        doc.save(`${activeFile.title}.pdf`);
        break;
      case 'txt':
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeFile.title}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        break;
      default:
        break;
    }
    logger.info('[NotesPanel] Notes exported', { sessionId, userId, format, title: activeFile.title });
  };

  const onResize = (event, { size }) => {
    setPanelSize({ width: size.width, height: size.height });
  };

  return (
    <>
      <style>
        {`
          .notes-quill .ql-toolbar {
            background-color: hsl(var(--muted));
            border-color: hsl(var(--border));
            border-top-left-radius: var(--radius);
            border-top-right-radius: var(--radius);
          }
          .notes-quill .ql-container {
            background-color: hsl(var(--background));
            color: hsl(var(--foreground));
            border-color: hsl(var(--border));
            border-bottom-left-radius: var(--radius);
            border-bottom-right-radius: var(--radius);
          }
          .notes-quill .ql-editor {
            min-height: 100px;
          }
          .notes-quill .ql-toolbar .ql-stroke {
            stroke: hsl(var(--foreground)) !important;
          }
          .notes-quill .ql-toolbar .ql-fill {
            fill: hsl(var(--foreground)) !important;
          }
          .notes-quill .ql-toolbar .ql-picker-label {
            color: hsl(var(--foreground)) !important;
          }
          .notes-quill .ql-picker-options {
            background-color: hsl(var(--popover));
            border-color: hsl(var(--border));
            color: hsl(var(--popover-foreground));
          }
        `}
      </style>
      <Draggable nodeRef={nodeRef} handle=".drag-handle" bounds="parent">
        <Resizable
          width={panelSize.width}
          height={panelSize.height}
          onResize={onResize}
          minConstraints={[350, 300]}
          maxConstraints={[800, 600]}
          resizeHandles={['se']}
          handle={<div className="absolute bottom-0 right-0 w-4 h-4 bg-muted-foreground/20 rounded-tl-lg cursor-se-resize" />}
        >
          <Card
            ref={nodeRef}
            className="absolute z-[1000] pointer-events-auto flex flex-col"
            style={{ width: panelSize.width, height: panelSize.height }}
          >
            <CardHeader className="drag-handle flex flex-row items-center justify-between space-y-0 pb-2 cursor-move">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <FileText size={20} /> {t('session.privateNotes')}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('close')}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-4 p-4 pt-0 min-h-0">
              <div className="flex items-center gap-2">
                <Select value={activeFileId} onValueChange={setActiveFileId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={t('notesPanel.selectNote')} />
                  </SelectTrigger>
                  <SelectContent>
                    {notesFiles.map((file) => (
                      <SelectItem key={file.id} value={file.id}>
                        {file.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                 <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteFile(activeFileId)}
                    aria-label={`${t('notesPanel.deleteNote')} ${activeFile.title}`}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 size={16} />
                 </Button>
              </div>
               <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={newFileTitle}
                    onChange={(e) => setNewFileTitle(e.target.value)}
                    placeholder={t('session.newFileTitle')}
                    className="flex-1"
                  />
                  <Button onClick={addNewFile}>
                    {t('session.add')}
                  </Button>
                </div>

              <div className="flex-1 min-h-0 notes-quill">
                <ReactQuill
                  ref={quillRef}
                  value={activeFile.html}
                  onChange={handleNotesChange}
                  theme="snow"
                  modules={{
                    toolbar: [
                      [{ font: [] }, { size: [] }],
                      ['bold', 'italic', 'underline'],
                      [{ list: 'ordered' }, { list: 'bullet' }],
                      ['link'],
                    ],
                  }}
                  style={{ height: '100%' }}
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                {isSaving ? t('session.saving') : t('session.allChangesSaved')}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Download className="mr-2 h-4 w-4" /> {t('session.export')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => handleExport('pdf')}>
                    {t('session.exportFormats.pdf')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('txt')}>
                    {t('session.exportFormats.txt')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardFooter>
          </Card>
        </Resizable>
      </Draggable>
    </>
  );
};

export default NotesPanel;