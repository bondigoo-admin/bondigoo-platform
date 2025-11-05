import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Input } from '../ui/input.tsx';
import { Button } from '../ui/button.tsx';
import { Checkbox } from '../ui/checkbox.tsx';
import { Label } from '../ui/label.tsx';
import { Textarea } from '../ui/textarea.tsx';
import { Loader2, Paperclip, X } from 'lucide-react';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';

const LeadCaptureForm = ({ userType, onSuccess }) => {
    const { t } = useTranslation(['home', 'signup']);
    const [formState, setFormState] = useState({
        email: '',
        firstName: '',
        lastName: '',
        phone: '',
        country: '',
        postalCode: '',
        websiteUrl: '',
        linkedInUrl: '',
        primarySpecialties: '',
        motivationToJoin: '',
        platformExpectations: '',
    });
    const [documents, setDocuments] = useState([]);
    const [isPolicyChecked, setIsPolicyChecked] = useState(false);
    const [formStatus, setFormStatus] = useState('idle');
    const [isDragActive, setIsDragActive] = useState(false);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormState(prev => ({ ...prev, [name]: value }));
    };

    const processFiles = (files) => {
        const fileList = Array.from(files);
        if (documents.length + fileList.length > 3) {
            toast.error(t('signup:coach.application.maxFilesError'));
            return;
        }
        setDocuments(prev => [...prev, ...fileList]);
    };

    const handleFileChange = (e) => processFiles(e.target.files);
    const removeFile = (fileToRemove) => setDocuments(prev => prev.filter(file => file !== fileToRemove));

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setIsDragActive(true);
        } else if (e.type === "dragleave") {
            setIsDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFiles(e.dataTransfer.files);
        }
    };
    
    const isValidEmail = /^\S+@\S+\.\S+$/.test(formState.email);
    const isCoachFormValid = userType === 'coach' ? formState.firstName && formState.lastName : true;
    const isSubmittable = isPolicyChecked && isValidEmail && isCoachFormValid && formStatus !== 'submitting';
    
    const resetForm = () => {
        setFormState({
            email: '', firstName: '', lastName: '', phone: '', country: '', postalCode: '',
            websiteUrl: '', linkedInUrl: '', primarySpecialties: '',
            motivationToJoin: '', platformExpectations: '',
        });
        setDocuments([]);
        setIsPolicyChecked(false);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!isSubmittable) return;

        setFormStatus('submitting');
        
        const formData = new FormData();
        formData.append('type', userType);

        if (userType === 'client') {
            formData.append('email', formState.email);
        } else {
            Object.entries(formState).forEach(([key, value]) => {
                if (value) formData.append(key, value);
            });
            documents.forEach(doc => {
                formData.append('documents', doc);
            });
        }
        
        try {
            await axios.post('/api/leads', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const successMessage = userType === 'client'
                ? t('signup:client.application.successToast')
                : t('signup:coach.application.successToast');
            toast.success(successMessage);

            setFormStatus('success');
            resetForm();
            if (onSuccess) {
                onSuccess(); // This will signal the parent to close the modal
            }
            setTimeout(() => setFormStatus('idle'), 3000);
        } catch (error) {
            toast.error(error.response?.data?.msg || t('signup:coach.application.errorToast'));
            setFormStatus('error');
            setTimeout(() => setFormStatus('idle'), 3000);
        }
    };

    if (userType === 'client') {
        return (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Input type="email" name="email" placeholder={t('finalCta.form.emailPlaceholder')} value={formState.email} onChange={handleInputChange} disabled={formStatus === 'submitting'} required className="text-base" />
                <div className="flex items-center space-x-2">
                    <Checkbox id={`policy-${userType}`} checked={isPolicyChecked} onCheckedChange={setIsPolicyChecked} disabled={formStatus === 'submitting'} />
                    <Label htmlFor={`policy-${userType}`} className="text-sm font-normal text-muted-foreground">
                        {t('finalCta.form.privacyIntro')} <Button variant="link" asChild className="p-0 h-auto text-sm"><Link to="/privacy-policy" target="_blank">{t('finalCta.form.privacyLink')}</Link></Button>.
                    </Label>
                </div>
                <Button type="submit" disabled={!isSubmittable} size="lg">
                    {formStatus === 'submitting' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('finalCta.form.submitting')}</> : t('finalCta.form.ctaClient')}
                </Button>
            </form>
        );
    }
    
    return (
        <form onSubmit={handleSubmit} onDragEnter={handleDrag} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input name="firstName" placeholder={t('signup:coach.application.firstName')} value={formState.firstName} onChange={handleInputChange} required />
                <Input name="lastName" placeholder={t('signup:coach.application.lastName')} value={formState.lastName} onChange={handleInputChange} required />
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input type="email" name="email" placeholder={t('signup:coach.application.email')} value={formState.email} onChange={handleInputChange} required />
                <Input type="tel" name="phone" placeholder={t('signup:coach.application.phone')} value={formState.phone} onChange={handleInputChange} />
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input name="country" placeholder={t('signup:coach.application.country')} value={formState.country} onChange={handleInputChange} />
                <Input name="postalCode" placeholder={t('signup:coach.application.postalCode')} value={formState.postalCode} onChange={handleInputChange} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input name="websiteUrl" placeholder={t('signup:coach.application.websiteUrl')} value={formState.websiteUrl} onChange={handleInputChange} />
                <Input name="linkedInUrl" placeholder={t('signup:coach.application.linkedInUrl')} value={formState.linkedInUrl} onChange={handleInputChange} />
            </div>
            <Textarea name="primarySpecialties" placeholder={t('signup:coach.application.primarySpecialties')} value={formState.primarySpecialties} onChange={handleInputChange} />
            <Textarea name="motivationToJoin" placeholder={t('signup:coach.application.motivationToJoin')} value={formState.motivationToJoin} onChange={handleInputChange} />
            <Textarea name="platformExpectations" placeholder={t('signup:coach.application.platformExpectations')} value={formState.platformExpectations} onChange={handleInputChange} />
            <div>
                <Label htmlFor="documents">{t('signup:coach.application.documents')}</Label>
                <div onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop} className={cn("relative mt-2 flex justify-center rounded-lg border border-dashed border-border px-6 py-10 transition-colors", isDragActive && "border-primary bg-primary/10")}>
                    <div className="text-center">
                        <Paperclip className="mx-auto h-12 w-12 text-muted-foreground" />
                        <div className="mt-4 flex text-sm leading-6 text-muted-foreground">
                            <Label htmlFor="file-upload" className="relative cursor-pointer rounded-md bg-background font-semibold text-primary focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 hover:text-primary/80">
                                <span>{isDragActive ? t('signup:coach.application.dragActive') : t('signup:coach.application.uploadFile')}</span>
                                <input id="file-upload" name="documents" type="file" className="sr-only" multiple onChange={handleFileChange} />
                            </Label>
                            {!isDragActive && <p className="pl-1">{t('signup:coach.application.dragAndDrop')}</p>}
                        </div>
                        <p className="text-xs leading-5 text-muted-foreground">{t('signup:coach.application.fileTypes')}</p>
                    </div>
                </div>
                {documents.length > 0 && (
                    <div className="mt-4 space-y-2">
                        {documents.map((file, index) => (
                            <div key={index} className="flex items-center justify-between rounded-md border p-2">
                                <span className="text-sm truncate">{file.name}</span>
                                <Button variant="ghost" size="icon" onClick={() => removeFile(file)}><X className="h-4 w-4" /></Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
             <div className="flex items-center space-x-2">
                <Checkbox id={`policy-${userType}`} checked={isPolicyChecked} onCheckedChange={setIsPolicyChecked} disabled={formStatus === 'submitting'} />
                <Label htmlFor={`policy-${userType}`} className="text-sm font-normal text-muted-foreground">
                    {t('finalCta.form.privacyIntro')} <Button variant="link" asChild className="p-0 h-auto text-sm"><Link to="/privacy-policy" target="_blank">{t('finalCta.form.privacyLink')}</Link></Button>.
                </Label>
            </div>
            <Button type="submit" disabled={!isSubmittable} size="lg" className="w-full">
                {formStatus === 'submitting' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('finalCta.form.submitting')}</> : t('finalCta.form.ctaCoach')}
            </Button>
        </form>
    );
};

LeadCaptureForm.propTypes = {
    userType: PropTypes.oneOf(['coach', 'client']).isRequired,
    onSuccess: PropTypes.func,
};

export default LeadCaptureForm;