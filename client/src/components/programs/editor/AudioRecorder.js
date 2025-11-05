import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, StopCircle, Trash2, Play, Pause, Loader2, Scissors } from 'lucide-react';
import { Button } from '../../ui/button.tsx';
import { toast } from 'react-hot-toast';
import api from '../../../services/api';
import AudioTrimmer from './AudioTrimmer';
import WaveSurfer from 'wavesurfer.js';
import { logger } from '../../../utils/logger';

const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const AudioRecorder = ({ lessonId, slide, onUploadComplete, onRecordingStateChange }) => {
    const { t } = useTranslation(['programs', 'common']);
    const [isRecording, setIsRecording] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isTrimming, setIsTrimming] = useState(false);
    
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    const mediaRecorderRef = useRef(null);
    const recordingTimerRef = useRef(null);
    const streamRef = useRef(null);
    const waveformContainerRef = useRef(null);
    const wavesurferRef = useRef(null);

    const handleTrimSave = useCallback((slideId, data) => {
        setIsTrimming(false);
        onUploadComplete(slideId, data);
    }, [onUploadComplete]);
    
    const handleTrimCancel = useCallback(() => setIsTrimming(false), []);

    useEffect(() => {
        logger.info(`[AudioRecorder STATE_SYNC] Slide prop changed. ID: ${slide._id}, New audioUrl: ${slide.audioUrl}`);
        setPreviewUrl(slide.audioUrl || null);
        setDuration(slide.duration || 0);
        setIsPlaying(false);
        setCurrentTime(0);
    }, [slide._id, slide.audioUrl, slide.duration]);
    
    useEffect(() => {
        onRecordingStateChange(isRecording);
    }, [isRecording, onRecordingStateChange]);

   useEffect(() => {
    if (!waveformContainerRef.current) return;

    if (!previewUrl) {
        if (wavesurferRef.current) {
            wavesurferRef.current.destroy();
            wavesurferRef.current = null;
        }
        return;
    }
    
    const ws = WaveSurfer.create({
        container: waveformContainerRef.current,
        waveColor: 'rgb(156, 163, 175)',
        progressColor: 'rgb(96, 165, 250)',
        height: 40, barWidth: 2, barGap: 2, barRadius: 2,
        cursorWidth: 1, cursorColor: '#333', interact: true,
    });
    wavesurferRef.current = ws;

    const loadAudio = async (url) => {
        try {
            // **CRITICAL FIX:** Ensure we request the MP3 version for reliable decoding.
            let urlToLoad = url;
            if (urlToLoad.includes('cloudinary') && urlToLoad.endsWith('.webm')) {
                urlToLoad = urlToLoad.replace(/\.webm$/, '.mp3');
                logger.info(`[AudioRecorder] Transformed Cloudinary URL to MP3: ${urlToLoad}`);
            }
            
            const response = await fetch(urlToLoad);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const blob = await response.blob();
            await ws.loadBlob(blob);
        } catch (error) {
            logger.error('[AudioRecorder WAVESURFER_EFFECT] Failed to fetch or load audio blob.', error);
            toast.error(t('programs:error_audio_load_failed'));
        }
    };
    
    loadAudio(previewUrl);
    
    ws.on('ready', () => {
        setDuration(ws.getDuration());
    });
    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => {
        setIsPlaying(false);
        ws.seekTo(0);
        setCurrentTime(0);
    });
    ws.on('error', (err) => {
        logger.error('[AudioRecorder WAVESURFER_EFFECT] WaveSurfer player error', err);
        toast.error(t('programs:error_audio_playback'));
    });
    ws.on('audioprocess', (time) => setCurrentTime(time));

    return () => { 
        if (ws) ws.destroy(); 
    };
}, [previewUrl, t]);

    useEffect(() => {
        return () => {
            if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
            if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
            clearInterval(recordingTimerRef.current);
        };
    }, []);
    
    const handleUpload = async (blobToUpload) => {
        if (!blobToUpload || blobToUpload.size < 1000) {
            toast.error(t('programs:error_audio_recording_too_short'));
            return;
        }

        setIsUploading(true);
        const formData = new FormData();
        formData.append('audio', blobToUpload, `slide_${slide._id}_audio.webm`);
        formData.append('waveform', JSON.stringify([])); 
        
        try {
            const res = await api.post(`/api/programs/lessons/${lessonId}/slides/${slide._id}/audio`, formData, {
                headers: { 'Content-Type': null }
            });
            toast.success(t('programs:audio_upload_success'));
            onUploadComplete(slide._id, res.data);
        } catch (error) { 
            logger.error('[AudioRecorder UPLOAD] Failed.', { error: error.message, response: error.response?.data });
            toast.error(t('programs:error_audio_upload_failed'));
            setPreviewUrl(slide.audioUrl || null);
            setDuration(slide.duration || 0);
        } finally { 
            setIsUploading(false);
        }
    };

    const startRecording = async () => {
        handleReset(false);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            
            const audioChunks = [];
            mediaRecorderRef.current.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
            mediaRecorderRef.current.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                handleUpload(audioBlob);
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
            setCurrentTime(0); setDuration(0);
            recordingTimerRef.current = setInterval(() => setDuration(prev => prev + 1), 1000);
        } catch (error) {
            toast.error(t(error.name === 'NotAllowedError' ? 'programs:error_mic_permission_denied' : 'programs:error_mic_access'));
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
        setIsRecording(false);
        clearInterval(recordingTimerRef.current);
    };

    const handleReset = async (revertToOriginal = true) => {
        if (isRecording) stopRecording();
    
        if (revertToOriginal && slide.audioPublicId) {
            setIsUploading(true);
            try {
                await api.delete(`/api/programs/lessons/${lessonId}/slides/${slide._id}/audio`);
                toast.success(t('programs:audio_deleted_success'));
                onUploadComplete(slide._id, { audioUrl: null, audioPublicId: null, duration: 0, waveform: [] });
            } catch (err) {
                toast.error(t('programs:error_audio_delete_failed'));
            } finally {
                setIsUploading(false);
            }
        } else {
            setPreviewUrl(null);
        }
    };

    const togglePlayPause = () => {
        if (wavesurferRef.current) wavesurferRef.current.playPause();
    };
    
    if (isUploading) {
         return (
            <div className="flex items-center w-full gap-4 p-2 pl-4 border rounded-full bg-muted">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <div className="flex-1 text-sm text-muted-foreground">{t('programs:processing_audio')}</div>
            </div>
         );
    }
    
    if (isRecording) {
        return (
            <div className="flex items-center w-full gap-4 p-2 pl-4 border rounded-full bg-muted">
                <div className="flex items-center gap-2 text-red-500">
                    <span className="relative flex w-2 h-2"><span className="absolute inline-flex w-full h-full bg-red-400 rounded-full opacity-75 animate-ping"></span><span className="relative inline-flex w-2 h-2 bg-red-500 rounded-full"></span></span>
                    <p className="text-sm font-medium tabular-nums font-sans">{formatTime(duration)}</p>
                </div>
                <div className="flex-1 text-sm text-muted-foreground">{t('programs:recording_in_progress')}</div>
                <Button variant="destructive" size="sm" onClick={stopRecording} className="rounded-full"><StopCircle className="w-4 h-4 mr-2" />{t('common:stop')}</Button>
            </div>
        );
    }
    
    if (!previewUrl) {
         return (
             <Button variant="outline" onClick={startRecording} disabled={isUploading || isTrimming}>
                 <Mic className="w-4 h-4 mr-2" />
                 {slide.audioUrl ? t('programs:rerecord_audio_button') : t('programs:record_audio_button')}
             </Button>
        );
    }

    return (
        <>
            <div className="flex flex-col w-full gap-2">
                <div className="flex items-center w-full gap-2 p-1 pr-2 border rounded-full bg-background">
                    <Button variant="ghost" size="icon" onClick={togglePlayPause} disabled={isUploading} className="flex-shrink-0 rounded-full w-9 h-9">{isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</Button>
                    <div ref={waveformContainerRef} className="flex-grow w-full h-10 cursor-pointer -my-1"></div>
                    <span className="ml-2 mr-1 text-xs font-sans text-muted-foreground tabular-nums w-[90px] text-right shrink-0">{formatTime(currentTime)} / {formatTime(duration)}</span>
                    <Button variant="ghost" size="icon" onClick={() => setIsTrimming(true)} disabled={isUploading || !duration} className="flex-shrink-0 rounded-full w-9 h-9"><Scissors className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleReset(true)} disabled={isUploading} className="flex-shrink-0 rounded-full w-9 h-9 text-red-500 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
                </div>
           </div>
            {isTrimming && (
                <AudioTrimmer
                    key={slide.audioUrl || slide._id}
                    isOpen={isTrimming}
                    onOpenChange={setIsTrimming}
                    lessonId={lessonId}
                    slide={{ ...slide, duration: wavesurferRef.current?.getDuration() || slide.duration }}
                    onSave={handleTrimSave}
                    onCancel={handleTrimCancel}
                />
            )}
        </>
    );
};

export default AudioRecorder;