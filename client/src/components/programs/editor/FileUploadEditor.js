import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '../../ui/label.tsx';
import { Button } from '../../ui/button.tsx';
import { Input } from '../../ui/input.tsx';
import { UploadCloud, File as FileIcon, X, Video, Scissors, RefreshCw, AlertTriangle } from 'lucide-react';
import { getUploadSignature } from '../../../services/programAPI';
import { cn } from '../../../lib/utils';
import VideoEditorModal from '../../VideoEditorModal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip.tsx';
import { backgroundUploader } from '../../../services/backgroundUploader';
import { Progress } from '../../ui/progress.jsx';
import { toast } from 'react-hot-toast';

const FileUploadEditor = ({ lesson, setLesson }) => {
    const { t } = useTranslation(['programs', 'common']);
    const [draggedFileIdentifier, setDraggedFileIdentifier] = useState(null);
    const [editingFileIdentifier, setEditingFileIdentifier] = useState(null);
    const [currentFileName, setCurrentFileName] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [videoToEdit, setVideoToEdit] = useState(null);

    const getUniqueIdentifier = (file) => file.publicId || file._id || file._tempId;

    const files = lesson.content?.files || [];
    const setFiles = (newFilesOrUpdater) => {
        setLesson(prev => ({
            ...prev,
            content: {
                ...prev.content,
                files: typeof newFilesOrUpdater === 'function' ? newFilesOrUpdater(prev.content.files || []) : newFilesOrUpdater
            }
        }));
    };

    const handleOpenModalForNew = () => {
        setVideoToEdit(null);
        setIsModalOpen(true);
    };

    const handleOpenModalForEdit = (file) => {
        setVideoToEdit(file);
        setIsModalOpen(true);
    };
    
const initiateUpload = (uploadData) => {
    const { videoFile, thumbnailFile, trimStart, trimEnd, existingVideo } = uploadData;

    if (existingVideo) {
        const trimmedDuration = trimEnd - trimStart;
        const updatedVideoData = {
            ...existingVideo,
            trimStart,
            trimEnd,
            duration: trimmedDuration,
            thumbnail: thumbnailFile ? URL.createObjectURL(thumbnailFile) : existingVideo.thumbnail
        };
        setFiles(currentFiles => currentFiles.map(f => getUniqueIdentifier(f) === getUniqueIdentifier(existingVideo) ? updatedVideoData : f));
        setIsModalOpen(false);
        setVideoToEdit(null);
        return;
    }

    const _tempId = `temp_${Date.now()}_${Math.random()}`;

    const optimisticThumbnailUrl = thumbnailFile ? URL.createObjectURL(thumbnailFile) : null;

    const placeholder = {
        _tempId,
        fileName: videoFile.name,
        status: 'uploading',
        progress: 0,
        thumbnail: optimisticThumbnailUrl,
    };
    
    setFiles(currentFiles => [...currentFiles, placeholder]);
    
    backgroundUploader({
        videoFile,
        thumbnailFile,
        _tempId,
        trimStart,
        trimEnd,
        getSignatureFunc: (params) => getUploadSignature(params),
        onProgress: (_tempId, percent) => {
            setFiles(currentFiles => currentFiles.map(f => {
                if (f._tempId !== _tempId) return f;
                if (f.status !== 'uploading') return f;
                
                if (percent < 100) {
                    return { ...f, progress: percent * 0.85 };
                } else {
                    return { ...f, status: 'finalizing', progress: 85 };
                }
            }));
        },
        onComplete: (_tempId, finalVideoData) => {
            setFiles(currentFiles => currentFiles.map(f => f._tempId === _tempId ? { ...finalVideoData, status: 'complete' } : f));
        },
        onFailure: (_tempId, errorMsg) => {
            setFiles(currentFiles => currentFiles.map(f => f._tempId === _tempId ? { ...f, status: 'error', error: errorMsg } : f));
             toast.error(t('programs:upload_failed_filename', { fileName: placeholder.fileName }));
        }
    });

    setIsModalOpen(false);
    setVideoToEdit(null);
};

    const removeFile = (fileToRemove) => {
        const identifier = getUniqueIdentifier(fileToRemove);
        setFiles(files.filter(f => getUniqueIdentifier(f) !== identifier));
    };
    
    const handleRename = () => {
        if (!editingFileIdentifier) return;
        setFiles(files.map(file => {
            if (getUniqueIdentifier(file) === editingFileIdentifier) {
                return { ...file, fileName: currentFileName.trim() || file.fileName };
            }
            return file;
        }));
        setEditingFileIdentifier(null);
        setCurrentFileName('');
    };

    const handleRenameKeyDown = (e) => {
        if (e.key === 'Enter') handleRename();
        else if (e.key === 'Escape') setEditingFileIdentifier(null);
    };

    const handleFileDragStart = (e, file) => setDraggedFileIdentifier(getUniqueIdentifier(file));

    const handleFileDropOnItem = (e, targetFile) => {
        e.preventDefault();
        e.stopPropagation();
        const targetIdentifier = getUniqueIdentifier(targetFile);
        if (!draggedFileIdentifier || draggedFileIdentifier === targetIdentifier) {
            setDraggedFileIdentifier(null);
            return;
        }
        const newFiles = [...files];
        const draggedIdx = newFiles.findIndex(f => getUniqueIdentifier(f) === draggedFileIdentifier);
        const targetIdx = newFiles.findIndex(f => getUniqueIdentifier(f) === targetIdentifier);
        if (draggedIdx === -1 || targetIdx === -1) return;
        const [draggedItem] = newFiles.splice(draggedIdx, 1);
        newFiles.splice(targetIdx, 0, draggedItem);
        setFiles(newFiles);
        setDraggedFileIdentifier(null);
    };

useEffect(() => {
        const filesToAnimate = files.filter(f => f.status === 'finalizing' && f.progress === 85);

        if (filesToAnimate.length > 0) {
            const timer = setTimeout(() => {
                setFiles(currentFiles => 
                    currentFiles.map(f => 
                        filesToAnimate.some(fta => fta._tempId === f._tempId)
                            ? { ...f, progress: 100 }
                            : f
                    )
                );
            }, 50); // A short delay to ensure the 85% state renders first.
            
            return () => clearTimeout(timer);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [files]);

    const handleFileDragEnd = () => setDraggedFileIdentifier(null);

    const isVideo = lesson.contentType === 'video';

return (
        <div className="space-y-2">
            <Label>{t('programs:field_file_content')}</Label>
            <div className={cn("mt-2 flex min-h-[160px] flex-wrap items-start gap-x-4 gap-y-6 rounded-lg border bg-muted/40 p-4 transition-colors")}>
                {files.map(file => {
                    const identifier = getUniqueIdentifier(file);
                    const isUploading = file.status === 'uploading';
                    const isFinalizing = file.status === 'finalizing';
                    const hasError = file.status === 'error';
                    const isProcessing = isUploading || isFinalizing || hasError;

                    return (
                        <div
                            key={identifier}
                            className={cn("group relative flex w-28 flex-col items-center gap-2 transition-all", draggedFileIdentifier === identifier ? "cursor-grabbing scale-105 opacity-50" : "cursor-grab")}
                            draggable={!isProcessing}
                            onDragStart={(e) => handleFileDragStart(e, file)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleFileDropOnItem(e, file)}
                            onDragEnd={handleFileDragEnd}
                        >
                            <div className="relative h-28 w-28 flex-shrink-0 rounded-md border bg-background shadow-sm">
                                <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-md group-hover:ring-2 group-hover:ring-primary group-hover:ring-offset-2 group-hover:ring-offset-background">
                                    {(isVideo && file.thumbnail) ? (
                                        <img src={file.thumbnail} alt={file.fileName} className="h-full w-full object-contain" draggable={false} />
                                    ) : (
                                        <div className="text-muted-foreground">
                                            {isVideo ? <Video className="h-10 w-10" /> : <FileIcon className="h-10 w-10" />}
                                        </div>
                                    )}
                                </div>
                                {!isProcessing && (
                                    <div className="absolute top-1.5 right-1.5 z-10 flex flex-col gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                                        <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                            <Button type="button" variant="destructive" size="icon" className="h-7 w-7 rounded-full" onClick={() => removeFile(file)}><X className="h-4 w-4" /></Button>
                                        </TooltipTrigger><TooltipContent><p>{t('common:remove')}</p></TooltipContent></Tooltip></TooltipProvider>
                                        {isVideo && (
                                            <TooltipProvider><Tooltip><TooltipTrigger asChild>
                                                <Button type="button" variant="destructive" size="icon" className="h-7 w-7 rounded-full" onClick={() => handleOpenModalForEdit(file)}><Scissors className="h-4 w-4" /></Button>
                                            </TooltipTrigger><TooltipContent><p>{t('common:edit')}</p></TooltipContent></Tooltip></TooltipProvider>
                                        )}
                                    </div>
                                )}
                               {isProcessing && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center rounded-md bg-black/70 p-4 text-white">
                                        {(isUploading || isFinalizing) && (
                                            <Progress
                                                value={file.progress}
                                                variant="on-dark"
                                                className={cn(
                                                    "h-1.5 w-full bg-white/30",
                                                    isFinalizing && "transition-all !duration-[4000ms] ease-linear"
                                                )}
                                            />
                                        )}
                                        {hasError && (
                                            <div className="flex flex-col items-center justify-center gap-2 text-center">
                                                <AlertTriangle className="h-6 w-6 text-destructive" />
                                                <p className="text-xs font-semibold">{t('common:uploadFailed')}</p>
                                                <Button type="button" size="sm" variant="destructive" className="h-auto px-2 py-1 text-xs" onClick={() => removeFile(file)}>{t('common:remove')}</Button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            {editingFileIdentifier === identifier ? (
                                <Input type="text" value={currentFileName} onChange={(e) => setCurrentFileName(e.target.value)} onBlur={handleRename} onKeyDown={handleRenameKeyDown} className="h-7 w-full px-1 text-center text-xs" autoFocus onFocus={(e) => e.target.select()} />
                            ) : (
                                <p className="w-full cursor-pointer truncate rounded-sm px-1 text-center text-xs font-medium hover:bg-accent" title={file.fileName} onClick={() => { if (!isProcessing) { setEditingFileIdentifier(identifier); setCurrentFileName(file.fileName); } }}>
                                    {file.fileName}
                                </p>
                            )}
                        </div>
                    );
                })}
                <button type="button" className="flex h-28 w-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed bg-background text-muted-foreground transition-colors hover:border-primary hover:text-primary" onClick={handleOpenModalForNew}>
                    <UploadCloud className="h-8 w-8" />
                    <span className="text-xs font-semibold">{t('programs:add_files', 'Add File(s)')}</span>
                </button>
            </div>
            {isModalOpen && (
                <VideoEditorModal
                    onUpload={initiateUpload}
                    onClose={() => setIsModalOpen(false)}
                    existingVideo={videoToEdit}
                />
            )}
        </div>
    );
};

export default FileUploadEditor;