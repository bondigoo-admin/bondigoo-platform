import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { UploadCloud, Loader2, FileUp, X, CheckCircle, Mic, Download, Link, Type, PlusCircle, Trash2, AlertTriangle, Image as ImageIcon, Link2, ZoomIn, ZoomOut, RotateCcw, Paperclip, MessageSquare, File as FileIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card.tsx';
import { Button } from '../../ui/button.tsx';
import { Progress } from '../../ui/progress.jsx';
import api from '../../../services/api';
import AudioRecorder from './AudioRecorder';
import { cn } from '../../../lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover.jsx';
import { Label } from '../../ui/label.tsx';
import { Input } from '../../ui/input.tsx';
import { Textarea } from '../../ui/textarea.tsx';
import { Slider } from '../../ui/slider.tsx';

const PresentationBuilder = ({ lesson, setLesson }) => {
    const { t } = useTranslation(['programs', 'common']);
    const [isUploading, setIsUploading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
    const [isRecording, setIsRecording] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [activeTab, setActiveTab] = useState('audio');

    useEffect(() => {
        setSelectedSlideIndex(0);
    }, [lesson.content?.presentation?.slides?.length]);
    
    useEffect(() => {
        setZoomLevel(1);
    }, [selectedSlideIndex]);
    
    const onDrop = useCallback(async (acceptedFiles) => {
        const file = acceptedFiles[0];
        if (!file) return;

        setIsUploading(true);
        setIsProcessing(false);
        setUploadProgress(0);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await api.post('/api/upload?uploadType=presentation', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    setUploadProgress(percentCompleted);
                    if (percentCompleted === 100) {
                        setIsUploading(false);
                        setIsProcessing(true);
                    }
                },
            });

            if (response.data.isPresentation) {
                setLesson(prev => ({
                    ...prev,
                    content: {
                        ...prev.content,
                        presentation: response.data.presentationContent
                    }
                }));
                toast.success(t('programs:presentation_processed_success'));
            } else {
                throw new Error(t('programs:error_presentation_processing'));
            }
        } catch (error) {
            console.error("Presentation upload error:", error);
            const errorMessage = error.response?.data?.message || t('programs:error_presentation_upload_failed');
            toast.error(errorMessage);
        } finally {
            setIsUploading(false);
            setIsProcessing(false);
            setUploadProgress(0);
        }
    }, [setLesson, t]);
    
const debouncedLesson = useRef(lesson);
    useEffect(() => {
        debouncedLesson.current = lesson;
        const handler = setTimeout(async () => {
            if (!lesson._id) return; 
            const slide = lesson.content.presentation.slides[selectedSlideIndex];
            if (!slide) return;
            
            const originalSlide = debouncedLesson.current.content.presentation.slides.find(s => s._id === slide._id);
            if (JSON.stringify(originalSlide?.overlays) === JSON.stringify(slide.overlays) &&
                JSON.stringify(originalSlide?.resources) === JSON.stringify(slide.resources) &&
                originalSlide?.authorComment === slide.authorComment) {
                return;
            }

            setIsSaving(true);
            try {
                await api.put(`/api/programs/lessons/${lesson._id}/slides/${slide._id}/enhancements`, {
                    overlays: slide.overlays,
                    resources: slide.resources,
                    authorComment: slide.authorComment
                });
            } catch (err) {
                toast.error(t('programs:error_enhancement_save_failed'));
            } finally {
                setIsSaving(false);
            }
        }, 2000);

        return () => clearTimeout(handler);
    }, [lesson, selectedSlideIndex, t]);
    
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'] },
        multiple: false,
    });

    const handleRemovePresentation = () => {
        setLesson(prev => ({
            ...prev,
            content: {
                ...prev.content,
                presentation: { originalFileUrl: '', originalFilePublicId: '', slides: [] }
            }
        }));
        setSelectedSlideIndex(0);
    };

const handleAudioUploadComplete = useCallback((slideId, data) => {
        setLesson(prev => {
            const newSlides = prev.content.presentation.slides.map(slide => 
                slide._id === slideId 
                ? { ...slide, audioUrl: data.audioUrl, duration: data.duration, audioPublicId: data.audioPublicId, waveform: data.waveform } 
                : slide
            );
            return {
                ...prev,
                content: { ...prev.content, presentation: { ...prev.content.presentation, slides: newSlides } }
            };
        });
    }, [setLesson]); 

const handleResourceUpload = async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await api.post('/api/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const newResource = { publicId: res.data.publicId, name: res.data.fileName, url: res.data.url, size: res.data.size, type: res.data.mimeType };
            setLesson(prev => {
                const newSlides = prev.content.presentation.slides.map((s, idx) => 
                    idx === selectedSlideIndex ? { ...s, resources: [...(s.resources || []), newResource] } : s
                );
                return { ...prev, content: { ...prev.content, presentation: { ...prev.content.presentation, slides: newSlides } } };
            });
            toast.success(t('programs:resource_uploaded'));
        } catch (err) {
            toast.error(t('programs:error_resource_upload'));
        }
    };
    
    const removeResource = (publicId) => {
        setLesson(prev => {
            const newSlides = prev.content.presentation.slides.map((s, idx) => 
                idx === selectedSlideIndex ? { ...s, resources: (s.resources || []).filter(r => r.publicId !== publicId) } : s
            );
            return { ...prev, content: { ...prev.content, presentation: { ...prev.content.presentation, slides: newSlides } } };
        });
    };

     const handleAuthorCommentChange = (e) => {
        const comment = e.target.value;
        setLesson(prev => {
            const newSlides = [...prev.content.presentation.slides];
            newSlides[selectedSlideIndex] = {
                ...newSlides[selectedSlideIndex],
                authorComment: comment
            };
            return {
                ...prev,
                content: {
                    ...prev.content,
                    presentation: {
                        ...prev.content.presentation,
                        slides: newSlides
                    }
                }
            };
        });
    };

    const hasPresentation = lesson.content?.presentation?.slides?.length > 0;

 if (hasPresentation) {
        const { slides } = lesson.content.presentation;
        const selectedSlide = slides[selectedSlideIndex];

        return (
            <div className="flex h-[calc(100vh_-_240px)] flex-col gap-6 md:flex-row">
                {/* Slide thumbnail navigator */}
                <div className="w-full shrink-0 md:w-48">
                    <div className="mb-2 flex items-center justify-between px-2 md:px-1 md:pr-2">
                        <h3 className="font-semibold">{t('common:slides')}</h3>
                        {/* Mobile slide counter */}
                        <p className="text-sm text-muted-foreground md:hidden">
                            {selectedSlideIndex + 1} / {slides.length}
                        </p>
                    </div>
                    {/* Desktop slide counter */}
                    <p className="mb-2 hidden px-1 text-xs text-muted-foreground md:block">
                        {selectedSlideIndex + 1} / {slides.length}
                    </p>

                    {/* Horizontally scrolling on mobile, vertically on desktop */}
                   <div className="flex space-x-3 overflow-x-auto p-2 pb-3 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] [-ms-overflow-style:none] md:block md:space-x-0 md:space-y-2 md:overflow-y-auto md:p-1 md:pb-1 md:pr-2">
                        {slides.map((slide, index) => (
                            <button
                                key={slide._id}
                                onClick={() => setSelectedSlideIndex(index)}
                                disabled={isRecording}
                                className={cn(
                                    "relative w-32 shrink-0 aspect-[16/9] rounded-md border bg-muted bg-cover bg-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:w-full",
                                    selectedSlideIndex === index ? "ring-2 ring-primary ring-offset-2 border-primary" : "border-transparent",
                                    isRecording && "cursor-not-allowed opacity-50"
                                )}
                                style={{ backgroundImage: `url(${slide.imageUrl})` }}
                            >
                                {slide.audioUrl && <Mic className="absolute bottom-1 right-1 h-3 w-3 rounded-full bg-black/50 p-0.5 text-white" />}
                                {(slide.resources?.length > 0 || slide.overlays?.length > 0) && <ImageIcon className="absolute bottom-1 left-1 h-3 w-3 rounded-full bg-black/50 p-0.5 text-white" />}
                                <div className="absolute left-0 top-0 rounded-br-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">{index + 1}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main content area (slide viewer and editor tools) */}
                <div className="min-w-0 flex-1 flex flex-col gap-4">
                    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-black p-1">
                        <img 
                            src={selectedSlide.imageUrl} 
                            alt={`${t('common:slide')} ${selectedSlide.order + 1}`} 
                            className="max-h-full max-w-full object-contain transition-transform duration-200 ease-in-out"
                            style={{ transform: `scale(${zoomLevel})` }}
                        />
                    </div>
                    
                    <div className="flex-shrink-0">
                        <div className="flex items-center justify-center">
                            <div className="flex h-10 items-center gap-x-1 rounded-full border bg-background px-3 py-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setZoomLevel(p => Math.max(0.5, p - 0.1))} disabled={isRecording}>
                                    <ZoomOut className="h-4 w-4" />
                                </Button>
                                <Slider
                                    value={[zoomLevel]}
                                    onValueChange={(value) => setZoomLevel(value[0])}
                                    min={0.5}
                                    max={3}
                                    step={0.05}
                                    className="w-28"
                                    disabled={isRecording}
                                />
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setZoomLevel(p => Math.min(3, p + 0.1))} disabled={isRecording}>
                                    <ZoomIn className="h-4 w-4" />
                                </Button>
                                <div className="w-14 text-right font-mono text-sm tabular-nums text-foreground/80">
                                    {`${Math.round(zoomLevel * 100)}%`}
                                </div>
                            </div>
                            
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="outline" size="icon" className="ml-2 h-10 w-10" onClick={() => setZoomLevel(1)} disabled={isRecording}>
                                            <RotateCcw className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>{t('common:reset_zoom')}</p></TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                    </div>

                    <div className="relative mt-2 border-t pt-4">
                        <div className="flex gap-4">
                            <div className="flex flex-col gap-1">
                                <TooltipProvider delayDuration={200}>
                                    {[
                                        { id: 'audio', icon: Mic, label: t('programs:tab_audio') },
                                        { id: 'resources', icon: Paperclip, label: t('programs:tab_enhancements') },
                                        { id: 'comments', icon: MessageSquare, label: t('programs:author_comments_label') }
                                    ].map(tab => (
                                        <Tooltip key={tab.id}>
                                            <TooltipTrigger asChild>
                                                <button
                                                    onClick={() => setActiveTab(tab.id)}
                                                    disabled={isRecording}
                                                    className={cn(
                                                        'flex h-10 w-10 items-center justify-center rounded-lg border border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                                                        activeTab === tab.id ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                                                    )}
                                                >
                                                    <tab.icon className="h-5 w-5" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent side="right"><p>{tab.label}</p></TooltipContent>
                                        </Tooltip>
                                    ))}
                                </TooltipProvider>
                            </div>
                            <div className="min-w-0 flex-1">
                                {activeTab === 'audio' && (
                                    <AudioRecorder 
                                        key={selectedSlide._id}
                                        lessonId={lesson._id}
                                        slide={selectedSlide}
                                        onUploadComplete={handleAudioUploadComplete}
                                        onRecordingStateChange={setIsRecording}
                                    />
                                )}
                                {activeTab === 'resources' && (
                                    <div className="space-y-3">
                                        {(selectedSlide.resources || []).length === 0 ? (
                                            <p className="py-4 text-center text-sm text-muted-foreground">{t('programs:no_resources_for_slide')}</p>
                                        ) : (
                                           <div className="space-y-2">
                                            {(selectedSlide.resources || []).map(res => (
                                                <div key={res.publicId} className="group flex w-full items-center gap-3 rounded-lg border bg-background p-3 text-left transition-colors">
                                                    <div className="flex-shrink-0 text-primary"><FileIcon className="h-5 w-5" /></div>
                                                    <div className="flex-grow truncate text-sm font-medium" title={res.name}>{res.name}</div>
                                                    <div className="ml-auto flex items-center gap-1">
                                                        <Button variant="outline" size="sm" asChild className="h-8">
                                                            <a href={res.url} target="_blank" rel="noopener noreferrer">
                                                                <Download className="mr-2 h-3 w-3"/>
                                                                {t('common:open')}
                                                            </a>
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                                                            onClick={() => removeResource(res.publicId)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                           </div>
                                        )}
                                        <label className="flex w-full cursor-pointer items-center justify-center rounded-md border-2 border-dashed px-4 py-3 text-sm transition-colors hover:border-primary hover:bg-muted">
                                            <PlusCircle className="mr-2 h-4 w-4"/> {t('programs:add_resource_button')}
                                            <input type="file" className="hidden" onChange={(e) => e.target.files && handleResourceUpload(e.target.files[0])} />
                                        </label>
                                    </div>
                                )}
                                {activeTab === 'comments' && (
                                    <div>
                                        <Label htmlFor="author-comment">{t('programs:author_comments_label')}</Label>
                                        <Textarea
                                            id="author-comment"
                                            placeholder={t('programs:author_comments_placeholder')}
                                            value={selectedSlide.authorComment || ''}
                                            onChange={handleAuthorCommentChange}
                                            className="mt-2"
                                            rows={4}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                        {isSaving && (
                            <div className="absolute bottom-2 right-2 flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span>{t('common:saving')}</span>
                            </div>
                        )}
                    </div>
                    {!lesson._id && (
                        <div className="flex flex-shrink-0 items-center gap-2 rounded-md bg-yellow-100 p-3 text-sm text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
                            <AlertTriangle className="h-4 w-4"/>
                            {t('programs:warning_save_lesson_to_enhance')}
                        </div>
                    )}
                </div>
            </div>
        );
    }
    
    if (isUploading || isProcessing) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="font-medium">
                    {isUploading ? t('programs:uploading_presentation') : t('programs:processing_presentation')}
                </p>
                <Progress value={isUploading ? uploadProgress : 100} className="w-full" />
                <p className="text-sm text-muted-foreground">
                    {isUploading ? `${uploadProgress}%` : t('common:please_wait')}
                </p>
            </div>
        );
    }

    return (
        <div {...getRootProps()} className={cn(
            "relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors hover:border-primary",
            isDragActive ? 'border-primary bg-primary/10' : 'border-border'
        )}>
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-2 text-center">
                <UploadCloud className="h-10 w-10 text-muted-foreground" />
                <p className="font-semibold">{t('programs:upload_presentation_title')}</p>
                <p className="text-sm text-muted-foreground">{t('programs:upload_presentation_desc')}</p>
                <Button type="button" variant="outline" className="mt-4">
                    <FileUp className="mr-2 h-4 w-4" />
                    {t('programs:select_pdf_button')}
                </Button>
            </div>
        </div>
    );
};

export default PresentationBuilder;