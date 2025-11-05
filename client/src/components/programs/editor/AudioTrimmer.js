import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugin/wavesurfer.regions.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../ui/dialog.tsx';
import { Button } from '../../ui/button.tsx';
import { Play, Pause, Scissors, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import api from '../../../services/api';
import { cn } from '../../../lib/utils';

const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return '00:00.0';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = (seconds % 60).toFixed(1);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const AudioTrimmer = ({ isOpen, onOpenChange, lessonId, slide, onSave, onCancel }) => {
    const { t } = useTranslation(['programs', 'common']);
    
    const [waveformContainer, setWaveformContainer] = useState(null);
    const wavesurferRef = useRef(null);
    const regionRef = useRef(null);

    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [selection, setSelection] = useState({ start: 0, end: slide.duration || 0 });

    const onCancelRef = useRef(onCancel);
    useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);

    const waveformRefCallback = useCallback(node => {
        if (node) {
            setWaveformContainer(node);
        }
    }, []);

    useEffect(() => {
        if (!isOpen || !waveformContainer) {
            if (!isOpen) setIsReady(false);
            return;
        }

        if (!slide.audioUrl) {
            console.error('[AudioTrimmer ERROR] No audioUrl provided.');
            toast.error(t('programs:error_audio_source_missing', 'Audio source is missing.'));
            onCancelRef.current();
            return;
        }
        
        let ws = null;
        
        const initTimeout = setTimeout(() => {
            ws = WaveSurfer.create({
                container: waveformContainer,
                waveColor: 'rgb(55, 65, 81)',
                progressColor: 'rgb(96, 165, 250)',
                barWidth: 3,
                barGap: 2,
                barRadius: 2,
                height: 100,
                cursorColor: '#1E90FF',
                plugins: [ RegionsPlugin.create() ],
                normalize: true,
            });
            wavesurferRef.current = ws;
            
            ws.on('region-updated', (region) => {
                setSelection({ start: region.start, end: region.end });
            });

            ws.on('ready', () => {
                const duration = ws.getDuration();
                console.log(`%c[AudioTrimmer] WaveSurfer READY event fired. Duration: ${duration}s`, 'color: #28a745; font-weight: bold;');
                const initialRegion = ws.addRegion({
                    start: 0,
                    end: duration,
                    color: 'rgba(30, 144, 255, 0.2)',
                    drag: true,
                    resize: true,
                });
                regionRef.current = initialRegion;
                setSelection({ start: initialRegion.start, end: initialRegion.end });
                setIsReady(true);
            });
            
            ws.on('error', (err) => {
                console.error('%c[AudioTrimmer] WaveSurfer ERROR:', 'color: #dc3545; font-weight: bold;', err);
                toast.error(t('programs:error_waveform_load_failed', 'Failed to load audio waveform.'));
            });

            ws.on('play', () => setIsPlaying(true));
            ws.on('pause', () => setIsPlaying(false));
            ws.on('finish', () => setIsPlaying(false));

            const loadAudio = async (url) => {
                try {
                    let urlToLoad = url;
                    if (urlToLoad.includes('cloudinary') && urlToLoad.endsWith('.webm')) {
                        urlToLoad = urlToLoad.replace(/\.webm$/, '.mp3');
                        console.log(`%c[AudioTrimmer] Transformed Cloudinary URL to MP3 for decoding: ${urlToLoad}`, 'color: #007bff; font-weight: bold;');
                    }
                    const response = await fetch(urlToLoad);
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    const blob = await response.blob();
                    await ws.loadBlob(blob);
                } catch (error) {
                    console.error('%c[AudioTrimmer] Failed to fetch or load audio blob.', 'color: #dc3545; font-weight: bold;', error);
                    toast.error(t('programs:error_audio_load_failed'));
                }
            };
            
            loadAudio(slide.audioUrl);

        }, 150);

        return () => {
            clearTimeout(initTimeout);
            if (wavesurferRef.current) {
                wavesurferRef.current.destroy();
                wavesurferRef.current = null;
                regionRef.current = null;
            }
        };
    }, [isOpen, slide.audioUrl, waveformContainer, t]);

    const handlePlayPause = () => {
        if (!wavesurferRef.current || !regionRef.current) return;
        if (isPlaying) {
            wavesurferRef.current.pause();
        } else {
            regionRef.current.play();
        }
    };
    
    const handleSaveTrim = async () => {
        setIsSaving(true);
        try {
            // --- NEW, PRAGMATIC SOLUTION: Use the browser's native Web Audio API ---
            // This bypasses all problematic internal methods of wavesurfer.js.

            console.log('%c[AudioTrimmer SAVE] Starting new save logic. Bypassing wavesurfer internal methods.', 'color: green; font-weight: bold;');

            // 1. Re-fetch the audio file to get its raw data reliably.
            let urlToFetch = slide.audioUrl;
            if (urlToFetch.includes('cloudinary') && urlToFetch.endsWith('.webm')) {
                urlToFetch = urlToFetch.replace(/\.webm$/, '.mp3');
            }
            const response = await fetch(urlToFetch);
            if (!response.ok) throw new Error("Failed to re-fetch audio for processing.");
            const arrayBuffer = await response.arrayBuffer();

            // 2. Use the standard, stable browser AudioContext to decode the data.
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            // 3. Manually calculate the new waveform from the decoded data and the user's selection.
            const channelData = audioBuffer.getChannelData(0);
            const startIndex = Math.floor(selection.start * audioBuffer.sampleRate);
            const endIndex = Math.ceil(selection.end * audioBuffer.sampleRate);
            const selectedData = channelData.slice(startIndex, endIndex);

            const trimmedWaveform = [];
            const desiredLength = 100;
            const groupSize = Math.floor(selectedData.length / desiredLength);

            if (groupSize > 0) {
                for (let i = 0; i < desiredLength; i++) {
                    const groupStart = i * groupSize;
                    let max = 0;
                    for (let j = groupStart; j < groupStart + groupSize; j++) {
                        const val = Math.abs(selectedData[j] || 0);
                        if (val > max) max = val;
                    }
                    trimmedWaveform.push(Number(max.toPrecision(3)));
                }
            }
            // --- END OF NEW SOLUTION ---

            console.log(`%c[AudioTrimmer SAVE] Successfully generated new waveform of length: ${trimmedWaveform.length}. Proceeding to API call.`, 'color: green; font-weight: bold;');

            const res = await api.put(`/api/programs/lessons/${lessonId}/slides/${slide._id}/audio/trim`, {
                startTime: selection.start,
                endTime: selection.end,
                waveform: trimmedWaveform,
            });
            toast.success(t('programs:audio_trimmed_success'));
            onSave(slide._id, res.data);

        } catch (error) {
            toast.error(t('programs:error_audio_trim_failed'));
            console.error("Audio trim error:", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] bg-white shadow-xl rounded-xl p-0 border border-gray-100">
                <DialogHeader className="p-6 border-b border-gray-100">
                    <DialogTitle className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                        <Scissors className="w-5 h-5 text-blue-600" />
                        {t('programs:trim_audio_title')}
                    </DialogTitle>
                    <DialogDescription className="text-sm text-gray-500 mt-1">
                        {t('programs:trim_audio_description', 'Visually adjust the start and end points of your audio recording.')}
                    </DialogDescription>
                </DialogHeader>
                <div className="p-6 space-y-4">
                    <div className="relative w-full h-[120px] bg-gray-50 rounded-lg overflow-hidden">
                        <div ref={waveformRefCallback} className="w-full h-full" />
                        {!isReady && (
                            <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80">
                                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                            </div>
                        )}
                    </div>
                    {isReady && (
                        <div className="flex items-center justify-between text-sm">
                            <Button variant="outline" size="sm" className="bg-white border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-md transition-colors" onClick={handlePlayPause} disabled={!isReady || isSaving}>
                                <span className="flex items-center gap-1.5">
                                    <Pause className={cn("w-4 h-4", { 'hidden': !isPlaying })} />
                                    <Play className={cn("w-4 h-4", { 'hidden': isPlaying })} />
                                    {t('common:play_selection')}
                                </span>
                            </Button>
                            <div className="flex items-center gap-2 text-gray-600 font-mono">
                                <span>{formatTime(selection.start)}</span>
                                <span>-</span>
                                <span>{formatTime(selection.end)}</span>
                                <span className="text-blue-600 font-medium">({formatTime(selection.end - selection.start)})</span>
                            </div>
                        </div>
                    )}
                </div>
                <DialogFooter className="p-6 border-t border-gray-100 flex justify-end gap-3">
                    <Button variant="outline" className="bg-white border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-md transition-colors" onClick={onCancel} disabled={isSaving}>
                        {t('common:cancel')}
                    </Button>
                    <Button variant="save" type="submit" className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-md transition-colors" onClick={handleSaveTrim} disabled={!isReady || isSaving}>
                        <span className="flex items-center gap-1.5">
                            <Loader2 className={cn("w-4 h-4 animate-spin", { 'hidden': !isSaving })} />
                            <span>{isSaving ? t('common:saving') : t('common:save_trim')}</span>
                        </span>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default AudioTrimmer;