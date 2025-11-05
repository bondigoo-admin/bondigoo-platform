import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useProgramPlayer } from '../../contexts/ProgramPlayerContext';
import { useTranslation } from 'react-i18next';
import { debounce } from 'lodash';
import { toast } from 'react-hot-toast';
import { savePresentationNote } from '../../services/programAPI';
import { useUpdatePresentationProgress } from '../../hooks/usePrograms';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.jsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.tsx';
import { Button } from '../ui/button.tsx';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet.jsx';
import { Skeleton } from '../ui/skeleton.jsx';
import { Textarea } from '../ui/textarea.tsx';
import { 
    ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX, Volume1, Maximize, Minimize,
    NotebookText, Loader2, Link as LinkIcon, FileText, Type, Lightbulb, ZoomIn, ZoomOut,
    ChevronDown, Save
} from 'lucide-react';
import { cn } from '../../lib/utils';


// --- Helper Functions ---
const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const date = new Date(seconds * 1000);
    const mm = date.getUTCMinutes();
    const ss = date.getUTCSeconds().toString().padStart(2, '0');
    return `${mm}:${ss}`;
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_INCREMENT = 0.1;

// --- Sub-Components (Styled with Tailwind) ---

const PresentationAudioPlayer = ({ isPlaying, duration, currentTime, onPlayPause, onSeek, waveform }) => {
    const progress = (currentTime / (duration || 1)) * 100;
    const hasWaveform = waveform && Array.isArray(waveform) && waveform.length > 0;

    const waveformBars = useMemo(() => {
        if (!hasWaveform) return null;
        return waveform.map((value, i) => (
            <div key={i} className="w-px flex-grow rounded-sm" style={{ height: `${Math.max(2, value * 100)}%` }} />
        ));
    }, [waveform]);

    return (
        <div className="flex h-12 w-full cursor-default items-center gap-2 rounded-full border border-white/20 bg-black/50 px-2 py-1.5 backdrop-blur-sm" onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" onClick={onPlayPause} className="h-9 w-9 shrink-0 rounded-full bg-white/10 text-white hover:bg-white/20 hover:text-white">
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>
            <div className="relative flex h-10 w-full cursor-pointer items-center">
                {hasWaveform ? (
                    <>
                        <div className="pointer-events-none absolute inset-0 flex items-center gap-px">
                            {React.Children.map(waveformBars, bar => React.cloneElement(bar, { className: cn(bar.props.className, 'bg-white/40') }))}
                        </div>
                        <div className="pointer-events-none absolute inset-0 flex items-center gap-px" style={{ clipPath: `inset(0 ${100 - progress}% 0 0)` }}>
                            {React.Children.map(waveformBars, bar => React.cloneElement(bar, { className: cn(bar.props.className, 'bg-white') }))}
                        </div>
                    </>
                ) : (
                    <div className="h-1 w-full overflow-hidden rounded-full bg-white/30">
                        <div className="h-full rounded-full bg-white" style={{ width: `${progress}%` }} />
                    </div>
                )}
                <input
                    type="range"
                    className="absolute inset-0 z-[5] h-full w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:h-0 [&::-webkit-slider-thumb]:w-0"
                    value={currentTime}
                    max={duration || 1}
                    step={0.1}
                    onChange={onSeek}
                    aria-label="Audio progress"
                />
            </div>
           <div className="flex min-w-[45px] flex-col items-center justify-center text-xs leading-tight text-white/80 tabular-nums">
                <span>{formatTime(currentTime)}</span>
                <span className="text-white/60">{formatTime(duration)}</span>
            </div>
        </div>
    );
};

const SidePanelSection = ({ title, icon: Icon, children, isSaving = false, hasUnsavedChanges = false,onSave = () => { console.log('Save triggered'); }, defaultOpen = true }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
            <button className="flex w-full items-center justify-between p-4 text-left bg-muted/50 dark:bg-muted" onClick={() => setIsOpen(v => !v)}>
                <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">{title}</span>
                </div>
                <div className="flex items-center gap-2">
                    {isSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {hasUnsavedChanges && !isSaving && (
                        <Button variant="ghost" size="icon" onClick={onSave} className="h-7 w-7 text-muted-foreground hover:text-foreground">
                            <Save className="h-4 w-4" />
                        </Button>
                    )}
                    <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform duration-200", { "rotate-180": !isOpen })} />
                </div>
            </button>
            {isOpen && (
                <div className="p-4">
                    {children}
                </div>
            )}
        </div>
    );
};

const CoachNotesPanel = ({ slide }) => {
    const { t } = useTranslation(['programs']);
    return (
        <>
            {slide.authorComment ? (
                <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap text-foreground">{slide.authorComment}</div>
            ) : (
                <div className="flex flex-col items-center justify-center p-4 text-center text-muted-foreground">
                    <Lightbulb className="mb-2 h-10 w-10" />
                    <p className="font-medium">{t('programs:no_notes_for_slide')}</p>
                    <p className="text-xs">{t('programs:no_notes_desc')}</p>
                </div>
            )}
        </>
    );
};

const ResourcesPanel = ({ slide }) => {
    const { t } = useTranslation(['programs', 'common']);
    return (
        <>
            {(slide.resources || []).length > 0 ? (
                <div className="space-y-2">
                  {(slide.resources || []).map(res => (
                        <a
                            key={res.publicId}
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 rounded-lg border bg-background p-3 text-sm font-medium text-foreground no-underline transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                            <FileText className="h-5 w-5 shrink-0 text-primary" />
                            <p className="flex-1 truncate">{res.name}</p>
                        </a>
                    ))}
                </div>
            ) : (
                 <div className="flex flex-col items-center justify-center p-4 text-center text-muted-foreground">
                    <FileText className="mb-2 h-10 w-10" />
                    <p className="font-medium">{t('programs:no_resources_for_slide')}</p>
                </div>
            )}
        </>
    );
};

const SidePanel = ({ currentSlide, currentLesson, enrollment, setIsSidePanelOpen }) => {
    const { t } = useTranslation(['programs', 'common']);
    const { setEnrollment } = useProgramPlayer();
    const [isNoteSaving, setIsNoteSaving] = useState(false);
    const lessonId = currentLesson._id;
    const slideId = currentSlide._id;
    const [note, setNote] = useState('');
    const [lastSavedNote, setLastSavedNote] = useState('');

    useEffect(() => {
        const lessonProgress = enrollment.progress?.lessonDetails?.find(ld => ld.lesson === lessonId);
        const noteValue = lessonProgress?.submission?.presentationNotes?.find(n => n.slideId === slideId)?.note || '';
        setNote(noteValue);
        setLastSavedNote(noteValue);
    }, [slideId, lessonId, enrollment]);

    const handleSaveNote = async (e) => {
        e.stopPropagation();
        setIsNoteSaving(true);
        try {
            const responseData = await savePresentationNote({ enrollmentId: enrollment._id, lessonId, slideId, note });
            if (responseData.enrollment) {
                setEnrollment(responseData.enrollment);
            }
            setLastSavedNote(note);
            toast.success(t('programs:note_saved_success'));
        } catch (error) {
            console.error("Failed to save note", error);
            toast.error(t('programs:error_note_save_failed'));
        } finally {
            setIsNoteSaving(false);
        }
    };

    const hasUnsavedChanges = note !== lastSavedNote;
    const handleNoteChange = (e) => setNote(e.target.value);

    return (
        <div className="relative flex h-full w-full flex-col bg-card dark:bg-card">
            {setIsSidePanelOpen && (
                <Tooltip>
                    <TooltipTrigger asChild>
                         <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsSidePanelOpen(false)}
                            aria-label={t('common:close_panel', 'Close Panel')}
                            className="absolute right-3 top-3 z-10 h-8 w-8 text-muted-foreground"
                         >
                            <ChevronRight className="h-5 w-5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left"><p>{t('common:close_panel', 'Close Panel')}</p></TooltipContent>
                </Tooltip>
            )}
            <div className="flex-grow space-y-4 overflow-y-auto p-4 pt-16">
                <SidePanelSection 
                    title={t('programs:my_notes_title')} 
                    icon={NotebookText}
                    isSaving={isNoteSaving}
                    hasUnsavedChanges={hasUnsavedChanges}
                    onSave={handleSaveNote}
                >
                    <Textarea 
                        placeholder={t('programs:notes_placeholder')} 
                        value={note} 
                        onChange={handleNoteChange} 
                        className="min-h-[200px] w-full resize-none text-foreground" 
                    />
                </SidePanelSection>

                {currentSlide.authorComment && (
                    <SidePanelSection 
                        title={t('programs:coach_notes_title')}
                        icon={Lightbulb}
                    >
                        <CoachNotesPanel slide={currentSlide} />
                    </SidePanelSection>
                )}

                {currentSlide.resources?.length > 0 && (
                    <SidePanelSection 
                        title={t('programs:resources')} 
                        icon={FileText}
                    >
                        <ResourcesPanel slide={currentSlide} />
                    </SidePanelSection>
                )}
            </div>
        </div>
    );
};


// --- Main Player Component ---

const PresentationPlayer = () => {
    const { t } = useTranslation(['programs', 'common']);
    const { currentLesson, enrollment } = useProgramPlayer();

    const lessonProgress = useMemo(() => enrollment.progress?.lessonDetails?.find(ld => ld.lesson === currentLesson._id), [enrollment, currentLesson]);
    const initialSlideIndex = useMemo(() => lessonProgress?.submission?.lastViewedSlideIndex || 0, [lessonProgress]);
    
    const [currentIndex, setCurrentIndex] = useState(initialSlideIndex);
    const [isPlaying, setIsPlaying] = useState(false);
    
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] =useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [isSidePanelOpen, setIsSidePanelOpen] = useState(true);
    const [volumeSliderVisible, setVolumeSliderVisible] = useState(false);
    const [isChangingVolume, setIsChangingVolume] = useState(false);

    const audioRef = useRef(null);
    const playerRef = useRef(null);
    const controlsTimeoutRef = useRef(null);
    const sidePanelStateBeforeFullscreen = useRef(true);

    const { mutate: updateProgress } = useUpdatePresentationProgress();

    const debouncedUpdateProgress = useCallback(debounce((index) => {
        if (enrollment?._id && currentLesson?._id && !enrollment.isPreview) {
            updateProgress({ enrollmentId: enrollment._id, lessonId: currentLesson._id, lastViewedSlideIndex: index });
        }
    }, 1000), [enrollment?._id, currentLesson?._id, updateProgress, enrollment?.isPreview]);

    useEffect(() => {
        if (currentIndex !== initialSlideIndex) debouncedUpdateProgress(currentIndex);
    }, [currentIndex, initialSlideIndex, debouncedUpdateProgress]);

    const slides = currentLesson?.content?.presentation?.slides || [];
    const currentSlide = slides[currentIndex];
    const isLastSlide = currentIndex === slides.length - 1;

    useEffect(() => {
        const handleMouseUp = () => { if (isChangingVolume) setIsChangingVolume(false); };
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, [isChangingVolume]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const onReady = () => setDuration(audio.duration);
        const onTimeUpdate = () => setCurrentTime(audio.currentTime);
        const onEnded = () => {
            setIsPlaying(false);
            if (!isLastSlide) handleNext();
        };
        audio.addEventListener('loadedmetadata', onReady);
        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('ended', onEnded);
        if (currentSlide?.audioUrl) audio.load(); else { setDuration(0); setCurrentTime(0); }
        return () => {
            audio.removeEventListener('loadedmetadata', onReady);
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('ended', onEnded);
        };
    }, [currentSlide?.audioUrl, isLastSlide]);

    useEffect(() => {
        const audio = audioRef.current;
        if (audio) {
            if (isPlaying) audio.play().catch(() => setIsPlaying(false)); else audio.pause();
        }
    }, [isPlaying]);

    useEffect(() => {
        setCurrentTime(0);
        setDuration(currentSlide?.duration || 0);
        setIsPlaying(false);
        setZoomLevel(1);
    }, [currentIndex, currentSlide]);

    useEffect(() => {
        const onFullscreenChange = () => {
            const isCurrentlyFullscreen = !!document.fullscreenElement;
            setIsFullscreen(isCurrentlyFullscreen);
            if (!isCurrentlyFullscreen) setIsSidePanelOpen(sidePanelStateBeforeFullscreen.current);
        };
        document.addEventListener('fullscreenchange', onFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
    }, []);

    const showControls = useCallback(() => {
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        setControlsVisible(true);
        if (isPlaying) {
             controlsTimeoutRef.current = setTimeout(() => { setControlsVisible(false); }, 3000);
        }
    }, [isPlaying]);
    
    useEffect(() => {
        const handleKeyDown = (e) => {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT' || activeEl.closest('[data-radix-popper-content-wrapper]'))) return;
            if (e.key === 'ArrowRight') { e.preventDefault(); handleNext(); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrev(); }
            if (e.key === 'f') { e.preventDefault(); toggleFullScreen(); }
            if (e.key === 'm') { e.preventDefault(); toggleMute(); }
            if (e.key === ' ' && currentSlide?.audioUrl) { e.preventDefault(); handlePlayPause(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentIndex, slides.length, currentSlide, isMuted, volume]);


    const handleNext = useCallback(() => { if (currentIndex < slides.length - 1) setCurrentIndex(i => i + 1); }, [currentIndex, slides.length]);
    const handlePrev = useCallback(() => { if (currentIndex > 0) setCurrentIndex(i => i - 1); }, [currentIndex]);
    const handlePlayPause = () => { if (currentSlide?.audioUrl) setIsPlaying(p => !p); };
    const handleSeek = (e) => { const newTime = parseFloat(e.target.value); if (audioRef.current) { audioRef.current.currentTime = newTime; setCurrentTime(newTime); } };
    const handleVolumeMouseDown = () => setIsChangingVolume(true);
    const handleVolumeChange = (e) => { const v = parseFloat(e.target.value); setVolume(v); setIsMuted(v === 0); if (audioRef.current) audioRef.current.volume = v; };
    const toggleMute = useCallback(() => { const newMuted = !isMuted; setIsMuted(newMuted); if (audioRef.current) audioRef.current.muted = newMuted; }, [isMuted]);
    const toggleFullScreen = () => {
        if (!document.fullscreenElement) {
            sidePanelStateBeforeFullscreen.current = isSidePanelOpen;
            setIsSidePanelOpen(false);
            playerRef.current?.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    };
    const handleZoomIn = () => setZoomLevel(p => Math.min(MAX_ZOOM, p + ZOOM_INCREMENT));
    const handleZoomOut = () => setZoomLevel(p => Math.max(MIN_ZOOM, p - ZOOM_INCREMENT));

    const handleMouseMove = () => showControls();
    const handleMouseLeave = () => { if (isPlaying) setControlsVisible(false); };
    
    const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
    
    if (!currentLesson || !currentSlide) { return <Skeleton className="h-full w-full" />; }
    
   return (
      <TooltipProvider>
            <div ref={playerRef} className="relative flex h-full w-full overflow-hidden bg-black font-sans antialiased text-white">
                <div className="group/main relative flex flex-grow flex-col" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
                    
                    {!isSidePanelOpen && !isFullscreen && (
                        <div className='absolute right-4 top-4 z-[22] hidden md:block'>
                             <Tooltip><TooltipTrigger asChild><Button onClick={() => setIsSidePanelOpen(true)} variant="ghost" size="icon" className="h-10 w-10 rounded-full bg-black/30 text-white/80 hover:bg-black/50 hover:text-white" aria-label={t('common:open_panel', 'Open Panel')}><ChevronLeft size={24}/></Button></TooltipTrigger><TooltipContent><p>{t('common:open_panel', 'Open Panel')}</p></TooltipContent></Tooltip>
                        </div>
                    )}

                    <div className={cn("relative flex flex-grow items-center justify-center p-4", zoomLevel > 1 ? "overflow-auto cursor-grab active:cursor-grabbing" : "overflow-hidden")}>
                        <img src={currentSlide.imageUrl} alt={`${t('common:slide')} ${currentIndex + 1}`} className={cn("object-contain transition-transform duration-150 ease-out", zoomLevel > 1 ? "max-w-none max-h-none" : "max-w-full max-h-full")} style={{ transform: `scale(${zoomLevel})` }}/>
                        
                        {(currentSlide.overlays || []).map((overlay) => (
                             <Popover key={overlay._id}>
                                <Tooltip delayDuration={100}><TooltipTrigger asChild>
                                    <PopoverTrigger asChild>
                                        <button style={{ left: `${overlay.position.x}%`, top: `${overlay.position.y}%`, width: `${overlay.position.width}%`, height: `${overlay.position.height}%`}} aria-label={overlay.type === 'link' ? t('programs:open_link') : t('programs:show_note')} className={cn("absolute z-10 group flex items-center justify-center border-2 transition-all duration-200", overlay.type === 'link' ? "border-blue-400/30 hover:bg-blue-400/20" : "border-green-400/30 hover:bg-green-400/20")} onClick={e => e.stopPropagation()}>
                                            {overlay.type === 'link' ? <LinkIcon className="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-90" /> : <Type className="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-90" />}
                                        </button>
                                    </PopoverTrigger>
                                </TooltipTrigger><TooltipContent><p>{overlay.type === 'link' ? t('programs:open_link') : t('programs:show_note')}</p></TooltipContent></Tooltip>
                                 <PopoverContent className="w-80 break-words text-foreground" onClick={e => e.stopPropagation()}>
                                     {overlay.type === 'link' ? <a href={overlay.data.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{overlay.data.url}</a> : <p>{overlay.data.text}</p>}
                                 </PopoverContent>
                             </Popover>
                        ))}
                    </div>

                    {!isLastSlide && (
                        <div className="absolute right-4 top-1/2 z-20 -translate-y-1/2 opacity-0 transition-opacity group-hover/main:opacity-100"><Tooltip><TooltipTrigger asChild><Button onClick={handleNext} variant="ghost" size="icon" className="h-12 w-12 rounded-full bg-black/30 backdrop-blur-sm hover:bg-black/50" aria-label={t('programs:next_slide', "Next Slide")}><ChevronRight size={32} /></Button></TooltipTrigger><TooltipContent><p>{t('programs:next_slide', "Next Slide")}</p></TooltipContent></Tooltip></div>
                    )}
                    {currentIndex > 0 && (
                        <div className="absolute left-4 top-1/2 z-20 -translate-y-1/2 opacity-0 transition-opacity group-hover/main:opacity-100"><Tooltip><TooltipTrigger asChild><Button onClick={handlePrev} variant="ghost" size="icon" className="h-12 w-12 rounded-full bg-black/30 backdrop-blur-sm hover:bg-black/50" aria-label={t('programs:previous_slide', "Previous Slide")}><ChevronLeft size={32} /></Button></TooltipTrigger><TooltipContent><p>{t('programs:previous_slide', "Previous Slide")}</p></TooltipContent></Tooltip></div>
                    )}
                    
                    <audio ref={audioRef} src={currentSlide.audioUrl} muted={isMuted} preload="metadata" />

                    <div className={cn("absolute bottom-0 left-0 right-0 z-[21] bg-gradient-to-t from-black/70 to-transparent p-3 pb-5 transition-all duration-250 ease-in-out", (controlsVisible || !isPlaying) ? 'opacity-100 visible' : 'opacity-0 invisible')} onClick={e => e.stopPropagation()}>
                        <div className="flex w-full items-center justify-between">
                            <div className="flex flex-1 basis-0 items-center justify-start"><span className="text-sm font-medium tabular-nums text-white/80">{currentIndex + 1} / {slides.length}</span></div>
                            <div className="flex min-w-[300px] max-w-xl flex-[2_1_0] items-center justify-center">
                                {currentSlide.audioUrl ? <PresentationAudioPlayer isPlaying={isPlaying} duration={duration} currentTime={currentTime} onPlayPause={handlePlayPause} onSeek={handleSeek} waveform={currentSlide.waveform} /> : <div className="text-sm text-white/50">{t('programs:no_audio_for_slide', 'No audio for this slide')}</div>}
                            </div>
                            <div className="flex flex-1 basis-0 items-center justify-end gap-1">
                                {currentSlide.audioUrl && (
                                    <div className="relative flex items-center" onMouseEnter={() => setVolumeSliderVisible(true)} onMouseLeave={() => { if (!isChangingVolume) setVolumeSliderVisible(false); }}>
                                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={toggleMute}><VolumeIcon size={24} /></Button></TooltipTrigger><TooltipContent><p>{isMuted ? t('common:unmute') : t('common:mute')} (M)</p></TooltipContent></Tooltip>
                                        <div className={cn('absolute bottom-[55px] left-1/2 flex h-[120px] w-10 items-center justify-center rounded-[20px] bg-neutral-800/90 backdrop-blur-lg transition-all duration-150', (volumeSliderVisible || isChangingVolume) ? 'visible -translate-x-1/2 translate-y-0 scale-100 opacity-100' : 'invisible -translate-x-1/2 translate-y-2.5 scale-90 opacity-0')}>
                                            <input type="range" min={0} max={1} step="any" value={isMuted ? 0 : volume} onMouseDown={handleVolumeMouseDown} onChange={handleVolumeChange} aria-label="Volume control" style={{'--volume': `${(isMuted ? 0 : volume) * 100}%`}} className="h-1.5 w-20 -rotate-90 cursor-pointer appearance-none bg-transparent focus:outline-none [&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-runnable-track]:w-full [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,white_var(--volume),rgba(255,255,255,0.3)_var(--volume))] [&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-none [&::-webkit-slider-thumb]:bg-white" />
                                        </div>
                                    </div>
                                )}
                                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handleZoomOut} disabled={zoomLevel <= MIN_ZOOM}><ZoomOut size={22} /></Button></TooltipTrigger><TooltipContent><p>{t('programs:zoom_out', 'Zoom Out')}</p></TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={handleZoomIn} disabled={zoomLevel >= MAX_ZOOM}><ZoomIn size={22} /></Button></TooltipTrigger><TooltipContent><p>{t('programs:zoom_in', 'Zoom In')}</p></TooltipContent></Tooltip>
                                <div className="md:hidden">
                                    <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}><SheetTrigger asChild><Button variant="ghost" size="icon" aria-label={t('programs:toggle_panel')}><NotebookText className="h-5 w-5"/></Button></SheetTrigger><SheetContent className="w-[90%] max-w-md border-l-0 bg-transparent p-0"><SidePanel currentSlide={currentSlide} currentLesson={currentLesson} enrollment={enrollment} /></SheetContent></Sheet>
                                </div>
                                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={toggleFullScreen}>{isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}</Button></TooltipTrigger><TooltipContent><p>{isFullscreen ? t('common:exit_fullscreen') : t('common:fullscreen')} (F)</p></TooltipContent></Tooltip>
                            </div>
                        </div>
                    </div>
                </div>
                <aside className={cn("relative hidden h-full shrink-0 flex-col bg-muted transition-all duration-300 ease-in-out dark:bg-background/50 md:flex", isSidePanelOpen ? "w-[360px] max-w-[40%] border-l" : "w-0")}>
                    <div className={cn("w-full flex-grow overflow-hidden transition-opacity", isSidePanelOpen ? "opacity-100" : "opacity-0")}>
                        <SidePanel currentSlide={currentSlide} currentLesson={currentLesson} enrollment={enrollment} setIsSidePanelOpen={setIsSidePanelOpen} />
                    </div>
                </aside>
            </div>
        </TooltipProvider>
    );
};

export default PresentationPlayer;