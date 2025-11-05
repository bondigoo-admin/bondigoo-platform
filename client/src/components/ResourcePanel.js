import React, { useState, useEffect, useRef } from 'react';
import { FileText, Download, X, Upload, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import Draggable from 'react-draggable';
import { logger } from '../utils/logger';
import { useVideoSocket } from '../contexts/SocketContext';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Input } from './ui/input.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.tsx';

const ResourcePanel = ({ sessionId, onClose, isCoach, userId }) => {
  const { t } = useTranslation();
  const [resources, setResources] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const nodeRef = useRef(null);
  const token = localStorage.getItem('token') || '';
  const { socket, isConnected: socketConnected, connectionError } = useVideoSocket();

  useEffect(() => {
    if (socket) {
      logger.info('[ResourcePanel] Socket ID check', { socketId: socket.id, sessionId });
    }
  }, [socket, sessionId]);

  useEffect(() => {
    const fetchResources = async () => {
      if (!sessionId) return;
      try {
        const response = await axios.get(`/api/sessions/${sessionId}/resources`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setResources(response.data.resources || []);
      } catch (error) {
        logger.error('[ResourcePanel] Fetch resources error', { error: error.message, sessionId });
        toast.error(t('resourcePanel.fetchError'));
      }
    };
    fetchResources();
  }, [sessionId, token, t]);

  useEffect(() => {
    if (!socket || !socketConnected) {
      logger.warn('[ResourcePanel] Socket not ready for listeners', { sessionId, socketConnected, connectionError });
      return;
    }
  
    logger.info('[ResourcePanel] Setting up socket listeners', { sessionId, socketId: socket.id });
  
    const resourceUploadedHandler = (resource) => {
      logger.info('[ResourcePanel] Resource uploaded event received', { resourceId: resource._id, name: resource.name });
      setResources((prev) => {
        if (prev.some((r) => r._id === resource._id)) {
          logger.warn('[ResourcePanel] Duplicate resource detected, skipping add', { resourceId: resource._id });
          return prev;
        }
        logger.info('[ResourcePanel] Adding new resource to state', { resourceId: resource._id });
        return [...prev, resource];
      });
    };
  
    const resourceDeletedHandler = ({ resourceId }) => {
      logger.info('[ResourcePanel] Resource deleted event received', { resourceId });
      setResources((prev) => {
        logger.info('[ResourcePanel] Removing resource from state', { resourceId });
        return prev.filter((r) => r._id !== resourceId);
      });
    };
  
    socket.on('resource-uploaded', resourceUploadedHandler);
    socket.on('resource-deleted', resourceDeletedHandler);
  
    return () => {
      logger.info('[ResourcePanel] Cleaning up socket listeners', { sessionId });
      socket.off('resource-uploaded', resourceUploadedHandler);
      socket.off('resource-deleted', resourceDeletedHandler);
    };
  }, [socket, socketConnected, sessionId, t, connectionError]);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    const maxSizeMB = 20;
    if (selectedFile.size > maxSizeMB * 1024 * 1024) {
      toast.error(t('resourcePanel.fileTooLarge', { maxSize: maxSizeMB }));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploading(true);
    uploadFile(selectedFile).finally(() => {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    });
  };

  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sessionId', sessionId);
  
    try {
      await axios.post(`/api/sessions/${sessionId}/resources`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      toast.success(t('resourcePanel.uploadSuccess'));
    } catch (error) {
      logger.error('[ResourcePanel] Upload resource error', { error: error.response?.data || error.message, sessionId });
      toast.error(error.response?.data?.message || t('resourcePanel.uploadError'));
    }
  };
  
  const handleDeleteResource = async (resourceId) => {
    if (!isCoach || !sessionId) return;
    if (!window.confirm(t('session.confirmDeleteResource'))) return;
  
    try {
      await axios.delete(`/api/sessions/${sessionId}/resources/${resourceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success(t('resourcePanel.deleteSuccess'));
    } catch (error) {
      logger.error('[ResourcePanel] Delete resource error', { error: error.response?.data || error.message, sessionId, resourceId });
      toast.error(error.response?.data?.message || t('resourcePanel.deleteError'));
    }
  };

  return (
    <Draggable nodeRef={nodeRef} handle='.drag-handle' cancel='.no-drag' bounds='parent'>
      <TooltipProvider>
        <Card ref={nodeRef} className='w-80 absolute z-50 pointer-events-auto flex flex-col max-h-[80vh]'>
          <CardHeader className='drag-handle flex flex-row items-center justify-between space-y-0 p-4 cursor-move'>
            <CardTitle className='text-lg flex items-center gap-2'>
              <FileText className='h-5 w-5' /> {t('session.resources')}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('close')}>
              <X className="h-5 w-5" />
            </Button>
          </CardHeader>
          <CardContent className='p-4 pt-0 overflow-y-auto'>
            {isCoach && (
              <div className='mb-4'>
                <Button asChild className="w-full" disabled={isUploading}>
                  <label htmlFor='resource-upload' className={isUploading ? 'cursor-not-allowed' : 'cursor-pointer'}>
                    {isUploading ? (
                      <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                    ) : (
                      <Upload className='h-4 w-4 mr-2' />
                    )}
                    {isUploading ? t('resourcePanel.uploading') : t('resourcePanel.uploadResource')}
                  </label>
                </Button>
                <Input
                  id='resource-upload'
                  type='file'
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className='hidden'
                  disabled={isUploading}
                />
              </div>
            )}

            <h4 className='text-md font-semibold text-muted-foreground mb-2'>{t('resourcePanel.sharedFiles')}</h4>
            <ul className='space-y-2'>
              {resources.length > 0 ? (
                resources.map((res) => (
                  <li key={res._id} className='flex items-center justify-between p-2 border rounded-lg group'>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className='flex items-center gap-2 flex-1 min-w-0 mr-2'>
                          <FileText className='h-4 w-4 text-muted-foreground flex-shrink-0' />
                          <span className='text-sm truncate'>{res.name}</span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{res.name} ({res.size ? (res.size / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'})</p>
                      </TooltipContent>
                    </Tooltip>
                    
                    <div className='flex items-center gap-1 flex-shrink-0 no-drag'>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button asChild variant="ghost" size="icon" className='h-8 w-8'>
                            <a
                              href={res.url}
                              target='_blank'
                              rel='noopener noreferrer'
                              download={res.name}
                              aria-label={`${t('resourcePanel.download')} ${res.name}`}
                            >
                              <Download className='h-4 w-4' />
                            </a>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>{t('resourcePanel.download')}</p></TooltipContent>
                      </Tooltip>
                      {isCoach && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteResource(res._id)}
                              className='h-8 w-8 text-destructive hover:text-destructive opacity-50 group-hover:opacity-100 transition-opacity'
                              aria-label={`${t('session.deleteResource')} ${res.name}`}
                            >
                              <Trash2 className='h-4 w-4' />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>{t('session.deleteResource')}</p></TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </li>
                ))
              ) : (
                <li className='text-sm text-muted-foreground italic text-center py-4 flex items-center justify-center gap-2'>
                  <AlertCircle className='h-4 w-4 opacity-50' /> {t('resourcePanel.noResources')}
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      </TooltipProvider>
    </Draggable>
  );
};

export default ResourcePanel;