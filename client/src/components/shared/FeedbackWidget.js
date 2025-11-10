import React, { useRef,useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bug, Loader2, Lightbulb, HelpCircle, Paperclip, Camera, X, File as FileIcon } from 'lucide-react';
import { Button } from '../ui/button.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.tsx';
import { Input } from '../ui/input.tsx';
import { Textarea } from '../ui/textarea.tsx';
import { useSubmitSupportTicket } from '../../hooks/useAdmin';
import { toast } from 'react-hot-toast';
import axios from 'axios';
import api from '../../services/api';

const AttachmentThumbnail = ({ attachment, onRemove, onView }) => {
    const isImage = attachment.resource_type === 'image' || (attachment.file && attachment.file.type.startsWith('image/'));

    return (
        <div
            className={`relative h-20 w-20 rounded-md border p-1 bg-background ${isImage ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
            onClick={() => isImage && onView && onView()}
        >
            {isImage ? (
                <img src={attachment.previewUrl || attachment.url} alt={attachment.filename} className="h-full w-full object-contain" />
            ) : (
                <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground">
                    <FileIcon className="h-8 w-8" />
                    <p className="mt-1 truncate text-xs">{attachment.filename}</p>
                </div>
            )}
            <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 h-5 w-5 rounded-full z-10"
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
            >
                <X className="h-3 w-3" />
            </Button>
        </div>
    );
};

const FeedbackWidget = () => {
    const { t } = useTranslation(['common', 'admin']);
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState(0);
    const [category, setCategory] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [viewingAttachment, setViewingAttachment] = useState(null);
    const [isTakingScreenshot, setIsTakingScreenshot] = useState(false);
    const fileInputRef = useRef(null);
    const modalRef = useRef(null);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartOffset, setDragStartOffset] = useState({ x: 0, y: 0 });
    const [isPositionManagedByJS, setIsPositionManagedByJS] = useState(false);

    const buttonRef = useRef(null);
    const dragHappened = useRef(false);
    const [buttonPosition, setButtonPosition] = useState({ x: 0, y: 0 });
    const [isButtonDragging, setIsButtonDragging] = useState(false);
    const [buttonDragStartOffset, setButtonDragStartOffset] = useState({ x: 0, y: 0 });
    const [isButtonPositionManagedByJS, setIsButtonPositionManagedByJS] = useState(false);

    const submitTicketMutation = useSubmitSupportTicket();

    useEffect(() => {
        const handleMouseMove = (e) => {
          if (!isDragging || !modalRef.current) return;
          const newX = e.clientX - dragStartOffset.x;
          const newY = e.clientY - dragStartOffset.y;
          setPosition({ x: newX, y: newY });
        };
        const handleMouseUp = () => {
          if (isDragging) setIsDragging(false);
        };
        if (isDragging) {
          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragStartOffset]);

    useEffect(() => {
        if (modalRef.current) {
            if (isPositionManagedByJS) {
                modalRef.current.style.setProperty('top', `${position.y}px`, 'important');
                modalRef.current.style.setProperty('left', `${position.x}px`, 'important');
                modalRef.current.style.setProperty('transform', 'none', 'important');
                modalRef.current.style.setProperty('margin', '0px', 'important');
            } else {
                modalRef.current.style.removeProperty('top');
                modalRef.current.style.removeProperty('left');
                modalRef.current.style.removeProperty('transform');
                modalRef.current.style.removeProperty('margin');
            }
        }
    }, [isPositionManagedByJS, position]);

    useEffect(() => {
    const handleMouseMove = (e) => {
        if (!isButtonDragging || !buttonRef.current) return;
        dragHappened.current = true;
        const newX = e.clientX - buttonDragStartOffset.x;
        const newY = e.clientY - buttonDragStartOffset.y;
        setButtonPosition({ x: newX, y: newY });
    };
    const handleMouseUp = () => {
        if (isButtonDragging) setIsButtonDragging(false);
    };
    if (isButtonDragging) {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };
}, [isButtonDragging, buttonDragStartOffset]);

    if (process.env.NODE_ENV === 'production') {
        return null;
    }

    const resetState = () => {
        setStep(0);
        setCategory('');
        setTitle('');
        setDescription('');
        setAttachments([]);
        setIsOpen(false);
        setIsPositionManagedByJS(false);
        setViewingAttachment(null);
    };
  
    const handleButtonMouseDown = (e) => {
    if (e.button !== 0 || !buttonRef.current) return;
    dragHappened.current = false;
    const buttonRect = buttonRef.current.getBoundingClientRect();
    
    const currentStartX = isButtonPositionManagedByJS ? buttonPosition.x : buttonRect.left;
    const currentStartY = isButtonPositionManagedByJS ? buttonPosition.y : buttonRect.top;

    if (!isButtonPositionManagedByJS) {
        setButtonPosition({ x: currentStartX, y: currentStartY });
        setIsButtonPositionManagedByJS(true);
    }

    setIsButtonDragging(true);
    setButtonDragStartOffset({ x: e.clientX - currentStartX, y: e.clientY - currentStartY });
    e.preventDefault();
};

    const handleMouseDownOnTitle = (e) => {
        if (e.button !== 0 || !modalRef.current) return;
        const modalRect = modalRef.current.getBoundingClientRect();
        const currentStartX = isPositionManagedByJS ? position.x : modalRect.left;
        const currentStartY = isPositionManagedByJS ? position.y : modalRect.top;

        if (!isPositionManagedByJS) {
          setPosition({ x: currentStartX, y: currentStartY });
          setIsPositionManagedByJS(true);
        }
        setIsDragging(true);
        setDragStartOffset({ x: e.clientX - currentStartX, y: e.clientY - currentStartY });
        e.preventDefault();
    };

    const handleCategorySelect = (selectedCategory) => {
        setCategory(selectedCategory);
        setStep(1);
    };
    
    const handleUpload = async (file) => {
        setIsUploading(true);
        try {
            const { data: signatureData } = await api.get('/api/admin/feedback-attachment-signature');
            
            const formData = new FormData();
            formData.append('file', file);
            formData.append('api_key', signatureData.apiKey);
            formData.append('timestamp', signatureData.timestamp);
            formData.append('signature', signatureData.signature);
            formData.append('upload_preset', signatureData.upload_preset);
            if (signatureData.folder) formData.append('folder', signatureData.folder);

            const resourceType = file.type.startsWith('image/') ? 'image' : 'raw';
            const endpointUrl = `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/${resourceType}/upload`;

            const response = await axios.post(endpointUrl, formData, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });

            const { public_id, secure_url, original_filename } = response.data;
            setAttachments(prev => [...prev, { public_id, url: secure_url, filename: original_filename, resource_type: resourceType, file, previewUrl: URL.createObjectURL(file) }]);
        } catch (error) {
            toast.error(t('error.uploadFailed'));
        } finally {
            setIsUploading(false);
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleUpload(e.target.files[0]);
        }
    };
    
    const handleTakeScreenshot = async () => {
        if (!navigator.mediaDevices?.getDisplayMedia) {
            toast.error(t('error.screenCaptureNotSupported', 'Your browser does not support screen capture.'));
            return;
        }

        setIsOpen(false); // Hide the dialog completely
        await new Promise(resolve => setTimeout(resolve, 300)); // Wait for animation

        let stream;
        try {
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: { displaySurface: 'browser' },
                audio: false,
            });

            const track = stream.getVideoTracks()[0];
            await new Promise(resolve => setTimeout(resolve, 200));

            const imageCapture = new ImageCapture(track);
            const bitmap = await imageCapture.grabFrame();
            track.stop(); // Stop sharing immediately

            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext('2d');
            context.drawImage(bitmap, 0, 0);

            canvas.toBlob(async (blob) => {
                if (blob) {
                    const screenshotFile = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' });
                    await handleUpload(screenshotFile);
                }
            }, 'image/png', 1.0);

        } catch (error) {
            if (error.name === 'NotAllowedError') {
                toast.error(t('error.screenshotPermissionDenied', 'Permission to capture screen was denied.'));
            } else {
                console.error("Screenshot error:", error);
                toast.error(t('error.screenshotFailed', 'Could not capture the screen.'));
            }
        } finally {
            stream?.getTracks().forEach(track => track.stop());
            setIsOpen(true); // Show the dialog again
        }
    };

    const removeAttachment = (public_id) => {
        setAttachments(prev => prev.filter(att => att.public_id !== public_id));
    };

    const handleSubmit = async () => {
        const payload = {
            subject: `[${category}] ${title}`,
            initialMessage: description,
            ticketType: 'feedback_report',
            contextSnapshot: {
                url: window.location.href,
                browser: navigator.userAgent,
                screenResolution: `${window.screen.width}x${window.screen.height}`,
                viewport: `${window.innerWidth}x${window.innerHeight}`,
            },
            attachments: attachments.map(({ previewUrl, file, ...rest }) => rest)
        };
        
        submitTicketMutation.mutate(payload, {
            onSuccess: (data) => {
                 setStep(2);
            },
            onError: () => {
                 toast.error(t('error.generic'));
            }
        });
    };

    const isActionDisabled = isUploading || isTakingScreenshot;

    const buttonStyle = isButtonPositionManagedByJS
        ? { top: buttonPosition.y, left: buttonPosition.x, bottom: 'auto', right: 'auto' }
        : {};
    const buttonClassName = `fixed h-14 w-14 rounded-full shadow-lg z-50 ${!isButtonPositionManagedByJS ? 'bottom-5 right-5' : ''}`;

    return (
        <>
            <Button
                ref={buttonRef}
                variant="default"
                size="icon"
                className={buttonClassName}
                style={buttonStyle}
                onMouseDown={handleButtonMouseDown}
                onClick={() => {
                    if (dragHappened.current) return;
                    setIsOpen(true);
                }}
            >
                <Bug className="h-6 w-6" />
            </Button>
            <Dialog modal={false} open={isOpen} onOpenChange={(open) => !open && resetState()}>
                <DialogContent
                    ref={modalRef}
                    className="sm:max-w-2xl"
                    onInteractOutside={(e) => {
                        e.preventDefault(); // This stops it from closing
                    }}
                >
                    <DialogHeader onMouseDown={handleMouseDownOnTitle} className="cursor-move">
                        <DialogTitle>{t('admin:feedback.title', 'Feedback einreichen')}</DialogTitle>
                        <DialogDescription>{t('admin:feedback.description', 'Helfen Sie uns, die Plattform zu verbessern! Melden Sie Fehler oder schlagen Sie neue Funktionen vor.')}</DialogDescription>
                    </DialogHeader>
                    {step === 0 && (
                        <div className="grid grid-cols-1 gap-4 py-4 md:grid-cols-3">
                            <Button variant="outline" className="h-28 flex-col text-center" onClick={() => handleCategorySelect('Bug Report')}><Bug className="mb-2 h-6 w-6" />{t('admin:feedback.bugReport', 'Fehler melden')}</Button>
                            <Button variant="outline" className="h-28 flex-col text-center" onClick={() => handleCategorySelect('Suggestion')}><Lightbulb className="mb-2 h-6 w-6" />{t('admin:feedback.suggestion', 'Verbesserung vorschlagen')}</Button>
                            <Button variant="outline" className="h-28 flex-col text-center" onClick={() => handleCategorySelect('Question')}><HelpCircle className="mb-2 h-6 w-6" />{t('admin:feedback.question', 'Frage stellen')}</Button>
                        </div>
                    )}
                    {step === 1 && (
                         <div className="space-y-4 py-2">
                             <Input placeholder={t('admin:feedback.titlePlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
                             <Textarea placeholder={t('admin:feedback.descriptionPlaceholder')} value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[120px]" />
                             <div>
                                 <div className="flex flex-wrap gap-4">
                                     {attachments.map(att => (
                                         <AttachmentThumbnail
                                            key={att.public_id}
                                            attachment={att}
                                            onRemove={() => removeAttachment(att.public_id)}
                                            onView={() => setViewingAttachment(att)}
                                         />
                                     ))}
                                 </div>
                                 <div className="mt-4 flex items-center gap-2">
                                     <Button type="button" variant="outline" onClick={handleTakeScreenshot} disabled={isActionDisabled}>
                                        {isTakingScreenshot ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
                                        {t('admin:feedback.takeScreenshot')}
                                     </Button>
                                     <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isActionDisabled}>
                                        <Paperclip className="mr-2 h-4 w-4" />
                                        {t('admin:feedback.uploadFile')}
                                    </Button>
                                     <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                                     {isUploading && !isTakingScreenshot && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                                 </div>
                             </div>
                         </div>
                    )}
                     {step === 2 && (
                        <div className="py-8 text-center">
                            <h3 className="text-lg font-semibold">{t('admin:feedback.successTitle')}</h3>
                            <p className="text-muted-foreground">{t('admin:feedback.successDescription')}</p>
                        </div>
                    )}
                    <DialogFooter>
                        {step === 1 && <Button onClick={handleSubmit} disabled={!title || !description || submitTicketMutation.isLoading || isActionDisabled}>{submitTicketMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('submit')}</Button>}
                        {step === 2 && <Button onClick={resetState}>{t('close')}</Button>}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {viewingAttachment && (
                <div 
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" 
                    onClick={() => setViewingAttachment(null)}
                >
                    <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                        <img
                            src={viewingAttachment.previewUrl || viewingAttachment.url}
                            alt={viewingAttachment.filename}
                            className="block max-w-full max-h-full object-contain rounded-lg"
                        />
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="absolute -top-2 -right-2 md:-top-4 md:-right-12 rounded-full bg-white/10 hover:bg-white/20 text-white" 
                            onClick={() => setViewingAttachment(null)}
                            aria-label={t('close')}
                        >
                            <X size={24} />
                        </Button>
                    </div>
                </div>
            )}
        </>
    );
};

export default FeedbackWidget;