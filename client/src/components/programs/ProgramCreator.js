import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from 'react-query';
import { useAuth } from '../../contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from '../ui/dialog.tsx';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Textarea } from '../ui/textarea.tsx';
import { Label } from '../ui/label.tsx';
import { Badge } from '../ui/badge.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs.tsx';
import { useCreateProgram, useUpdateProgram, useDeleteProgram } from '../../hooks/usePrograms';
import { toast } from 'react-hot-toast';
import { debounce } from 'lodash';
import { PlusCircle, X, Loader2, ImageIcon, Trash2, Star, UploadCloud, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, Video, Info, Eye, Maximize2, Minimize2, AlertCircle, CheckCircle, Scissors } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.tsx';
import CurriculumBuilder from './CurriculumBuilder';
import PricingAndPublishForm from './PricingAndPublishForm';
import SearchableListSelector from '../SearchableListSelector';
import { logger } from '../../utils/logger';
import mongoose from 'mongoose';
import DurationInput from './editor/DurationInput';
import VideoEditorModal from '../VideoEditorModal';
import { getUploadSignature } from '../../services/programAPI';
import { processImageForUpload } from '../../utils/imageCompressor';
import CustomVideoPlayer from '../player/CustomVideoPlayer.js';
import { backgroundUploader } from '../../services/backgroundUploader';
import { Progress } from '../ui/progress.jsx';

const recalculateDurations = (programState) => {
    if (!programState || !programState.modules) {
        return programState;
    }

    let hasModuleChanged = false;
    let programContentMinutes = 0;
    let programCompletionMinutes = 0;

    const updatedModules = programState.modules.map(module => {
        let lessonTotals;
        let needsUpdate = false;
        
        const currentContent = module.contentDuration?.minutes || 0;
        const currentCompletion = module.estimatedCompletionTime?.minutes || 0;

        if (!module.contentDuration?.isOverridden || !module.estimatedCompletionTime?.isOverridden) {
            lessonTotals = (module.lessons || []).reduce((acc, lesson) => {
                acc.content += lesson.contentDuration?.minutes || 0;
                acc.completion += lesson.estimatedCompletionTime?.minutes || 0;
                return acc;
            }, { content: 0, completion: 0 });
        }

        const newContent = !module.contentDuration?.isOverridden ? lessonTotals.content : currentContent;
        const newCompletion = !module.estimatedCompletionTime?.isOverridden ? lessonTotals.completion : currentCompletion;

        if (newContent !== currentContent || newCompletion !== currentCompletion) {
            needsUpdate = true;
            hasModuleChanged = true;
        }

        programContentMinutes += newContent;
        programCompletionMinutes += newCompletion;

        if (needsUpdate) {
            return {
                ...module,
                contentDuration: { ...module.contentDuration, minutes: newContent },
                estimatedCompletionTime: { ...module.estimatedCompletionTime, minutes: newCompletion }
            };
        }
        return module;
    });

    const programDurationsChanged = (!programState.contentDuration?.isOverridden && programState.contentDuration.minutes !== programContentMinutes) ||
                                    (!programState.estimatedCompletionTime?.isOverridden && programState.estimatedCompletionTime.minutes !== programCompletionMinutes);

    if (!hasModuleChanged && !programDurationsChanged) {
        return programState;
    }

    const newState = { ...programState, modules: updatedModules };
    
    if (!newState.contentDuration?.isOverridden) {
        newState.contentDuration = { ...newState.contentDuration, minutes: programContentMinutes };
    }
    if (!newState.estimatedCompletionTime?.isOverridden) {
        newState.estimatedCompletionTime = { ...newState.estimatedCompletionTime, minutes: programCompletionMinutes };
    }

    return newState;
};

const getChangedFields = (initial, current) => {
    const changes = {};
    if (!initial) return current;

    Object.keys(current).forEach(key => {
        const initialValue = initial[key];
        const currentValue = current[key];
        const isObject = val => val && typeof val === 'object';

        if (isObject(currentValue) && isObject(initialValue)) {
            if (JSON.stringify(currentValue) !== JSON.stringify(initialValue)) {
                changes[key] = currentValue;
            }
        } else if (JSON.stringify(initialValue) !== JSON.stringify(currentValue)) {
            changes[key] = currentValue;
        }
    });
    return changes;
};

const ProgramCreator = ({ isOpen, setIsOpen, programToEdit }) => {
  logger.info('[ProgramCreator] 1. Component rendered with programToEdit prop:', { programToEdit });
  const MAX_IMAGES = 10;
  const { t } = useTranslation(['programs', 'common', 'managesessions']);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [program, setProgram] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [zoomedImageIndex, setZoomedImageIndex] = useState(null);
  const [newOutcomeText, setNewOutcomeText] = useState('');
  const [isDraggingImages, setIsDraggingImages] = useState(false);
  const [draggedImageIdentifier, setDraggedImageIdentifier] = useState(null);
  const [showTrailerEditor, setShowTrailerEditor] = useState(false);

  const initialProgramRef = useRef(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [indicatorVisible, setIndicatorVisible] = useState(false);
  const createProgramMutation = useCreateProgram();
  const updateProgramMutation = useUpdateProgram();
  const deleteProgramMutation = useDeleteProgram();

const initialProgramState = {
    title: '', subtitle: '', description: '',
    learningOutcomes: [], categories: [],
    programImages: [], deletedImageIds: [],
    coverImage: null, trailerVideo: null,
    modules: [],
    basePrice: { amount: 99, currency: 'CHF' },
    discount: { code: '', type: 'percent', value: 0 },
    status: 'draft',
    isDiscussionEnabled: true,
    language: [],
    skillLevel: [],
    // Add new duration fields to initial state
    contentDuration: { minutes: 0, isOverridden: false },
    estimatedCompletionTime: { minutes: 0, isOverridden: false },
  };

 useEffect(() => {
    if (isOpen) {
      const baseData = {
        ...initialProgramState,
        ...(programToEdit || {}),
      };

      const data = {
        ...baseData,
        categories: Array.isArray(baseData.categories) ? baseData.categories : [],
        language: Array.isArray(baseData.language) ? baseData.language : [],
        skillLevel: Array.isArray(baseData.skillLevel) ? baseData.skillLevel : [],
        programImages: Array.isArray(baseData.programImages) ? baseData.programImages : [],
        deletedImageIds: [],
        contentDuration: baseData.contentDuration || { minutes: 0, isOverridden: false },
        estimatedCompletionTime: baseData.estimatedCompletionTime || { minutes: 0, isOverridden: false },
      };
      
      if (programToEdit?.trailerVideo?.filmstripUrl && data.trailerVideo) {
        data.trailerVideo.filmstripUrl = programToEdit.trailerVideo.filmstripUrl;
      }
      
      if (data.price && !data.basePrice) {
          data.basePrice = data.price;
          delete data.price;
      }

      logger.info('[ProgramCreator] 2. Initializing state with data object:', { data });

      setProgram(data);
      initialProgramRef.current = JSON.parse(JSON.stringify(data));
      setActiveTab('details');
      setZoomedImageIndex(null);
      setIsDirty(false);
      setSaveStatus('idle');
    } else {
      setProgram(null);
      initialProgramRef.current = null;
    }
  }, [programToEdit, isOpen]);

const setProgramAndRecalculate = useCallback((programUpdater) => {
    setProgram(currentProgram => {
      const updatedProgram = typeof programUpdater === 'function' ? programUpdater(currentProgram) : programUpdater;
      return recalculateDurations(updatedProgram);
    });
    if (programToEdit?._id) {
        setIsDirty(true);
    }
  }, [programToEdit?._id]);

  useEffect(() => {
    if (isOpen) {
      const mainHeader = document.querySelector('header');
      
      const setHeaderHeightVar = () => {
        if (mainHeader) {
          const headerHeight = mainHeader.offsetHeight;
          document.documentElement.style.setProperty('--app-header-height', `${headerHeight}px`);
        }
      };
      
      setHeaderHeightVar();
      
      window.addEventListener('resize', setHeaderHeightVar);
      
      return () => {
        window.removeEventListener('resize', setHeaderHeightVar);
        document.documentElement.style.removeProperty('--app-header-height');
      };
    }
  }, [isOpen]);

const debouncedSave = useCallback(
    debounce(async (currentProgramState) => {
        setSaveStatus('saving');
        
        const { programData, newImageFiles, deletedImageIds } = prepareSaveData(currentProgramState);
        const formData = new FormData();
        formData.append('programData', JSON.stringify(programData));
        formData.append('deletedImageIds', JSON.stringify(deletedImageIds));
        newImageFiles.forEach(file => {
          formData.append('programImages', file);
        });

        updateProgramMutation.mutate(
            { programId: currentProgramState._id, updateData: formData },
            {
                onSuccess: (updatedProgram) => {
                    setSaveStatus('saved');
                    initialProgramRef.current = JSON.parse(JSON.stringify(currentProgramState));
                    setIsDirty(false);
                },
                onError: (error) => {
                    setSaveStatus('error');
                }
            }
        );
    }, 1500),
    []
  );

  useEffect(() => {
      if (isDirty && program?._id) {
          debouncedSave(program);
      }
      return () => {
          debouncedSave.cancel();
      };
  }, [program, isDirty, debouncedSave]);

  useEffect(() => {
    if (saveStatus === 'saving' || saveStatus === 'saved' || saveStatus === 'error') {
        setIndicatorVisible(true);
    }
    if (saveStatus === 'saved' || saveStatus === 'error') {
        const timer = setTimeout(() => {
            setIndicatorVisible(false);
        }, 2800);
        return () => clearTimeout(timer);
    }
  }, [saveStatus]);

  const getUniqueIdentifier = (image) => image?._tempId || image.publicId || image._id;

  const handleValueChange = (key, value) => {
    setProgramAndRecalculate(prev => ({ ...prev, [key]: value }));
  };

  const handleLanguagesUpdate = (items) => {
    handleValueChange('language', items);
  };
  
  const handleSkillLevelsUpdate = (items) => {
    handleValueChange('skillLevel', items);
  };

  const handleCategoriesUpdate = (items) => {
    logger.info('[ProgramCreator] handleCategoriesUpdate setting new categories state to:', { items });
    handleValueChange('categories', items);
  };
  
 const handlePriceChange = (key, value) => {
    setProgramAndRecalculate(prev => ({ ...prev, basePrice: { ...prev.basePrice, [key]: value } }));
  };

   const handleDiscountChange = (field, value) => {
    const newDiscount = { ...(program.discount || { code: '', type: 'percent', value: 0 }), [field]: value };
    setProgramAndRecalculate(prev => ({ ...prev, discount: newDiscount }));
  };
  
  const handleDurationUpdate = (type, newMinutes, newIsOverridden) => {
    const updateKey = type === 'content' ? 'contentDuration' : 'estimatedCompletionTime';
    setProgramAndRecalculate(prev => ({
      ...prev,
      [updateKey]: {
        minutes: newMinutes,
        isOverridden: newIsOverridden
      }
    }));
  };

const handleNewImages = (files) => {
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const currentImages = program.programImages || [];
    const remainingSlots = MAX_IMAGES - currentImages.length;
    if (remainingSlots <= 0) {
      toast.error(t('image_upload_limit_reached_toast', { max: MAX_IMAGES }));
      return;
    }

    const filesToAdd = imageFiles.slice(0, remainingSlots);
    if (imageFiles.length > remainingSlots) {
      toast.info(t('image_upload_partial_add_toast', { count: remainingSlots, max: MAX_IMAGES }));
    }

    const newImagePlaceholders = filesToAdd.map(file => ({
        file, // Keep the original file for now
        previewUrl: URL.createObjectURL(file),
        isMain: false,
        _tempId: `temp_${Date.now()}_${Math.random()}`,
        status: 'processing', // Add the new status property
    }));

    if (currentImages.filter(img => img.isMain).length === 0 && newImagePlaceholders.length > 0) {
        newImagePlaceholders[0].isMain = true;
    }

    setProgramAndRecalculate(prev => ({ ...prev, programImages: [...currentImages, ...newImagePlaceholders] }));

    newImagePlaceholders.forEach(placeholder => {
      processImageForUpload(placeholder.file, { maxSizeMB: 10 })
        .then(processedFile => {
          setProgramAndRecalculate(currentProgram => {
            const newImages = currentProgram.programImages.map(img => {
              if (img._tempId === placeholder._tempId) {
                if (processedFile) {
                  return { ...img, file: processedFile, status: 'ready' };
                } else {
                  return { ...img, status: 'error', error: 'Validation failed' };
                }
              }
              return img;
            });
            return { ...currentProgram, programImages: newImages };
          });
        });
    });
  };

  const handleDeleteImage = (imageToDelete) => {
    const identifier = getUniqueIdentifier(imageToDelete);
    const newImages = program.programImages.filter(img => getUniqueIdentifier(img) !== identifier);

    if (imageToDelete.isMain && newImages.length > 0) {
        newImages[0].isMain = true;
    }

    const newDeletedIds = (imageToDelete.publicId || imageToDelete._id) 
        ? [...(program.deletedImageIds || []), imageToDelete.publicId || imageToDelete._id]
        : program.deletedImageIds;

    setProgramAndRecalculate(prev => ({ ...prev, programImages: newImages, deletedImageIds: newDeletedIds }));
  };

  const handleSetMainImage = (imageToSet) => {
    const identifier = getUniqueIdentifier(imageToSet);
    const newImages = program.programImages.map(img => ({
        ...img,
        isMain: getUniqueIdentifier(img) === identifier
    }));
     handleValueChange('programImages', newImages);
  };

  const handleImageDragStart = (e, image) => {
    setDraggedImageIdentifier(getUniqueIdentifier(image));
  };

  const handleImageDrop = (e, targetImage) => {
    e.preventDefault();
    const targetIdentifier = getUniqueIdentifier(targetImage);
    if (!draggedImageIdentifier || draggedImageIdentifier === targetIdentifier) return;

    const newImages = [...program.programImages];
    const draggedIdx = newImages.findIndex(img => getUniqueIdentifier(img) === draggedImageIdentifier);
    const targetIdx = newImages.findIndex(img => getUniqueIdentifier(img) === targetIdentifier);
    
    const [draggedItem] = newImages.splice(draggedIdx, 1);
    newImages.splice(targetIdx, 0, draggedItem);
    
    handleValueChange('programImages', newImages);
  };

  const handleImageDragEnd = () => {
    setDraggedImageIdentifier(null);
  };

  
const handleTrailerUpdate = (uploadData) => {
    const { videoFile, trimStart, trimEnd, existingVideo, thumbnailFile } = uploadData;
    setShowTrailerEditor(false);

    if (!videoFile && existingVideo) {
        const trimmedDuration = trimEnd - trimStart;
        const updatedVideoData = {
            ...existingVideo,
            trimStart,
            trimEnd,
            duration: trimmedDuration,
            thumbnail: thumbnailFile ? URL.createObjectURL(thumbnailFile) : existingVideo.thumbnail
        };
        handleValueChange('trailerVideo', updatedVideoData);
        return;
    }

    if (videoFile) {
        const _tempId = `temp_${Date.now()}`;
        const optimisticThumbnailUrl = thumbnailFile ? URL.createObjectURL(thumbnailFile) : null;

        handleValueChange('trailerVideo', {
            fileName: videoFile.name,
            thumbnail: optimisticThumbnailUrl,
            status: 'uploading',
            progress: 0,
            _tempId
        });

        backgroundUploader({
            videoFile,
            thumbnailFile,
            _tempId,
            trimStart,
            trimEnd,
            getSignatureFunc: () => getUploadSignature({ uploadType: 'trailer' }),
            onProgress: (id, percent) => {
                setProgramAndRecalculate(currentProgram => {
                    if (currentProgram.trailerVideo?._tempId !== id) return currentProgram;
                    return {
                        ...currentProgram,
                        trailerVideo: { ...currentProgram.trailerVideo, progress: percent }
                    };
                });
            },
            onComplete: (id, finalVideoData) => {
                setProgramAndRecalculate(currentProgram => {
                    if (currentProgram.trailerVideo?._tempId !== id) return currentProgram;
                    return { ...currentProgram, trailerVideo: { ...finalVideoData, status: 'complete' } };
                });
            },
            onFailure: (id, errorMsg) => {
                logger.error('Error uploading program trailer', { error: errorMsg });
                toast.error(t('programs:error_uploading_trailer'));
                setProgramAndRecalculate(currentProgram => {
                    if (currentProgram.trailerVideo?._tempId !== id) return currentProgram;
                    return { ...currentProgram, trailerVideo: null };
                });
            },
        });
    }
};

  const removeTrailerVideo = (e) => {
    e.stopPropagation();
    handleValueChange('trailerVideo', null);
  };

  const handleDragEvents = (setter) => ({
    onDragEnter: (e) => { e.preventDefault(); e.stopPropagation(); setter(true); },
    onDragLeave: (e) => { e.preventDefault(); e.stopPropagation(); setter(false); },
    onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); setter(true); },
    onDrop: (e) => { 
        e.preventDefault(); e.stopPropagation(); setter(false);
        if (e.dataTransfer.files?.length > 0) {
            handleNewImages(e.dataTransfer.files);
        }
    },
  });

  const addOutcome = () => {
    if (newOutcomeText.trim()) {
      handleValueChange('learningOutcomes', [...(program.learningOutcomes || []), newOutcomeText.trim()]);
      setNewOutcomeText('');
    }
  };

  const handleOutcomeKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addOutcome();
    }
  };

  const removeOutcome = (index) => {
    const newOutcomes = program.learningOutcomes.filter((_, i) => i !== index);
    handleValueChange('learningOutcomes', newOutcomes);
  };

const handleDeleteProgram = () => {
    if (!program?._id) return;

    if (window.confirm(t('delete_program_confirmation', { title: program.title }))) {
        deleteProgramMutation.mutate(program._id, {
            onSuccess: () => {
                setIsOpen(false);
            },
        });
    }
  };


 const prepareSaveData = (programState) => {
   logger.info('[ProgramCreator] Preparing save data. Current program state:', { program: programState });
  const program = programState;
 const readyImages = program.programImages.filter(img => img.status === 'ready' || (!img.status && img.publicId));
    const newImageFiles = readyImages.filter(img => img.file).map(img => img.file);
    const finalImagesMetadata = readyImages.map(({ file, previewUrl, status, error, ...rest }) => rest);
  
    const processedModules = program.modules.map(module => ({
      ...module,
      lessons: module.lessons.map(lesson => {
        if (lesson.content?.quiz?.questions) {
          return {
            ...lesson,
            content: {
              ...lesson.content,
              quiz: {
                ...lesson.content.quiz,
                questions: lesson.content.quiz.questions.map(question => {
                  const processedQuestion = mongoose.Types.ObjectId.isValid(question._id)
                    ? question
                    : { ...question, _id: undefined };
                  return {
                    ...processedQuestion,
                    options: processedQuestion.options.map(option =>
                      mongoose.Types.ObjectId.isValid(option._id)
                        ? option
                        : { ...option, _id: undefined }
                    ),
                  };
                }),
              },
            },
          };
        }
        return lesson;
      }),
    }));
  
    const programData = {
      ...program,
      categories: program.categories?.map(c => c._id) || [],
      language: program.language?.map(lang => lang._id) || [],
      skillLevel: program.skillLevel?.map(level => level._id) || [],
      programImages: finalImagesMetadata,
      modules: processedModules,
    };
    delete programData.deletedImageIds;
  
   return {
      programData,
      newImageFiles,
      deletedImageIds: program.deletedImageIds || [],
    };
  };

  const nextZoomedImage = (e, mediaLength) => {
    e.stopPropagation();
    if (mediaLength > 1) {
      setZoomedImageIndex(prevIndex => (prevIndex + 1) % mediaLength);
    }
  };

  const prevZoomedImage = (e, mediaLength) => {
    e.stopPropagation();
    if (mediaLength > 1) {
      setZoomedImageIndex(prevIndex => (prevIndex - 1 + mediaLength) % mediaLength);
    }
  };
  
    // Calculate derived values for DurationInput components
    const calculatedProgramDurations = React.useMemo(() => {
        if (!program || !program.modules) return { content: 0, completion: 0 };
        return program.modules.reduce((acc, module) => {
            acc.content += module.contentDuration?.minutes || 0;
            acc.completion += module.estimatedCompletionTime?.minutes || 0;
            return acc;
        }, { content: 0, completion: 0 });
    }, [program?.modules]);

 if (!isOpen || !program) return null;

const allMedia = [...(program.programImages || [])];
  if (program.trailerVideo?.url) {
    allMedia.push({
      url: program.trailerVideo.url,
      _id: 'trailer-video',
      type: 'video',
      ...program.trailerVideo
    });
  }

  const isNewProgram = !program._id; 
  const isMutating = updateProgramMutation.isLoading || saveStatus === 'saving';
  const isDeleting = deleteProgramMutation.isLoading;
  const isProcessing = isMutating || isDeleting;

const SaveStatusIndicator = () => {
    let icon, tooltipTextKey, iconClass;

    if (saveStatus === 'saving') {
        icon = <Loader2 className="h-4 w-4 animate-spin" />;
        tooltipTextKey = 'common:saving';
        iconClass = 'text-muted-foreground';
    } else if (isDirty) {
        icon = <AlertCircle className="h-4 w-4" />;
        tooltipTextKey = 'common:unsavedChanges';
        iconClass = 'text-yellow-500';
    } else if (saveStatus === 'saved' && indicatorVisible) {
        icon = <CheckCircle className="h-4 w-4" />;
        tooltipTextKey = 'common:allChangesSaved';
        iconClass = 'text-green-500';
    } else if (saveStatus === 'error' && indicatorVisible) {
        icon = <AlertCircle className="h-4 w-4" />;
        tooltipTextKey = 'common:errorSaving';
        iconClass = 'text-destructive';
    } else {
        return null;
    }

    return (
        <TooltipProvider delayDuration={100}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className={`absolute top-3 right-24 z-10 p-1.5 rounded-full bg-background/50 backdrop-blur-sm transition-opacity duration-300 ${iconClass}`}>
                        {icon}
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{t(tooltipTextKey)}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
  };


  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
<DialogContent fullscreenable draggable resizable className="flex flex-col p-0 bg-background w-full h-full max-w-full rounded-none border-none md:w-[95vw] md:max-w-7xl md:h-[calc(100vh_-_(var(--app-header-height,72px)_+_6rem))] md:top-[calc(var(--app-header-height,72px)_+_2rem)] md:rounded-lg md:border group-data-[fullscreen=true]/dialog:md:h-[calc(100vh_-_var(--app-header-height,72px))] group-data-[fullscreen=true]/dialog:md:top-[var(--app-header-height,72px)]">
        <DialogHeader className="px-4 sm:px-6 py-4 border-b shrink-0 relative bg-background">
          <DialogTitle draggable>{t(programToEdit ? 'creator_edit_title' : 'creator_title')}</DialogTitle>
          <SaveStatusIndicator />
        </DialogHeader>

      

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-grow overflow-hidden">
         <div className="flex justify-between items-center px-4 sm:px-6 border-b bg-background">
            <TabsList className="bg-transparent p-0 -mb-px">
              <TabsTrigger value="details">{t('step_details')}</TabsTrigger>
              <TabsTrigger value="curriculum" disabled={isNewProgram}>{t('step_curriculum')}</TabsTrigger>
              <TabsTrigger value="pricing" disabled={isNewProgram}>{t('step_pricing')}</TabsTrigger>
            </TabsList>
            
            {!isNewProgram && (
              <div className="text-muted-foreground">
                {activeTab === 'curriculum' && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(`/learn/program/${program._id}?preview=true`, '_blank')}
                          aria-label={t('preview_player_aria')}
                           className="hover:text-primary hover:bg-accent"
                        >
                          <Eye className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('preview_player_tooltip')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {activeTab === 'pricing' && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(`/programs/${program._id}`, '_blank')}
                          aria-label={t('preview_landing_page_aria')}
                           className="hover:text-primary hover:bg-accent"
                        >
                          <Eye className="h-5 w-5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('preview_landing_page_tooltip')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}
          </div>
          
              <div className="flex-grow overflow-y-auto bg-muted/20 p-4 md:p-8 group-data-[fullscreen=true]/dialog:min-h-0 group-data-[fullscreen=true]/dialog:!max-h-none">
            <TabsContent value="details" className="m-0 p-0">
               <div className="max-w-7xl mx-auto">
                <div className="bg-card p-6 rounded-lg border shadow-sm">
                  <div className="space-y-8">
                    
<>
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
        <div className="space-y-2 lg:col-span-3">
            <div className="flex justify-between items-baseline">
                <Label htmlFor="programImageInput">{t('field_program_images_label')}</Label>
                <span className="text-sm font-medium text-muted-foreground">
                    {t('image_upload_limit_hint', { count: program.programImages.length, max: MAX_IMAGES })}
                </span>
            </div>
            <div
                className={`relative flex flex-wrap content-start items-start gap-4 p-4 rounded-lg border-2 border-dashed bg-muted/20 min-h-[238px] lg:h-full lg:min-h-0 overflow-y-auto ${isDraggingImages ? 'border-primary bg-primary/10' : ''}`}
                {...handleDragEvents(setIsDraggingImages)}
            >
                {program.programImages.length < MAX_IMAGES && (
    <TooltipProvider>
        <Tooltip>
            <TooltipTrigger asChild>
            <button
                type="button"
                className="group relative w-28 h-28 rounded-md border-2 border-dashed border-border flex items-center justify-center text-muted-foreground cursor-pointer transition-all bg-muted/50 shrink-0 overflow-hidden hover:border-primary hover:text-primary hover:bg-primary/10 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-muted/50 disabled:hover:text-muted-foreground"
                onClick={() => document.getElementById('programImageInput')?.click()}
                aria-label={t('managesessions:addImages')}
                disabled={program.programImages.length >= MAX_IMAGES}
            >
                <ImageIcon size={32} className="text-muted-foreground/80 transition-colors duration-200 group-hover:text-primary" />
                <UploadCloud size={18} className="absolute bottom-2 right-2 text-muted-foreground bg-background p-0.5 rounded-full transition-all shadow-[0_0_0_2px_var(--background)] group-hover:text-primary group-hover:bg-accent group-hover:shadow-[0_0_0_2px_hsl(var(--accent))] group-hover:scale-110" />
            </button>
            </TooltipTrigger>
            <TooltipContent><p>{t('managesessions:addImages')}</p></TooltipContent>
        </Tooltip>
    </TooltipProvider>
)}
                {program.programImages.map((image, index) => (
                    <div
                        key={getUniqueIdentifier(image)}
                        className={`group relative w-28 h-28 aspect-square rounded-md overflow-hidden bg-muted/50 border cursor-pointer transition-all z-[1] shrink-0 hover:scale-110 hover:-translate-y-1 hover:shadow-2xl hover:z-10 hover:border-primary/50 ${image.isMain ? 'border-2 border-primary ring-2 ring-offset-2 ring-primary ring-offset-background' : 'border-border'} ${draggedImageIdentifier === getUniqueIdentifier(image) ? 'opacity-50 scale-95 cursor-grabbing shadow-lg z-20' : ''}`}
                        draggable onDragStart={(e) => handleImageDragStart(e, image)} onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleImageDrop(e, image)} onDragEnd={handleImageDragEnd}
                        onClick={(e) => { e.stopPropagation(); setZoomedImageIndex(index); }}
                    >
                         <img src={image.previewUrl || image.url} alt={t('image_preview')} className="block w-full h-full object-contain" draggable={false} />
                        {image.status === 'error' && (
                          <div className="absolute inset-0 bg-destructive/80 flex items-center justify-center">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger><AlertCircle className="w-6 h-6 text-destructive-foreground" /></TooltipTrigger>
                                <TooltipContent><p>{image.error || t('image_upload_failed')}</p></TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        )}
                        <div className="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteImage(image); }} className="bg-background/80 backdrop-blur-sm text-foreground border-none rounded-full w-8 h-8 flex items-center justify-center cursor-pointer transition-all shadow-md hover:scale-110 hover:bg-destructive hover:text-destructive-foreground" aria-label={t('managesessions:removeImage')}><Trash2 size={16} /></button>
                                </TooltipTrigger>
                                <TooltipContent><p>{t('managesessions:removeImage')}</p></TooltipContent>
                            </Tooltip>
                            </TooltipProvider>
                            {!image.isMain && image.status !== 'error' && (
                            <TooltipProvider>
                                <Tooltip>
                                <TooltipTrigger asChild>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); handleSetMainImage(image); }} className="bg-background/80 backdrop-blur-sm text-foreground border-none rounded-full w-8 h-8 flex items-center justify-center cursor-pointer transition-all shadow-md hover:scale-110 hover:bg-primary hover:text-primary-foreground" aria-label={t('managesessions:setAsMainImage')}><Star size={16} /></button>
                                </TooltipTrigger>
                                <TooltipContent><p>{t('managesessions:setAsTitleImageTooltip')}</p></TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            )}
                        </div>
                        {image.isMain && image.status !== 'error' && (
                            <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                <div className="absolute top-1 left-1 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center shadow-lg z-[5] "><Star size={16} fill="currentColor" /></div>
                                </TooltipTrigger>
                                <TooltipContent><p>{t('managesessions:currentTitleImageTooltip')}</p></TooltipContent>
                            </Tooltip>
                            </TooltipProvider>
                        )}
                    </div>
                ))}
            </div>
        </div>

<div className="space-y-2 lg:col-span-2">
    <div className="flex items-center gap-1.5">
        <Label htmlFor="trailerVideoInput">{t('field_trailer_video_label')}</Label>
    </div>
     {program.trailerVideo?.status === 'uploading' ? (
        <div className="relative w-full aspect-video rounded-lg bg-black">
            <img src={program.trailerVideo.thumbnail} alt="Uploading trailer" className="absolute inset-0 w-full h-full object-cover rounded-lg opacity-30 blur-sm" />
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/70 p-4">
                <Progress value={program.trailerVideo.progress} variant="on-dark" className="h-1.5 w-full max-w-xs bg-white/30" />
            </div>
        </div>
    ) : (!program.trailerVideo) ? (
        <div 
            className="flex flex-col items-center justify-center aspect-video border-2 border-dashed border-border rounded-lg bg-muted/50 cursor-pointer p-4 transition-all text-muted-foreground hover:border-primary hover:bg-primary/10 hover:text-primary"
            onClick={() => setShowTrailerEditor(true)}
        >
            <Video className="w-10 h-10" />
            <span className="font-semibold text-center mt-2">{t('upload_trailer_cta')}</span>
        </div>
    ) : (
        <div className="group relative aspect-video rounded-lg overflow-hidden bg-black border border-border">
            <CustomVideoPlayer 
                videoFile={program.trailerVideo}
            />
            <div className="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                <TooltipProvider>
                    <Tooltip>
                    <TooltipTrigger asChild>
                            <button type="button" onClick={() => setShowTrailerEditor(true)} className="bg-background/80 backdrop-blur-sm text-foreground border-none rounded-full w-8 h-8 flex items-center justify-center cursor-pointer transition-all shadow-md hover:scale-110 hover:bg-primary hover:text-primary-foreground" aria-label={t('common:edit')}>
                            <Scissors size={16} />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent><p>{t('common:edit')}</p></TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                    <Tooltip>
                    <TooltipTrigger asChild>
                        <button type="button" onClick={removeTrailerVideo} className="bg-background/80 backdrop-blur-sm text-foreground border-none rounded-full w-8 h-8 flex items-center justify-center cursor-pointer transition-all shadow-md hover:scale-110 hover:bg-destructive hover:text-destructive-foreground" aria-label={t('common:remove')}>
                            <Trash2 size={16} />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent><p>{t('common:remove')}</p></TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
        </div>
    )}
</div>
     </div>
    
    <input type="file" id="programImageInput" name="programImages_new" multiple accept="image/*" onChange={(e) => handleNewImages(e.target.files)} className="hidden" />

    <div className="my-8 border-t" />

     <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        <div className="space-y-2">
            <Label htmlFor="title">{t('field_title_label')}</Label>
            <Input id="title" name="title" value={program.title || ''} onChange={(e) => handleValueChange('title', e.target.value)} placeholder={t('field_title_placeholder')} />
        </div>
        <div className="space-y-2">
            <Label htmlFor="subtitle">{t('field_subtitle_label')}</Label>
            <Input id="subtitle" name="subtitle" value={program.subtitle || ''} onChange={(e) => handleValueChange('subtitle', e.target.value)} placeholder={t('field_subtitle_placeholder')} />
        </div>
        <div className="space-y-2">
            <Label htmlFor="category">{t('field_category_label')}</Label>
            <SearchableListSelector
                listType="programCategories"
                selectedItems={program.categories || []}
                onUpdate={handleCategoriesUpdate}
                placeholder={t('select_category_placeholder')}
                isMulti
            />
        </div>
        <div className="space-y-2">
            <Label htmlFor="language">{t('language', { ns: 'common' })}</Label>
           <SearchableListSelector
                listType="languages"
                selectedItems={program.language || []}
                onUpdate={handleLanguagesUpdate}
                placeholder={t('select_language_placeholder', { ns: 'common' })}
                isMulti
                showLanguageLevels={false}
            />
        </div>
        
        <div className="space-y-2">
            <Label htmlFor="skillLevel">{t('skill_level', { ns: 'programs' })}</Label>
            <SearchableListSelector
                listType="skillLevels"
                selectedItems={program.skillLevel || []}
                onUpdate={handleSkillLevelsUpdate}
                placeholder={t('select_skill_level_placeholder', { ns: 'programs' })}
                isMulti
            />
        </div>
       <div className="space-y-2">
          <Label>{t('field_outcomes_label')}</Label>
           <div className="relative mt-6">
            <div className="relative mt-4">
                <Input
                    value={newOutcomeText}
                    onChange={(e) => setNewOutcomeText(e.target.value)}
                    onKeyDown={handleOutcomeKeyDown}
                    placeholder={t('field_outcomes_placeholder')}
                    className="pr-12"
                />
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={addOutcome}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-primary"
                    aria-label={t('common:add')}
                >
                    <PlusCircle className="h-5 w-5" />
                </Button>
            </div>
            {program.learningOutcomes?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-5">
              {program.learningOutcomes.map((outcome, index) =>
                  outcome && (
                      <Badge variant="secondary" key={index} className="flex items-center gap-1.5 py-1 px-3 text-xs font-medium border-transparent bg-primary/10 text-primary animate-tagIn">
                          <span>{outcome}</span>
                          <button
                              type="button"
                              onClick={() => removeOutcome(index)}
                              className="rounded-full flex items-center justify-center w-4 h-4 text-primary/70 hover:bg-primary/20 focus:outline-none transition-colors"
                              aria-label={t('common:remove')}
                          >
                              <X size={12} />
                          </button>
                      </Badge>
                  )
              )}
              </div>
            )}
          </div>
        </div>
        
         <div className="space-y-2 md:col-span-2">
          <Label htmlFor="description">{t('field_description_label')}</Label>
          <Textarea id="description" name="description" value={program.description || ''} onChange={(e) => handleValueChange('description', e.target.value)} placeholder={t('field_description_placeholder')} rows={5} />
        </div>
    </div>
</>
                    <div className="mt-8 pt-8 border-t border-border/80">
                      <h3 className="text-lg font-semibold mb-1">{t('duration_override_title', {ns: 'programs'})}</h3>
                      <p className="text-sm text-muted-foreground mb-6">{t('duration_override_desc', {ns: 'programs'})}</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        <DurationInput
                          label={t('label_content_length', { ns: 'programs' })}
                          tooltipText={t('tooltip_program_content_length', { ns: 'programs' })}
                          calculatedMinutes={calculatedProgramDurations.content}
                          userMinutes={program.contentDuration?.minutes}
                          isOverridden={program.contentDuration?.isOverridden}
                          onUpdate={(mins, isOverridden) => handleDurationUpdate('content', mins, isOverridden)}
                        />
                        <DurationInput
                          label={t('label_time_to_complete', { ns: 'programs' })}
                          tooltipText={t('tooltip_program_time_to_complete', { ns: 'programs' })}
                          calculatedMinutes={calculatedProgramDurations.completion}
                          userMinutes={program.estimatedCompletionTime?.minutes}
                          isOverridden={program.estimatedCompletionTime?.isOverridden}
                          onUpdate={(mins, isOverridden) => handleDurationUpdate('completion', mins, isOverridden)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="curriculum" className="m-0 p-0 h-full">
              <CurriculumBuilder program={program} setProgram={setProgramAndRecalculate} />
            </TabsContent>
            <TabsContent value="pricing" className="m-0 p-0">
              <div className="max-w-4xl mx-auto">
                <PricingAndPublishForm
                    price={program.basePrice}
                    status={program.status}
                    discount={program.discount}
                    isDiscussionEnabled={program.isDiscussionEnabled}
                    onPriceChange={handlePriceChange}
                    onStatusChange={(status) => handleValueChange('status', status)}
                    onDiscountChange={handleDiscountChange}
                    onDiscussionEnabledChange={(checked) => handleValueChange('isDiscussionEnabled', checked)}
                    programId={program._id}
                />
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {showTrailerEditor && (
           <>
          {logger.info('[ProgramCreator] 3. Rendering VideoEditorModal. Passing existingVideo prop:', { existingVideo: program.trailerVideo })}
        <VideoEditorModal
        onUpload={handleTrailerUpdate}
        onClose={() => setShowTrailerEditor(false)}
        existingVideo={program.trailerVideo}
        getSignatureFunc={() => getUploadSignature({ uploadType: 'trailer' })}
    />
        </>
      )}

{zoomedImageIndex !== null && allMedia.length > 0 && (
    <div
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      onClick={() => setZoomedImageIndex(null)}
    >
      <div
        className="relative flex h-full w-full max-w-7xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex flex-1 items-center justify-center min-h-0">
          {(() => {
            const currentMedia = allMedia[zoomedImageIndex];
            if (!currentMedia) return null;

             if (currentMedia.type === 'video') {
              return (
                 <div className="flex h-full w-full max-w-full max-h-full items-center justify-center">
                    <CustomVideoPlayer
                      videoFile={currentMedia}
                    />
                 </div>
              );
            }
            return (
              <img
                src={currentMedia.previewUrl || currentMedia.url}
                alt={`${t('image_preview')} ${zoomedImageIndex + 1}`}
                className="block max-h-full max-w-full rounded-sm object-contain shadow-2xl"
              />
            );
          })()}
        </div>
        <div className="flex shrink-0 items-center justify-center gap-4 p-4">
          <button
            className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-all hover:not-disabled:scale-105 hover:not-disabled:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={(e) => prevZoomedImage(e, allMedia.length)}
            disabled={allMedia.length <= 1}
            aria-label={t('common:previous')}
          >
            <ChevronLeftIcon size={24} />
          </button>
          <span className="min-w-[3rem] text-center text-base text-white/95">
            {zoomedImageIndex + 1} / {allMedia.length}
          </span>
          <button
            className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-all hover:not-disabled:scale-105 hover:not-disabled:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={(e) => nextZoomedImage(e, allMedia.length)}
            disabled={allMedia.length <= 1}
            aria-label={t('common:next')}
          >
            <ChevronRightIcon size={24} />
          </button>
           <button
              className="ml-4 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-destructive/70 text-destructive-foreground transition-all hover:not-disabled:scale-105 hover:not-disabled:bg-destructive disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setZoomedImageIndex(null)}
              aria-label={t('common:close')}
            >
              <X size={24} />
          </button>
        </div>
      </div>
    </div>
  )}
        
        <DialogFooter className="flex shrink-0 justify-end gap-3 border-t bg-background p-4 sm:px-6">
          {program?._id && (
            <Button variant="delete-outline" onClick={handleDeleteProgram} disabled={isProcessing} className="mr-auto">
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {t('common:delete')}
            </Button>
          )}
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isProcessing}>{t('common:close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProgramCreator;