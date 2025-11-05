import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button.tsx';
import { ScrollArea } from '../ui/scroll-area.jsx';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../ui/card.tsx';
import { Input } from '../ui/input.tsx';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, rectSortingStrategy, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, Edit, Video, FileText, File as FileIcon, Lightbulb, ClipboardCheck, PlayCircle, X, Maximize2, LayoutGrid, List, Presentation, UploadCloud, Trash2, GripVertical } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { uploadFile } from '../../services/uploadService';
import CustomVideoPlayer from '../player/CustomVideoPlayer.js';

const getUniqueIdentifier = (file) => file.publicId || file._id || file._tempId;

const getIcon = (contentType, props = { className: "h-5 w-5" }) => {
    switch (contentType) {
      case 'video': return <Video {...props} />;
      case 'text': return <FileText {...props} />;
      case 'document': return <FileIcon {...props} />;
      case 'quiz': return <Lightbulb {...props} />;
      case 'assignment': return <ClipboardCheck {...props} />;
      case 'presentation': return <Presentation {...props} />;
      default: return <FileText {...props} />;
    }
};

const VideoPreview = ({ lesson, onUpdateLesson }) => {
    const [files, setFiles] = useState(lesson.content?.files || []);
    const [editingFileIdentifier, setEditingFileIdentifier] = useState(null);
    const [currentFileName, setCurrentFileName] = useState('');
    const [draggedFileIdentifier, setDraggedFileIdentifier] = useState(null);

    useEffect(() => {
        setFiles(lesson.content?.files || []);
    }, [lesson.content?.files]);

    const handleRenameFile = (fileToRename, newName) => {
        const newFiles = files.map(f =>
            getUniqueIdentifier(f) === getUniqueIdentifier(fileToRename)
                ? { ...f, fileName: newName }
                : f
        );
        const updatedLesson = {
            ...lesson,
            content: { ...lesson.content, files: newFiles }
        };
        onUpdateLesson(updatedLesson);
        setEditingFileIdentifier(null);
    };

    const handleRenameKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.target.blur(); // Triggers the onBlur event to save
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setEditingFileIdentifier(null);
            setCurrentFileName('');
        }
    };
    
    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = files.findIndex(f => getUniqueIdentifier(f) === active.id);
            const newIndex = files.findIndex(f => getUniqueIdentifier(f) === over.id);
            const newFiles = arrayMove(files, oldIndex, newIndex);
            onUpdateLesson({ ...lesson, content: { ...lesson.content, files: newFiles } });
        }
    };

    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

    if (!files || files.length === 0) {
        return <p className="p-4 text-center text-muted-foreground">No video has been uploaded for this lesson.</p>;
    }

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={files.map(f => ({...f, id: getUniqueIdentifier(f)}))} strategy={verticalListSortingStrategy}>
                <div className="space-y-6 p-4">
                    {files.map((file) => (
                        <SortableVideoItem
                            key={getUniqueIdentifier(file)}
                            file={file}
                            lessonTitle={lesson.title}
                            onRenameFile={handleRenameFile}
                            editingFileIdentifier={editingFileIdentifier}
                            setEditingFileIdentifier={setEditingFileIdentifier}
                            currentFileName={currentFileName}
                            setCurrentFileName={setCurrentFileName}
                            handleRenameKeyDown={handleRenameKeyDown}
                        />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
};

const SortableVideoItem = ({ file, lessonTitle, onRenameFile, editingFileIdentifier, setEditingFileIdentifier, currentFileName, setCurrentFileName, handleRenameKeyDown }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: getUniqueIdentifier(file) });
    const style = { transform: CSS.Transform.toString(transform), transition };

    const previewVideoFile = {
        ...file,
        url: file.trimStart > 0 ? `${file.url}#t=${file.trimStart}` : file.url,
    };

    return (
        <div ref={setNodeRef} style={style} className={`transition-opacity ${isDragging ? 'opacity-50' : ''}`}>
            <div className="flex items-start gap-3">
                <div {...attributes} {...listeners} className="cursor-grab pt-2 text-muted-foreground touch-none">
                    <GripVertical className="h-5 w-5" />
                </div>
                <div className="flex-grow">
                    <div className="aspect-video overflow-hidden rounded-lg border">
                        <CustomVideoPlayer videoFile={previewVideoFile} previewMode={true} />
                    </div>
                    <div className="mt-2">
                        {editingFileIdentifier === getUniqueIdentifier(file) ? (
                            <Input
                                type="text"
                                value={currentFileName}
                                onChange={(e) => setCurrentFileName(e.target.value)}
                                onBlur={() => onRenameFile(file, currentFileName)}
                                onKeyDown={handleRenameKeyDown}
                                className="h-8 text-sm"
                                autoFocus
                                onFocus={e => e.target.select()}
                            />
                        ) : (
                            <p
                                className="text-sm font-medium truncate p-1 -mx-1 rounded-md cursor-pointer hover:bg-muted"
                                onClick={() => {
                                    setEditingFileIdentifier(getUniqueIdentifier(file));
                                    setCurrentFileName(file.fileName || lessonTitle);
                                }}
                                title={file.fileName || lessonTitle}
                            >
                                {file.fileName || lessonTitle}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const DocumentCard = ({ file, onDeleteFile }) => {
    const { t } = useTranslation(['programs', 'common']);
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: getUniqueIdentifier(file) });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 'auto',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`relative group ${isDragging ? 'opacity-50' : ''}`}
        >
            <div
                {...attributes}
                {...listeners}
                className="absolute top-2 left-2 z-10 p-2 cursor-grab bg-background/50 backdrop-blur-sm rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={t('common:move')}
            >
                <GripVertical className="h-5 w-5" />
            </div>
            <a
                href={file?.url || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className={`block h-72 w-full text-left transition-opacity ${!file?.url ? 'pointer-events-none opacity-60' : ''}`}
                onClick={(e) => !file?.url && e.preventDefault()}
            >
                <Card className="flex h-full flex-col overflow-hidden shadow-md transition-all duration-200 hover:shadow-xl hover:ring-2 hover:ring-primary/50 dark:hover:bg-primary/5">
                    <CardContent className="relative flex flex-grow flex-col items-center justify-center bg-muted/20 p-0">
                        {file?.url ? (
                            <iframe
                                className="h-full w-full border-0"
                                src={`${file.url}#toolbar=0&navpanes=0`}
                                title={file.fileName}
                            ></iframe>
                        ) : (
                            <div className="p-4 text-center text-primary">
                                <FileIcon className="mx-auto h-16 w-16" />
                                <p className="mt-4 font-semibold">{t('programs:preview_ready', 'Document Ready')}</p>
                               
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="flex items-center gap-2 border-t bg-muted/50 p-3">
                        <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground"/>
                        <p className="flex-grow truncate text-sm font-medium" title={file.fileName}>
                            {file.fileName || 'Document'}
                        </p>
                        <Button
                        type="button"
                        variant="delete-destructive"
                        size="icon"
                        className="h-7 w-7 flex-shrink-0 rounded-full text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:!text-destructive"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onDeleteFile();
                            }}
                            aria-label={t('common:delete')}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </CardFooter>
                </Card>
            </a>
        </div>
    );
};

const DocumentListItem = ({ file, onRenameFile, onDeleteFile }) => {
    const { t } = useTranslation(['common']);
    const [isEditing, setIsEditing] = useState(false);
    const [currentFileName, setCurrentFileName] = useState(file.fileName || '');

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: getUniqueIdentifier(file) });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    useEffect(() => {
        if (!isEditing) {
            setCurrentFileName(file.fileName || '');
        }
    }, [file.fileName, isEditing]);

    const handleRename = () => {
        if (isEditing) {
            setIsEditing(false);
            if (currentFileName.trim() && currentFileName.trim() !== file.fileName) {
                onRenameFile(file, currentFileName.trim());
            } else {
                setCurrentFileName(file.fileName || '');
            }
        }
    };

    const handleRenameKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleRename();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setIsEditing(false);
            setCurrentFileName(file.fileName || '');
        }
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`group flex w-full items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted ${isDragging ? 'opacity-50 shadow-lg' : ''}`}
        >
            <div
                {...attributes}
                {...listeners}
                className="cursor-grab p-1 text-muted-foreground"
                aria-label={t('common:move')}
            >
                <GripVertical className="h-5 w-5" />
            </div>
            <div className="flex-shrink-0 text-muted-foreground">
                <FileText className="h-5 w-5" />
            </div>
            <div className="flex-grow overflow-hidden">
                {isEditing ? (
                     <Input
                        type="text"
                        value={currentFileName}
                        onChange={(e) => setCurrentFileName(e.target.value)}
                        onBlur={handleRename}
                        onKeyDown={handleRenameKeyDown}
                        className="h-8 text-sm"
                        autoFocus
                        onFocus={e => e.target.select()}
                    />
                ) : (
                    <span 
                        className="block cursor-pointer truncate rounded-md p-1 -mx-1 text-sm font-medium transition-colors"
                        onClick={() => setIsEditing(true)}
                        title={t('common:click_to_edit', 'Click to edit')}
                    >
                        {file.fileName}
                    </span>
                )}
            </div>
            <div className="ml-auto flex flex-shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => file?.url && window.open(file.url, '_blank', 'noopener,noreferrer')}
                    disabled={!file?.url}
                >
                   
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full text-muted-foreground hover:!text-destructive"
                    onClick={onDeleteFile}
                    aria-label={t('common:delete')}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
};

const DocumentPreview = ({ lesson, view, onRenameFile, onUploadClick, onDeleteFile }) => {
  const { t } = useTranslation(['programs', 'common']);
  const files = lesson.content?.files || [];
  
  if (files.length === 0 && view !== 'list') {
      return (
          <div className="p-4">
              <div
                className="flex h-72 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/50 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                onClick={onUploadClick}
              >
                <UploadCloud className="h-10 w-10" />
                <span className="text-base font-semibold">{t('programs:add_documents', 'Add Documents')}</span>
                <p className="text-sm">{t('programs:no_document_uploaded')}</p>
              </div>
          </div>
      );
  }

  return (
    <SortableContext items={files.map(f => ({...f, id: getUniqueIdentifier(f)}))} strategy={view === 'list' ? verticalListSortingStrategy : rectSortingStrategy}>
      {view === 'list' ? (
          <div className="space-y-1 p-2">
              {files.map((file) => (
                  <DocumentListItem 
                      key={getUniqueIdentifier(file)} 
                      file={file}
                      onRenameFile={onRenameFile}
                      onDeleteFile={() => onDeleteFile(getUniqueIdentifier(file))}
                  />
              ))}
          </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 p-4 sm:grid-cols-2">
          {files.map((file) => (
              <DocumentCard key={getUniqueIdentifier(file)} file={file} onDeleteFile={() => onDeleteFile(getUniqueIdentifier(file))} />
          ))}
          <div
            className="flex h-72 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/50 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            onClick={onUploadClick}
          >
            <UploadCloud className="h-10 w-10" />
            <span className="text-base font-semibold">{t('programs:add_documents', 'Add Documents')}</span>
          </div>
        </div>
      )}
    </SortableContext>
  );
};

const TextPreview = ({ lesson }) => (
    <div className="prose prose-sm dark:prose-invert max-w-none p-4" dangerouslySetInnerHTML={{ __html: lesson.content?.text || '' }} />
);

const QuizPreview = ({ lesson }) => {
    const { t } = useTranslation(['programs']);
    const quiz = lesson.content?.quiz;
    return (
        <div className="p-4">
            <Card>
                <CardHeader><CardTitle>{t('quiz_summary')}</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                    <p><strong>{t('questions')}:</strong> {quiz?.questions?.length || 0}</p>
                    <p><strong>{t('passing_score')}:</strong> {quiz?.passingScore || 'N/A'}%</p>
                </CardContent>
            </Card>
        </div>
    );
};

const AssignmentPreview = ({ lesson }) => (
    <div className="prose prose-sm dark:prose-invert max-w-none p-4" dangerouslySetInnerHTML={{ __html: lesson.content?.assignment?.instructions || '' }} />
);

const PresentationPreview = ({ lesson, onEdit }) => {
    const { t } = useTranslation(['programs']);
    const presentation = lesson.content?.presentation;
    const firstSlide = presentation?.slides?.[0];

    return (
        <div className="p-4">
            <Card onClick={() => onEdit(lesson, false)} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardHeader>
                    <CardTitle>{t('presentation_summary', 'Presentation Summary')}</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-4">
                    {firstSlide?.imageUrl ? (
                        <img src={firstSlide.imageUrl} alt="First slide preview" className="w-40 h-auto rounded-md bg-muted" />
                    ) : (
                        <div className="w-40 h-24 flex items-center justify-center bg-muted rounded-md">
                            <Presentation className="h-10 w-10 text-muted-foreground" />
                        </div>
                    )}
                    <div className="text-sm space-y-2">
                        <p><strong>{t('slides')}:</strong> {presentation?.slides?.length || 0}</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

const LessonPreview = ({ lesson, onBack, onEdit, onUpdateLesson }) => {
    const { t } = useTranslation(['programs', 'common']);
    const fileInputRef = useRef(null);
    const [isUploading, setIsUploading] = useState(false);
    const [documentView, setDocumentView] = useState('grid');

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor)
    );
    
    const handleDocumentDragEnd = (event) => {
        const { active, over } = event;
        if (over && active.id !== over.id && lesson.content?.files) {
            const oldIndex = lesson.content.files.findIndex(f => getUniqueIdentifier(f) === active.id);
            const newIndex = lesson.content.files.findIndex(f => getUniqueIdentifier(f) === over.id);
            
            const newFiles = arrayMove(lesson.content.files, oldIndex, newIndex);
            
            const updatedLesson = {
                ...lesson,
                content: { ...lesson.content, files: newFiles }
            };
            
            onUpdateLesson(updatedLesson);
        }
    };

    const handleDeleteFile = (fileIdentifier) => {
        if (!lesson.content?.files) return;

        const newFiles = lesson.content.files.filter(f => getUniqueIdentifier(f) !== fileIdentifier);
        const updatedLesson = {
            ...lesson,
            content: { ...lesson.content, files: newFiles }
        };
        
        onUpdateLesson(updatedLesson);
        toast.success(t('common:file_deleted', 'File deleted'));
    };
    
    const handleFileChange = async (e) => {
        const filesToUpload = e.target.files;
        if (!filesToUpload || filesToUpload.length === 0) return;

        setIsUploading(true);
        const toastId = toast.loading(t('common:uploading_files', 'Uploading files...'));

        const uploadPromises = Array.from(filesToUpload).map(file => {
            return uploadFile(file).catch(error => {
                toast.error(t('programs:file_upload_error_single', { fileName: file.name }));
                return null;
            });
        });

        try {
            const results = await Promise.all(uploadPromises);
            const successfulUploads = results.filter(Boolean);

            if (successfulUploads.length > 0) {
                const existingFileIds = new Set((lesson.content.files || []).map(getUniqueIdentifier));
                const newUniqueFiles = successfulUploads.filter(file => !existingFileIds.has(getUniqueIdentifier(file)));

                if (newUniqueFiles.length > 0) {
                    const updatedLesson = {
                        ...lesson,
                        content: {
                            ...lesson.content,
                            files: [...(lesson.content.files || []), ...newUniqueFiles]
                        }
                    };
                    onUpdateLesson(updatedLesson);
                    toast.success(t('common:files_uploaded_successfully'), { id: toastId });
                } else {
                     toast.info(t('common:files_already_exist', 'All selected files already exist in this lesson.'), { id: toastId });
                }
            } else if (results.length > 0) {
                toast.error(t('common:all_uploads_failed'), { id: toastId });
            } else {
                toast.dismiss(toastId);
            }
        } catch (error) {
            toast.error(t('common:error_generic'), { id: toastId });
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = null;
        }
    };

    const handleRenameFile = (fileToRename, newName) => {
        if (!lesson.content?.files) return;
        const newFiles = lesson.content.files.map(f => 
            getUniqueIdentifier(f) === getUniqueIdentifier(fileToRename)
                ? { ...f, fileName: newName }
                : f
        );
        const updatedLesson = {
            ...lesson,
            content: { ...lesson.content, files: newFiles }
        };
        onUpdateLesson(updatedLesson);
    };

    const renderContent = () => {
        if (!lesson?.contentType) {
            return <p className="p-4 text-center text-muted-foreground">{t('no_preview_available')}</p>;
        }

        switch (lesson.contentType) {
            case 'video': return <VideoPreview lesson={lesson} onUpdateLesson={onUpdateLesson} />;
            case 'document': return (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDocumentDragEnd}>
                    <DocumentPreview 
                        lesson={lesson} 
                        view={documentView} 
                        onRenameFile={handleRenameFile} 
                        onUploadClick={() => !isUploading && fileInputRef.current?.click()}
                        onDeleteFile={handleDeleteFile}
                    />
                     <input
                        ref={fileInputRef}
                        id="document-upload-input"
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleFileChange}
                        disabled={isUploading}
                        accept="application/pdf,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    />
                </DndContext>
            );
            case 'text': return <TextPreview lesson={lesson} />;
            case 'quiz': return <QuizPreview lesson={lesson} />;
            case 'assignment': return <AssignmentPreview lesson={lesson} />;
            case 'presentation': return <PresentationPreview lesson={lesson} onEdit={onEdit} />;
            default: return <p className="p-4 text-center text-muted-foreground">{t('no_preview_available')}</p>;
        }
    };

    return (
        <>
            <div className="flex h-full flex-col bg-background">
                <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b p-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={onBack} className="flex-shrink-0">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex-shrink-0 text-muted-foreground">{getIcon(lesson.contentType, { className: "h-5 w-5" })}</div>
                            <h3 className="truncate text-lg font-semibold" title={lesson.title}>{lesson.title}</h3>
                        </div>
                    </div>
                   <div className="flex items-center gap-1">
                      {lesson.contentType === 'document' && (
                            <div className="flex items-center rounded-md bg-muted">
                                <Button variant={documentView === 'grid' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setDocumentView('grid')}>
                                    <LayoutGrid className="h-4 w-4" />
                                </Button>
                                <Button variant={documentView === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setDocumentView('list')}>
                                    <List className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                        <Button 
                            size="icon" 
                             variant="ghost"
                            onClick={() => onEdit(lesson, true)} 
                            className="h-8 w-8 flex-shrink-0"
                            title={t('programs:edit_fullscreen', 'Edit in fullscreen')}
                        >
                            <Maximize2 className="h-4 w-4" />
                        </Button>
                        <Button 
                            size="icon" 
                             variant="ghost"
                            onClick={() => onEdit(lesson, false)} 
                            className="h-8 w-8 flex-shrink-0"
                            title={t('common:edit')}
                        >
                            <Edit className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
                <ScrollArea className="flex-grow">
                    {renderContent()}
                </ScrollArea>
            </div>
        </>
    );
};

export default LessonPreview;