import React, { useState, useEffect, useMemo } from 'react';
import { useProgramPlayer } from '../../contexts/ProgramPlayerContext';
import { ClipboardCheck, AlertCircle, UploadCloud, X, CheckCircle, Edit2, Trash2, FileText, Image as ImageIcon, Video, File as FileIcon, RotateCcw, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card.tsx';
import { ScrollArea } from '../ui/scroll-area.jsx';
import { Textarea } from '../ui/textarea.tsx';
import { Button } from '../ui/button.tsx';
import { Progress } from '../ui/progress.jsx';
import { toast } from 'react-hot-toast';
import { cn } from '../../lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.tsx';
import { Label } from '../ui/label.tsx';
import { Input } from '../ui/input.tsx';
import { fetchAssignmentSubmission, deleteAssignmentSubmission, submitLesson, deleteAssignmentFile } from '../../services/programAPI';

const AssignmentPlayer = () => {
    const { currentLesson, enrollment, completeCurrentLesson } = useProgramPlayer();
    const { t } = useTranslation(['programs', 'common']);
    const assignment = currentLesson?.content?.assignment;

    const [submissionState, setSubmissionState] = useState('idle');
    const [textSubmission, setTextSubmission] = useState('');
    const [newFiles, setNewFiles] = useState([]);
    const [existingFiles, setExistingFiles] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [existingSubmission, setExistingSubmission] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [previewContent, setPreviewContent] = useState(null);
    const [previewType, setPreviewType] = useState(null);

    useEffect(() => {
        const loadSubmission = async () => {
            if (!currentLesson?._id) return;
            setSubmissionState('idle');

            try {
                const submission = await fetchAssignmentSubmission(currentLesson._id);
                if (submission) {
                    setExistingSubmission(submission);
                    setSubmissionState('submitted');
                    if (submission.type === 'text') {
                        setTextSubmission(submission.content);
                        setExistingFiles([]);
                    } else if (submission.type === 'file_upload') {
                        setExistingFiles(submission.content || []);
                        setTextSubmission('');
                    }
                } else {
                    setExistingSubmission(null);
                    setSubmissionState('idle');
                    setTextSubmission('');
                    setExistingFiles([]);
                }
            } catch (error) {
                toast.error(t('error_loading_submission'), { duration: 5000 });
                setExistingSubmission(null);
                setSubmissionState('idle');
            } finally {
                setNewFiles([]);
            }
        };

        loadSubmission();
    }, [currentLesson?._id, t]);

    const handleFileChange = (e) => {
        const files = e.target.files || e.dataTransfer?.files;
        if (files && files.length > 0) {
            const addedFiles = Array.from(files);
            let validFiles = [];
            let errorShown = false;
            addedFiles.forEach(file => {
                if (file.size > 50 * 1024 * 1024) {
                    if (!errorShown) {
                        toast.error(t('file_too_large', { max: '50MB' }), { duration: 5000 });
                        errorShown = true;
                    }
                } else {
                    validFiles.push(file);
                }
            });
            setNewFiles(prev => [...prev, ...validFiles]);
        }
    };

    const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const onDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
    const onDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFileChange(e);
    };

    const getFileIcon = (type) => {
        const className = "h-8 w-8 text-primary/80";
        if (!type) return <FileIcon className={className} />;
        if (type.startsWith('image/')) return <ImageIcon className={className} />;
        if (type.startsWith('video/')) return <Video className={className} />;
        if (type === 'application/pdf') return <FileText className={className} />;
        return <FileIcon className={className} />;
    };

    const handlePreview = (e, file) => {
        e.stopPropagation();
        const previewUrl = file.isNew ? URL.createObjectURL(file.originalFile) : file.url;
        setPreviewContent(previewUrl);
        setPreviewType(file.type);
        setShowPreviewModal(true);
    };

    const handleSubmit = async (isUpdate = false) => {
        setSubmissionState('submitting');
        try {
            const formData = new FormData();
            if (assignment.submissionType === 'text') {
                formData.append('textSubmission', textSubmission.trim());
            } else {
                if (newFiles.length > 0) {
                    newFiles.forEach(file => formData.append('submissionFile', file));
                } else if (!isUpdate && existingFiles.length === 0) {
                    toast.error(t('no_file_selected'));
                    setSubmissionState('idle');
                    return;
                }
            }
            const onUploadProgress = (progressEvent) => setUploadProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
            const result = await submitLesson({ enrollmentId: enrollment._id, lessonId: currentLesson._id, submissionData: formData, onUploadProgress });
            const updatedProgress = result.enrollment?.progress?.lessonDetails?.find(ld => ld.lesson.toString() === currentLesson._id);
            if (updatedProgress?.submission) {
                 setExistingSubmission({ type: assignment.submissionType, content: assignment.submissionType === 'text' ? updatedProgress.submission.text : updatedProgress.submission.files });
                 if (assignment.submissionType === 'file_upload') setExistingFiles(updatedProgress.submission.files || []);
            }
            setNewFiles([]);
            setSubmissionState('submitted');
            if (!isUpdate) completeCurrentLesson();
            toast.success(t(isUpdate ? 'assignment_updated_toast' : 'assignment_submitted_toast'), { duration: 4000 });
        } catch (error) {
            toast.error(error.response?.data?.message || t('assignment_submission_error'), { duration: 5000 });
            setSubmissionState(existingSubmission ? 'submitted' : 'idle');
        } finally {
            setUploadProgress(0);
        }
    };

    const handleEdit = () => {
        setSubmissionState('editing');
        setNewFiles([]);
    };

    const handleDeleteAll = async () => {
        setShowDeleteConfirm(false);
        try {
            await deleteAssignmentSubmission(currentLesson._id);
            setExistingSubmission(null);
            setTextSubmission('');
            setNewFiles([]);
            setExistingFiles([]);
            setSubmissionState('idle');
            toast.success(t('assignment_deleted_toast'), { duration: 4000 });
        } catch (error) {
           toast.error(error.response?.data?.message || t('assignment_deletion_error'), { duration: 5000 });
        }
    };
    
    const handleRemoveFile = async (e, file) => {
        e.stopPropagation();
        if (file.isNew) {
            setNewFiles(prev => prev.filter(f => f !== file.originalFile));
        } else {
            const toastId = toast.loading(t('common:deleting'));
            try {
                const result = await deleteAssignmentFile(currentLesson._id, file.publicId);
                setExistingFiles(result.submission.files || []);
                toast.success(t('file_deleted_toast'), { id: toastId });
            } catch (error) {
                toast.error(error.response?.data?.message || t('file_deletion_error_toast'), { id: toastId });
            }
        }
    };

    const handleCancelEdit = () => {
        setSubmissionState('submitted');
        setNewFiles([]);
    };
    
    const allFiles = useMemo(() => [
        ...existingFiles.map(f => ({ ...f, isNew: false })),
        ...newFiles.map(f => ({ name: f.name, size: f.size, type: f.type, originalFile: f, isNew: true }))
    ], [existingFiles, newFiles]);

    if (!assignment) {
        return <div className="flex items-center justify-center h-full text-red-500 bg-background"><AlertCircle className="h-5 w-5 mr-2" />{t('assignmentDataMissing')}</div>;
    }
    
    const submissionTypeText = assignment.submissionType === 'text' ? t('submission_type_text') : t('submission_type_file_upload');
    const isSubmitDisabled = submissionState === 'submitting' || (assignment.submissionType === 'text' ? !textSubmission.trim() : (newFiles.length === 0 && (submissionState !== 'editing' || existingFiles.length === 0)));

     const renderFileItem = (file, index) => {
        const key = file.isNew ? file.name + index : file.publicId;
        const commonProps = {
            className: "p-3 border border-border rounded-lg flex items-center justify-between bg-card hover:border-primary/50 hover:bg-muted/50 transition-all duration-200 cursor-pointer group",
            onClick: () => {
                if (!file.isNew) {
                    window.open(file.url, '_blank', 'noopener,noreferrer');
                }
            }
        };

        return (
            <div key={key} {...commonProps}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    {getFileIcon(file.type)}
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground truncate" title={file.name}>{file.name}</p>
                        <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(2)} KB</p>
                    </div>
                </div>
                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {file.isNew && (
                        <Button variant="ghost" size="icon" onClick={(e) => handlePreview(e, file)} aria-label={t('preview')}>
                            <Eye className="h-4 w-4 text-primary" />
                        </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={(e) => handleRemoveFile(e, file)} disabled={submissionState === 'submitting'} aria-label={t('remove_file')}>
                        <X className="h-4 w-4 text-destructive" />
                    </Button>
                </div>
            </div>
        );
    };

   return (
        <ScrollArea className="h-full bg-muted/20">
            <div className="w-full flex justify-center p-4 sm:p-6 lg:p-8">
                <Card className="w-full max-w-3xl shadow-lg border-border rounded-xl">
                    <CardHeader className="text-center p-6">
                        <div className="mx-auto bg-primary/10 text-primary rounded-full p-3 w-14 h-14 flex items-center justify-center mb-4">
                            <ClipboardCheck size={28} />
                        </div>
                        <CardTitle className="text-2xl font-bold text-foreground">{currentLesson.title}</CardTitle>
                        <CardDescription className="text-base mt-1 text-muted-foreground">{submissionTypeText}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                        <div className="prose prose-sm dark:prose-invert max-w-none p-4 border border-border rounded-lg bg-card">
                            <h3 className="!mt-0 font-semibold text-foreground">{t('instructions')}</h3>
                            <div dangerouslySetInnerHTML={{ __html: assignment.instructions.replace(/\n/g, '<br />') }} className="text-muted-foreground" />
                        </div>

                        <div className="pt-6 border-t border-border">
                            <h3 className="text-lg font-semibold text-center mb-4 text-foreground">{t('your_submission')}</h3>
                            {enrollment.isPreview ? (
                                <div className="text-center p-6 bg-muted/50 border border-border rounded-lg space-y-2">
                                    <Eye className="h-5 w-5 mx-auto text-muted-foreground" />
                                    <h4 className="font-semibold">{t('preview_mode_title', 'Preview Mode')}</h4>
                                    <p className="text-sm text-muted-foreground">{t('submission_disabled_in_preview', 'Submissions are disabled in preview mode.')}</p>
                                </div>
                            ) : submissionState === 'submitted' && existingSubmission ? (
                                <div className="text-center p-6 bg-success/10 border border-success/30 rounded-lg space-y-4">
                                    <div className="flex items-center justify-center gap-2 text-success">
                                        <CheckCircle className="h-5 w-5" />
                                        <h4 className="text-lg font-semibold">{t('submission_received_title')}</h4>
                                    </div>
                                    {existingSubmission.type === 'text' ? (
                                        <Textarea value={existingSubmission.content} readOnly className="bg-background/30 text-sm" rows={5} />
                                    ) : (
                                        <div className="space-y-2 text-left">{allFiles.map(renderFileItem)}</div>
                                    )}
                                    <div className="flex justify-center gap-2 pt-2">
                                        <Button size="sm" variant="outline" onClick={handleEdit}><Edit2 size={14} className="mr-2" /> {t('edit_submission')}</Button>
                                        <Button size="sm" variant="outline" onClick={() => setShowDeleteConfirm(true)}><Trash2 size={14} className="mr-2" /> {t('delete_all')}</Button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {assignment.submissionType === 'text' ? (
                                        <Textarea id="text-submission" rows={8} placeholder={t('text_submission_placeholder')} value={textSubmission} onChange={(e) => setTextSubmission(e.target.value)} disabled={submissionState === 'submitting'} className="text-sm" />
                                    ) : (
                                        <div className="space-y-4">
                                            <div className={cn("flex justify-center items-center w-full rounded-lg border-2 border-dashed p-8 transition-all duration-300", isDragging ? "bg-primary/10 border-primary" : "hover:border-primary/50 hover:bg-muted/30 cursor-pointer")} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onClick={() => document.getElementById('file-upload').click()}>
                                                <Input type="file" id="file-upload" className="sr-only" onChange={handleFileChange} disabled={submissionState === 'submitting'} multiple />
                                                <div className="text-center">
                                                    <UploadCloud className="w-10 h-10 mx-auto mb-2 text-primary" />
                                                    <p className="font-semibold text-foreground">{t('file_submission_placeholder_drag')}</p>
                                                    <p className="text-sm text-muted-foreground">{t('file_submission_placeholder_or_click')}</p>
                                                    <p className="text-xs text-muted-foreground mt-2">{t('file_max_size', { max: '50MB' })}</p>
                                                </div>
                                            </div>
                                            {allFiles.length > 0 && <div className="space-y-2">{allFiles.map(renderFileItem)}</div>}
                                        </div>
                                    )}
                                    <div className="mt-6 flex flex-col items-center gap-3">
                                        {submissionState === 'submitting' && <Progress value={uploadProgress} className="w-full h-1.5" />}
                                        <Button size="lg" onClick={() => handleSubmit(submissionState === 'editing')} disabled={isSubmitDisabled} className="w-full max-w-sm font-semibold">
                                            {submissionState === 'submitting' && <RotateCcw className="w-4 h-4 animate-spin mr-2" />}
                                            {submissionState === 'editing' ? t('update_assignment') : t('submit_assignment')}
                                        </Button>
                                        {submissionState === 'editing' && <Button variant="ghost" onClick={handleCancelEdit} className="text-muted-foreground">{t('cancel_edit')}</Button>}
                                    </div>
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <DialogContent className="sm:max-w-md rounded-lg">
                    <DialogHeader><DialogTitle>{t('confirm_delete_title')}</DialogTitle><DialogDescription>{t('confirm_delete_desc')}</DialogDescription></DialogHeader>
                    <DialogFooter><Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>{t('cancel')}</Button><Button variant="outline" onClick={handleDeleteAll}>{t('delete_all')}</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto p-4 sm:p-6 rounded-lg">
                    <DialogHeader><DialogTitle>{t('preview_submission')}</DialogTitle></DialogHeader>
                    {previewContent && (
                        <div className="mt-4 overflow-auto max-h-[75vh]">
                            {previewType.startsWith('image/') ? <img src={previewContent} alt="Preview" className="max-w-full h-auto rounded-md mx-auto" />
                            : previewType.startsWith('application/pdf') ? <iframe src={previewContent} className="w-full h-[75vh] border-none rounded-md" title="PDF Preview" />
                            : previewType.startsWith('video/') ? <video src={previewContent} controls className="w-full h-auto rounded-md mx-auto" />
                            : <p className="text-muted-foreground text-center p-8">{t('preview_not_available')}</p>}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </ScrollArea>
    );
};

export default AssignmentPlayer;