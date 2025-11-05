import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Sparkles, Phone, MapPin, Briefcase, Pencil, Loader2, BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Badge } from './ui/badge.tsx';
import { Button } from './ui/button.tsx';
import { Textarea } from './ui/textarea.tsx';
import { Input } from './ui/input.tsx';
import * as userAPI from '../services/userAPI';
import { toast } from 'react-hot-toast';

const ProfileDetailItem = ({ icon: Icon, value, placeholder }) => (
  <div className="flex items-start gap-4">
    <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
    <span className="text-foreground break-words">
      {value || <span className="italic text-muted-foreground">{placeholder}</span>}
    </span>
  </div>
);

const UserProfileAbout = ({ profile, isOwnProfile, onProfileUpdate }) => {
  const { t } = useTranslation(['common', 'userprofile']);
  
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [editableBio, setEditableBio] = useState('');
  const [isSavingBio, setIsSavingBio] = useState(false);

  const [isEditingInterests, setIsEditingInterests] = useState(false);
  const [editableInterests, setEditableInterests] = useState('');
  const [isSavingInterests, setIsSavingInterests] = useState(false);
  
  useEffect(() => {
    setEditableBio(profile.bio || '');
    setEditableInterests(profile.interests?.join(', ') || '');
  }, [profile]);

  const handleSaveBio = async () => {
    setIsSavingBio(true);
    try {
      const updatedProfile = await userAPI.updateUserProfile({ bio: editableBio });
      onProfileUpdate(updatedProfile);
      toast.success(t('userprofile:bioUpdated'));
      setIsEditingBio(false);
    } catch (error) {
      toast.error(t('userprofile:errorSavingProfile'));
    } finally {
      setIsSavingBio(false);
    }
  };

  const handleSaveInterests = async () => {
    setIsSavingInterests(true);
    try {
      const interestsArray = editableInterests.split(',').map(item => item.trim()).filter(Boolean);
      const updatedProfile = await userAPI.updateUserProfile({ interests: interestsArray });
      onProfileUpdate(updatedProfile);
      toast.success(t('userprofile:interestsUpdated'));
      setIsEditingInterests(false);
    } catch (error) {
      toast.error(t('userprofile:errorSavingProfile'));
    } finally {
      setIsSavingInterests(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
      {/* Left Column */}
      <div className="lg:col-span-2 space-y-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-3">
              <BookOpen className="h-6 w-6 text-primary" />
              <span>{t('userprofile:aboutMe')}</span>
            </CardTitle>
            {isOwnProfile && !isEditingBio && (
              <Button variant="ghost" size="icon" onClick={() => setIsEditingBio(true)}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {isEditingBio ? (
              <div className="space-y-4">
                <Textarea
                  value={editableBio}
                  onChange={(e) => setEditableBio(e.target.value)}
                  placeholder={t('userprofile:aboutMePlaceholder')}
                  rows={6}
                  className="text-base"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setIsEditingBio(false); setEditableBio(profile.bio || ''); }}>{t('common:cancel')}</Button>
                  <Button onClick={handleSaveBio} disabled={isSavingBio}>
                    {isSavingBio && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('common:save')}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground whitespace-pre-wrap">
                {profile.bio || <span className="italic">{t('userprofile:noBioProvided')}</span>}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-3">
              <Sparkles className="h-6 w-6 text-primary" />
              <span>{t('userprofile:passionsAndInterests')}</span>
            </CardTitle>
            {isOwnProfile && !isEditingInterests && (
              <Button variant="ghost" size="icon" onClick={() => setIsEditingInterests(true)}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </CardHeader>
          <CardContent>
             {isEditingInterests ? (
               <div className="space-y-4">
                 <Input
                   value={editableInterests}
                   onChange={(e) => setEditableInterests(e.target.value)}
                   placeholder={t('userprofile:interestsPlaceholder')}
                 />
                 <p className="text-xs text-muted-foreground">{t('userprofile:interestsHelperText')}</p>
                 <div className="flex justify-end gap-2">
                   <Button variant="outline" onClick={() => { setIsEditingInterests(false); setEditableInterests(profile.interests?.join(', ') || ''); }}>{t('common:cancel')}</Button>
                   <Button onClick={handleSaveInterests} disabled={isSavingInterests}>
                     {isSavingInterests && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                     {t('common:save')}
                   </Button>
                 </div>
               </div>
            ) : (
              profile.interests?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profile.interests.map((interest, index) => (
                    <Badge key={index} variant="secondary" className="text-sm px-3 py-1">
                      {interest}
                    </Badge>
                  ))}
                </div>
              ) : <p className="italic text-muted-foreground">{t('userprofile:noInterestsProvided')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right Column */}
      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <User className="h-6 w-6 text-primary" />
              <span>{t('userprofile:details')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <ProfileDetailItem icon={Briefcase} value={profile.occupation} placeholder={t('userprofile:noOccupation')} />
            <ProfileDetailItem icon={MapPin} value={profile.location} placeholder={t('userprofile:noLocation')} />
            <ProfileDetailItem icon={Phone} value={profile.phone} placeholder={t('userprofile:notProvided')} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UserProfileAbout;