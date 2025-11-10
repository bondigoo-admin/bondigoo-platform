import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog.tsx';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Textarea } from '../ui/textarea.tsx';
import { Label } from '../ui/label.tsx';
import { toast } from 'react-hot-toast';
import { useMutation, useQueryClient } from 'react-query';
import { updateGroupInfo, uploadGroupAvatar, removeGroupAvatar } from '../../services/messageAPI';
import { Loader2, Camera, Upload, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar.tsx";
import Cropper from 'react-easy-crop';
import { Slider } from '../ui/slider.tsx';
import { useDraggableDialog } from '../../hooks/useDraggableDialog';

const EditGroupInfoModal = ({ isOpen, onClose, conversation }) => {
    const { t } = useTranslation(['messaging', 'common']);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [selectedImage, setSelectedImage] = useState(null);
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
    const fileInputRef = useRef(null);
    const queryClient = useQueryClient();
    const modalRef = useRef(null);
    const { handleMouseDownOnTitle, resetDialogPosition } = useDraggableDialog(modalRef);
    
    useEffect(() => {
        if (conversation) {
            setName(conversation.name || '');
            setDescription(conversation.description || '');
        }
    }, [conversation]);

    const mutation = useMutation(updateGroupInfo, {
        onSuccess: () => {
            queryClient.invalidateQueries(['conversations']);
            queryClient.invalidateQueries(['conversation', conversation._id]);
            handleClose();
        },
        onError: (error) => {
            toast.error(error.message || t('common:errorGeneric'));
        }
    });

    const uploadMutation = useMutation(uploadGroupAvatar, {
        onSuccess: () => {
            toast.success(t('messaging:groupAvatarUpdated', 'Group avatar updated'));
            queryClient.invalidateQueries(['conversations']);
            queryClient.invalidateQueries(['conversation', conversation._id]);
            setIsImageModalOpen(false);
        },
        onError: (error) => {
            toast.error(error.message || t('common:errorGeneric'));
        }
    });

    const removeMutation = useMutation(removeGroupAvatar, {
        onSuccess: () => {
            toast.success(t('messaging:groupAvatarRemoved', 'Group avatar removed'));
            queryClient.invalidateQueries(['conversations']);
            queryClient.invalidateQueries(['conversation', conversation._id]);
            if (fileInputRef.current) fileInputRef.current.value = '';
        },
        onError: (error) => {
            toast.error(error.message || t('common:errorGeneric'));
        }
    });

    const handleSubmit = () => {
        if (!name.trim()) {
            toast.error(t('messaging:groupNameRequired'));
            return;
        }
        const updates = { name, description };
        mutation.mutate({ conversationId: conversation._id, updates });
    };

    const handleClose = () => {
        resetDialogPosition();
        onClose();
    };
    
    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setSelectedImage(e.target.result);
                setIsImageModalOpen(true);
                setZoom(1);
                setCrop({ x: 0, y: 0 });
            };
            reader.readAsDataURL(file);
        }
        if (event.target) {
            event.target.value = null;
        }
    };

    const handleCropComplete = useCallback((_, pixels) => {
        setCroppedAreaPixels(pixels);
    }, []);

    const getCroppedImg = useCallback(async (imageSrc, pixelCrop) => {
        const image = await new Promise((resolve, reject) => {
            const img = new Image();
            img.src = imageSrc;
            img.crossOrigin = 'Anonymous';
            img.onload = () => resolve(img);
            img.onerror = (error) => reject(error);
        });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const zoomFactor = 1.15;
        const diameter = Math.min(pixelCrop.width, pixelCrop.height);
        const zoomedDiameter = diameter / zoomFactor;
        const centerX = pixelCrop.x + pixelCrop.width / 2;
        const centerY = pixelCrop.y + pixelCrop.height / 2;
        const sourceX = centerX - zoomedDiameter / 2;
        const sourceY = centerY - zoomedDiameter / 2;
        canvas.width = diameter;
        canvas.height = diameter;

        ctx.drawImage(image, sourceX, sourceY, zoomedDiameter, zoomedDiameter, 0, 0, diameter, diameter);
        
        return new Promise((resolve) => {
            canvas.toBlob((blob) => { resolve(blob); }, 'image/jpeg');
        });
    }, []);

    const handleSaveCroppedImage = async () => {
        if (!croppedAreaPixels || !selectedImage) return;
        try {
            const croppedImageBlob = await getCroppedImg(selectedImage, croppedAreaPixels);
            const file = new File([croppedImageBlob], "group_avatar.jpg", { type: "image/jpeg" });
            uploadMutation.mutate({ conversationId: conversation._id, file });
        } catch (e) {
            console.error(e);
            toast.error(t('common:errorCroppingImage', 'Error while cropping image.'));
        }
    };

    const handleRemoveAvatar = () => {
        removeMutation.mutate(conversation._id);
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
                <DialogContent ref={modalRef} className="sm:max-w-lg">
                    <DialogHeader onMouseDown={handleMouseDownOnTitle} className="cursor-move">
                        <DialogTitle>{t('messaging:editGroupInfo')}</DialogTitle>
                        <DialogDescription>{t('messaging:editGroupInfoDescription')}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6 py-4">
                        <div className="flex justify-center">
                            <div className="relative group">
                                <Avatar className="w-24 h-24 text-3xl">
                                    <AvatarImage src={conversation?.groupAvatar?.url} alt={name} />
                                    <AvatarFallback>{name?.charAt(0).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div className="absolute inset-0 flex items-center justify-center gap-2 transition-opacity bg-black rounded-full cursor-pointer bg-opacity-50 opacity-0 group-hover:opacity-100">
                                    <Button size="icon" variant="ghost" className="text-white rounded-full bg-white/20 hover:bg-white/30" onClick={() => fileInputRef.current.click()}>
                                        <Upload size={18} />
                                    </Button>
                                    {conversation?.groupAvatar?.url && (
                                        <Button size="icon" variant="ghost" className="text-white rounded-full bg-white/20 hover:bg-white/30" onClick={handleRemoveAvatar} disabled={removeMutation.isLoading}>
                                            <Trash2 size={18} />
                                        </Button>
                                    )}
                                </div>
                                <input ref={fileInputRef} id="group-avatar-upload" type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                            </div>
                        </div>
                        <div className="grid items-center grid-cols-4 gap-4">
                            <Label htmlFor="name" className="text-right">{t('common:name')}</Label>
                            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" />
                        </div>
                        <div className="grid items-center grid-cols-4 gap-4">
                            <Label htmlFor="description" className="text-right">{t('common:description')}</Label>
                            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="col-span-3 min-h-[80px]" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={handleClose}>{t('common:cancel')}</Button>
                        <Button onClick={handleSubmit} disabled={mutation.isLoading}>
                            {mutation.isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {t('common:saveChanges')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
                <DialogContent className="p-0 sm:max-w-lg">
                    <DialogHeader className="p-4 sm:p-6">
                        <DialogTitle>{t('messaging:adjustGroupAvatar', 'Adjust Group Avatar')}</DialogTitle>
                    </DialogHeader>
                    <div className="px-4 pb-4 space-y-4 sm:px-6 sm:pb-6">
                        <div className="relative w-full bg-muted/50 aspect-square">
                            <Cropper
                                image={selectedImage}
                                crop={crop}
                                zoom={zoom}
                                aspect={1}
                                cropShape="round"
                                showGrid={false}
                                zoomSpeed={0.1}
                                onCropChange={setCrop}
                                onZoomChange={setZoom}
                                onCropComplete={handleCropComplete}
                                restrictPosition={false}
                            />
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4">
                            <ZoomOut size={20} className="text-muted-foreground" />
                            <Slider
                                value={[zoom]}
                                min={1}
                                max={3}
                                step={0.01}
                                onValueChange={(value) => setZoom(value[0])}
                                aria-label={t('common:zoom')}
                            />
                            <ZoomIn size={20} className="text-muted-foreground" />
                        </div>
                    </div>
                    <DialogFooter className="flex-col-reverse gap-2 p-4 sm:p-6 sm:flex-row sm:justify-end">
                        <Button className="w-full sm:w-auto" variant="ghost" onClick={() => setIsImageModalOpen(false)}>{t('common:cancel')}</Button>
                        <Button className="w-full sm:w-auto" onClick={handleSaveCroppedImage} disabled={uploadMutation.isLoading}>
                            {uploadMutation.isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {uploadMutation.isLoading ? t('common:uploading') : t('common:saveAndUpload', 'Save & Upload')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

EditGroupInfoModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    conversation: PropTypes.object,
};

export default EditGroupInfoModal;