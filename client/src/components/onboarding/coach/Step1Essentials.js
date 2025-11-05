import React, { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from 'react-query';
import Cropper from 'react-easy-crop';
import { toast } from 'react-hot-toast';
import { uploadProfilePicture, removeProfilePicture } from '../../../services/coachAPI';
import { Upload, Loader2, ZoomIn, ZoomOut, Edit, Trash2 } from 'lucide-react';
import { Input } from '../../ui/input.tsx';
import { Button } from '../../ui/button.tsx';
import { Avatar, AvatarFallback, AvatarImage } from '../../ui/avatar.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../ui/dialog.tsx';
import { Slider } from '../../ui/slider.tsx';
import { Label } from '../../ui/label.tsx';

const Step1Essentials = ({ userId, headline, onUpdate, profilePictureUrl, firstName, lastName }) => {
  const { t } = useTranslation(['onboarding', 'common']);
  const queryClient = useQueryClient();
  const [localHeadline, setLocalHeadline] = useState(headline);
  const [isUploading, setIsUploading] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const fileInputRef = useRef(null);

  const handleHeadlineChange = (e) => setLocalHeadline(e.target.value);
  const handleHeadlineBlur = () => onUpdate('headline', localHeadline);

   const handleRemovePicture = async () => {
    try {
      const result = await removeProfilePicture(userId);
      onUpdate('profileUpdate', result);
      toast.success(t('common:profilePictureRemoved'));
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      toast.error(t('common:errorRemovingProfilePicture'));
    }
  };

  const handleEditPicture = useCallback(() => {
    if (profilePictureUrl) {
        setSelectedImage(profilePictureUrl);
        setIsImageModalOpen(true);
        setZoom(1);
        setCrop({ x: 0, y: 0 });
    }
  }, [profilePictureUrl]);
  
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedImage(reader.result);
        setIsImageModalOpen(true);
      };
      reader.readAsDataURL(file);
    }
  };

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

    if (!ctx) {
      return null;
    }

    const zoomFactor = 1.15;

    const diameter = Math.min(pixelCrop.width, pixelCrop.height);
    const zoomedDiameter = diameter / zoomFactor;
    
    const centerX = pixelCrop.x + pixelCrop.width / 2;
    const centerY = pixelCrop.y + pixelCrop.height / 2;
    
    const sourceX = centerX - zoomedDiameter / 2;
    const sourceY = centerY - zoomedDiameter / 2;

    canvas.width = diameter;
    canvas.height = diameter;

    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      zoomedDiameter,
      zoomedDiameter,
      0,
      0,
      diameter,
      diameter
    );

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/jpeg');
    });
  }, []);

  const handleSaveCroppedImage = async () => {
    setIsUploading(true);
    try {
      const croppedImageBlob = await getCroppedImg(selectedImage, croppedAreaPixels);
      const file = new File([croppedImageBlob], "profile.jpg", { type: "image/jpeg" });
      const result = await uploadProfilePicture(userId, file);
      
      // This is the key change: pass the entire result to the parent for state update.
      // This mirrors the working logic from ProfileHeader.
      onUpdate('profileUpdate', result);
      
      //toast.success(t('common:profilePictureUpdated'));
      queryClient.invalidateQueries(['coachOnboardingProfile', userId]);
      setIsImageModalOpen(false);
    } catch (error) {
      toast.error(t('common:errorUploadingProfilePicture'));
    } finally {
      setIsUploading(false);
    }
  };
  
  const handleCropComplete = useCallback((_, pixels) => setCroppedAreaPixels(pixels), []);
  
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`;

  return (
    <div className="flex flex-col items-center gap-8 pt-8">
      <div className="relative group">
         <button 
          type="button" 
          onClick={profilePictureUrl ? handleEditPicture : () => fileInputRef.current.click()} 
          className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label={profilePictureUrl ? t('common:editPicture') : t('common:uploadPicture')}
        >
          <Avatar className="h-32 w-32 border-4 border-background shadow-md">
            <AvatarImage src={profilePictureUrl} alt={`${firstName} ${lastName}`} />
            <AvatarFallback className="text-4xl bg-muted">
              {initials || '?'}
            </AvatarFallback>
          </Avatar>
        </button>
        <div 
          className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 cursor-pointer"
          onClick={profilePictureUrl ? handleEditPicture : () => fileInputRef.current.click()}
        >
          <div className="flex gap-2 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
            <Button 
              size="icon" 
              variant="ghost" 
              className="bg-white/20 hover:bg-white/30 text-white rounded-full" 
              onClick={() => fileInputRef.current.click()}
              aria-label={t('common:uploadPicture')}
            >
              <Upload size={22} />
            </Button>
            {profilePictureUrl && (
              <>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="bg-white/20 hover:bg-white/30 text-white rounded-full" 
                  onClick={handleEditPicture}
                  aria-label={t('common:editPicture')}
                >
                  <Edit size={22} />
                </Button>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="bg-white/20 hover:bg-white/30 text-white rounded-full" 
                  onClick={handleRemovePicture}
                  aria-label={t('common:removePicture')}
                >
                  <Trash2 size={22} />
                </Button>
              </>
            )}
          </div>
        </div>
        <input ref={fileInputRef} type="file" hidden accept="image/*" onChange={handleFileChange} />
      </div>

      <div className="w-full max-w-md space-y-2">
        <Label htmlFor="headline" className="text-center block">{t('step1c.headlineLabel')}</Label>
        <Input
          id="headline"
          placeholder={t('step1c.headlinePlaceholder')}
          value={localHeadline}
          onChange={handleHeadlineChange}
          onBlur={handleHeadlineBlur}
          className="text-center text-lg h-12"
          maxLength={120}
        />
      </div>

      <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
        <DialogContent className="sm:max-w-lg p-0">
          <DialogHeader className="p-4 sm:p-6">
            <DialogTitle>{t('common:adjustProfilePicture')}</DialogTitle>
          </DialogHeader>
          
          <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-4">
            <div className="relative w-full aspect-square bg-muted/50">
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

          <DialogFooter className="p-4 sm:p-6 flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button className="w-full sm:w-auto" variant="outline" onClick={() => setIsImageModalOpen(false)}>{t('common:cancel')}</Button>
            <Button className="w-full sm:w-auto" onClick={handleSaveCroppedImage} disabled={isUploading}>
              {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isUploading ? t('common:uploading') : t('common:saveAndUpload')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Step1Essentials;