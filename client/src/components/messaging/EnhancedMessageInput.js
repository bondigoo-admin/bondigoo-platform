import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { sendMessage, getMessageUploadSignature } from '../../services/messageAPI';
import { Textarea } from '../ui/textarea.tsx';
import { Button } from '../ui/button.tsx';
import { Loader2, Paperclip, Send, XCircle } from 'lucide-react';
import axios from 'axios';

const AttachmentPreview = ({ file, onRemove, isUploading }) => (
    <div className="flex items-center gap-2 p-1.5 text-sm border rounded-md bg-muted/50 relative">
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        <span className="truncate flex-1">{file.name}</span>
        {isUploading && <Loader2 className="h-4 w-4 animate-spin text-primary absolute right-8" />}
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove} disabled={isUploading}>
            <XCircle className="h-4 w-4 text-destructive" />
        </Button>
    </div>
);

const EnhancedMessageInput = ({ conversationId, recipientId, contextType, contextId, onMessageSent }) => {
    const { t } = useTranslation(['messaging', 'common']);
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [text, setText] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileChange = (event) => {
        const files = Array.from(event.target.files);
        if (files.length > 0) {
            const newAttachments = files.map(file => ({ file, isUploading: false, data: null }));
            setAttachments(prev => [...prev, ...newAttachments]);
        }
        event.target.value = null;
    };

    const removeAttachment = (index) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const uploadFile = async (file) => {
        try {
            const signatureData = await getMessageUploadSignature();
            const formData = new FormData();
            formData.append('file', file);
            formData.append('api_key', signatureData.apiKey);
            formData.append('timestamp', signatureData.timestamp);
            formData.append('signature', signatureData.signature);
            formData.append('upload_preset', signatureData.uploadPreset);
            formData.append('folder', signatureData.folder);

            const response = await axios.post(`https://api.cloudinary.com/v1_1/${signatureData.cloudName}/auto/upload`, formData);

            return {
                url: response.data.secure_url,
                publicId: response.data.public_id,
                resourceType: response.data.resource_type,
                format: response.data.format,
                originalFilename: response.data.original_filename,
                bytes: response.data.bytes,
            };
        } catch (error) {
            toast.error(t('common:error.fileUploadFailed', { fileName: file.name }));
            throw error;
        }
    };

    const sendMessageMutation = useMutation({
        mutationFn: ({ content, attachmentData }) => {
            let finalContentType = 'text';
            if (attachmentData && attachmentData.length > 0) {
                finalContentType = 'file'; 
            }

            return sendMessage({
                recipientUserId: recipientId,
                content,
                contentType: finalContentType,
                conversationId: conversationId,
                contextType,
                contextId,
                attachment: attachmentData,
            });
        },
        onSuccess: (sentMessage) => {
            queryClient.invalidateQueries(['messages', 'infiniteList', conversationId]);
            setText('');
            setAttachments([]);
            onMessageSent?.(sentMessage);
            toast.success(t('messageSentSuccess'));
        },
        onError: () => toast.error(t('errorSendMessage')),
        onSettled: () => setIsUploading(false),
    });

    const handleSend = async () => {
        if (sendMessageMutation.isLoading || isUploading) return;
        if (!text.trim() && attachments.length === 0) return;
        
        setIsUploading(true);
        try {
            const attachmentData = await Promise.all(
                attachments.map(att => uploadFile(att.file))
            );
            sendMessageMutation.mutate({ content: text, attachmentData });
        } catch (error) {
            setIsUploading(false);
        }
    };

    return (
        <div className="flex flex-col border rounded-lg overflow-hidden">
            <div className="p-3">
                <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={t('typeYourFeedback')}
                    className="w-full resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 min-h-[100px]"
                    disabled={sendMessageMutation.isLoading || isUploading}
                />
            </div>
            {attachments.length > 0 && (
                <div className="px-3 pb-3 space-y-2">
                    {attachments.map((att, index) => (
                       <AttachmentPreview key={index} file={att.file} onRemove={() => removeAttachment(index)} isUploading={isUploading} />
                    ))}
                </div>
            )}
            <div className="flex justify-between items-center p-2 border-t bg-muted/50">
                <div>
                    <input
                        type="file"
                        multiple
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        disabled={sendMessageMutation.isLoading || isUploading}
                    />
                    <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={sendMessageMutation.isLoading || isUploading}>
                        <Paperclip className="h-5 w-5" />
                    </Button>
                </div>
                <Button onClick={handleSend} disabled={sendMessageMutation.isLoading || isUploading || (!text.trim() && attachments.length === 0)}>
                    {(sendMessageMutation.isLoading || isUploading) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    {t('sendFeedback')}
                </Button>
            </div>
        </div>
    );
};

export default EnhancedMessageInput;