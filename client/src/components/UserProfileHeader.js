import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, X, ZoomIn, ZoomOut, Trash2, Loader2, MoreVertical, ShieldX, UserPlus, ShieldAlert } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu.tsx';
import BlockUserMenuItem from './ui/BlockUserMenuItem';
import Cropper from 'react-easy-crop';
import * as userAPI from '../services/userAPI';
import { toast } from 'react-hot-toast';
import { useConnectionManagement } from '../hooks/useConnectionManagement';

// Import ShadCN/UI Components
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar.tsx';
import { Button } from './ui/button.tsx';
import { Card, CardContent } from './ui/card.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog.tsx';
import { Slider } from './ui/slider.tsx';
import { Badge } from './ui/badge.tsx';
import { RadioGroup, RadioGroupItem } from './ui/radio-group.jsx';
import { Label } from './ui/label.tsx';
import { Textarea } from './ui/textarea.tsx';


const UserProfileHeader = ({ profile, onProfileUpdate, isOwnProfile, isBlocked, onConnect }) => {
  const { t } = useTranslation(['common', 'userprofile']);
  const { connections } = useConnectionManagement();
  const [isUploading, setIsUploading] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const fileInputRef = useRef(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');

  const connection = useMemo(() => {
    if (!profile?._id || !connections) return null;
    return connections.find(c => c.otherUser?._id === profile._id);
  }, [connections, profile]);

  const handleReportSubmit = async () => {
    if (!profile._id || !reportReason) {
        toast.error(t('userprofile:reportReasonRequired', 'A reason for the report is required.'));
        return;
    }
    try {
        await userAPI.reportUser(profile._id, { reason: reportReason, details: reportDetails });
        toast.success(t('userprofile:reportSubmitted', 'Thank you for your report. Our team will review it shortly.'));
        setIsReportModalOpen(false);
    } catch (error) {
        console.error('[UserProfileHeader] Failed to submit report', { error });
        toast.error(error.response?.data?.message || t('userprofile:errorSubmitReport', 'Failed to submit report.'));
    }
  };

  const connectionStatus = connection ? connection.status : 'not_connected';

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
    // Reset file input to allow re-uploading the same file
    if(event.target) {
      event.target.value = null;
    }
  };

  const handleCropComplete = useCallback((_, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleEditPicture = useCallback(() => {
    if (profile.profilePicture?.url) {
      setSelectedImage(profile.profilePicture.url);
      setIsImageModalOpen(true);
      setZoom(1);
      setCrop({ x: 0, y: 0 });
    }
  }, [profile.profilePicture?.url]);

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
    if (!croppedAreaPixels) return;
    setIsUploading(true);
    try {
      const croppedImageBlob = await getCroppedImg(selectedImage, croppedAreaPixels);
      const file = new File([croppedImageBlob], "profile.jpg", { type: "image/jpeg" });
      const result = await userAPI.uploadProfilePicture(file);
      onProfileUpdate({ ...profile, profilePicture: result.profilePicture });
      toast.success(t('userprofile:profilePictureUpdated'));
      setIsImageModalOpen(false);
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      toast.error(t('userprofile:errorUploadingProfilePicture'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemovePicture = async () => {
    try {
      const updatedUserData = await userAPI.removeProfilePicture();
      onProfileUpdate(updatedUserData);
      toast.success(t('userprofile:profilePictureRemoved'));
    } catch (error) {
      console.error('Error removing profile picture:', error);
      toast.error(t('userprofile:errorRemovingProfilePicture'));
    }
  };

  return (
    <>
      <Card className="overflow-visible shadow-lg dark:shadow-xl dark:shadow-black/20">
        <div className="h-32 rounded-t-lg bg-gradient-to-r from-indigo-500 to-purple-600" />
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-end -mt-24 sm:-mt-20">
            {/* Avatar Section */}
            <div className="relative group flex-shrink-0">
              <Avatar className="h-32 w-32 sm:h-36 sm:w-36 border-4 border-background shadow-md">
                <AvatarImage src={profile.profilePicture?.url} alt={`${profile.firstName} ${profile.lastName}`} />
                <AvatarFallback className="text-4xl">
                  {profile.firstName?.[0]}{profile.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              {isOwnProfile && (
                <div 
                  className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 cursor-pointer"
                  onClick={profile.profilePicture?.url ? handleEditPicture : () => fileInputRef.current.click()}
                >
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="icon" variant="ghost"
                      className="bg-white/20 hover:bg-white/30 text-white rounded-full"
                      onClick={() => fileInputRef.current.click()}
                      aria-label={t('userprofile:uploadPicture')}
                    >
                      <Camera size={18} />
                    </Button>
                    {profile.profilePicture && (
                       <Button
                         size="icon" variant="ghost"
                         className="bg-white/20 hover:bg-white/30 text-white rounded-full"
                         onClick={handleRemovePicture}
                         aria-label={t('userprofile:removePicture')}
                       >
                         <Trash2 size={18} />
                       </Button>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" hidden accept="image/*" onChange={handleFileChange} />
                </div>
              )}
            </div>
            
{/* Info Section */}
            <div className="mt-4 sm:mt-0 sm:ml-6 text-center sm:text-left flex-grow">
  <div className="flex justify-between items-start">
    <div>
      <h1 className="text-3xl font-bold text-foreground">{profile.firstName} {profile.lastName}</h1>
      <p className="text-lg text-muted-foreground mt-1">{profile.occupation || t('userprofile:noOccupation')}</p>
      <p className="text-sm text-muted-foreground">{profile.location || t('userprofile:noLocation')}</p>
    </div>
    {!isOwnProfile && (
      <div className="flex items-center gap-2">
        {connectionStatus === 'accepted' && <Badge variant="secondary">{t('common:connected', 'Connected')}</Badge>}
        {connectionStatus === 'pending' && <Badge variant="secondary">{t('common:pendingConnection', 'Pending')}</Badge>}
        {connectionStatus !== 'accepted' && connectionStatus !== 'pending' && (
          <Button onClick={onConnect} variant="secondary" size="sm">
            <UserPlus className="mr-2 h-4 w-4" />
            {t('common:connect', 'Connect')}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="-mr-2 -mt-2">
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setIsReportModalOpen(true)} className="flex items-center p-2 cursor-pointer">
              <ShieldAlert className="mr-2 h-4 w-4" />
              <span>{t('userprofile:reportUser', 'Report User')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="flex items-center p-2 cursor-pointer">
              <ShieldX className="mr-2 h-4 w-4" />
              <BlockUserMenuItem 
                targetUserId={profile._id} 
                isBlocked={isBlocked} 
              />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )}
  </div>
</div>
          </div>
        </CardContent>
      </Card>

      {/* Image Cropping Modal */}
      <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
        <DialogContent className="sm:max-w-lg p-0">
          <DialogHeader className="p-4 sm:p-6">
            <DialogTitle>{t('userprofile:adjustProfilePicture', 'Profilbild anpassen')}</DialogTitle>
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
            <Button className="w-full sm:w-auto" variant="outline" onClick={() => setIsImageModalOpen(false)}>{t('common:cancel', 'Abbrechen')}</Button>
            <Button className="w-full sm:w-auto" onClick={handleSaveCroppedImage} disabled={isUploading}>
              {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isUploading ? t('common:uploading') : t('common:saveAndUpload', 'Speichern & Hochladen')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Report User Modal */}
      <Dialog open={isReportModalOpen} onOpenChange={setIsReportModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('userprofile:reportUserTitle', 'Report User')}</DialogTitle>
            <DialogDescription>{t('userprofile:reportUserDesc', 'Help us understand the problem. What is going on with this user?')}</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <RadioGroup value={reportReason} onValueChange={setReportReason}>
              <div className="flex items-center space-x-2"><RadioGroupItem value="impersonation" id="p-imp" /><Label htmlFor="p-imp">{t('userprofile:profileReportReasons.impersonation', 'Impersonation or Fake Profile')}</Label></div>
              <div className="flex items-center space-x-2"><RadioGroupItem value="inappropriate_profile" id="p-inap" /><Label htmlFor="p-inap">{t('userprofile:profileReportReasons.inappropriate_profile', 'Inappropriate Profile Picture/Bio')}</Label></div>
              <div className="flex items-center space-x-2"><RadioGroupItem value="spamming" id="p-spam" /><Label htmlFor="p-spam">{t('userprofile:profileReportReasons.spamming', 'Spamming')}</Label></div>
            </RadioGroup>
            <Textarea
              placeholder={t('userprofile:reportDetailsPlaceholder', 'Provide additional details (optional)...')}
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReportModalOpen(false)}>{t('common:cancel')}</Button>
            <Button onClick={handleReportSubmit}>{t('common:submitReport', 'Submit Report')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UserProfileHeader;