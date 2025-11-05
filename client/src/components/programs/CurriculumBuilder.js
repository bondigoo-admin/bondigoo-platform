import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog.tsx';
import { useAddLessonToModule, useUpdateLesson } from '../../hooks/usePrograms';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Plus, PlusCircle, BookOpen, Edit } from 'lucide-react';
import { cn } from '../../lib/utils';
import ModuleItem from './ModuleItem';
import LessonItem from './LessonItem';
import LessonPreview from './LessonPreview';
import LessonEditor from './LessonEditor';
import LessonTypeSelector from './LessonTypeSelector';
import { v4 as uuidv4 } from 'uuid';

const CurriculumBuilder = ({ program, setProgram }) => {
  const { t } = useTranslation(['programs', 'common']);
  const addLessonMutation = useAddLessonToModule();
  const updateLessonMutation = useUpdateLesson();
  const curriculum = program?.modules || [];
  
  const [activeModuleId, setActiveModuleId] = useState(null);
  const [selectedLessonId, setSelectedLessonId] = useState(null);
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [editingLesson, setEditingLesson] = useState(null);
  const [isTypeSelectorOpen, setIsTypeSelectorOpen] = useState(false);
  const [startEditorFullscreen, setStartEditorFullscreen] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [draggedLessonSourceModule, setDraggedLessonSourceModule] = useState(null);
  const [overId, setOverId] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState({ isOpen: false, item: null, type: null });

  useEffect(() => {
    if (!activeModuleId && curriculum.length > 0) {
      setActiveModuleId(curriculum[0]._id);
    }
    if (activeModuleId && !curriculum.some(m => m._id === activeModuleId)) {
        setActiveModuleId(curriculum[0]?._id || null);
    }
  }, [curriculum, activeModuleId]);

  useEffect(() => {
    setSelectedLessonId(null);
  }, [activeModuleId]);


  const setCurriculum = (newModules) => {
    setProgram(prevProgram => ({ ...prevProgram, modules: newModules }));
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeModule = curriculum.find(m => m._id === activeModuleId);
  const activeLessons = activeModule?.lessons || [];
  const selectedLesson = activeLessons.find(l => l._id === selectedLessonId);
  const isLessonDropZone = draggedItem?.type === 'lesson' && draggedLessonSourceModule && draggedLessonSourceModule !== activeModuleId;

  const handleAddModule = () => {
    if (!newModuleTitle.trim()) return;
    const newModule = {
      _id: uuidv4(),
      title: newModuleTitle.trim(),
      lessons: [],
      isGated: false,
    };
    const newCurriculum = [...curriculum, newModule];
    setCurriculum(newCurriculum);
    setNewModuleTitle('');
    setActiveModuleId(newModule._id);
  };

  const handleUpdateModule = useCallback((moduleId, updateData) => {
    setProgram(prevProgram => ({
      ...prevProgram,
      modules: prevProgram.modules.map(m => m._id === moduleId ? { ...m, ...updateData } : m)
    }));
  }, [setProgram]);

  const handleDeleteModule = useCallback((moduleId) => {
    const moduleToDelete = program?.modules.find(m => m._id === moduleId);
    if (moduleToDelete) {
      setDeleteConfirmation({ isOpen: true, item: moduleToDelete, type: 'module' });
    }
  }, [program?.modules]);

  const handleNewModuleKeyDown = (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleAddModule();
    }
  };

  const handleAddLessonClick = () => {
    if (!activeModuleId) return;
    setIsTypeSelectorOpen(true);
  };
  
  const handleLessonTypeSelect = (contentType) => {
      const moduleIndex = curriculum.findIndex(m => m._id === activeModuleId);
      const newLessonIndex = (activeModule?.lessons?.length || 0) + 1;
      const newTitle = `${t('lesson', { ns: 'programs' })} ${moduleIndex + 1}-${newLessonIndex}`;
      setEditingLesson({ contentType, title: newTitle, content: {} });
  };

  const handleSelectLesson = (lessonId) => {
    setSelectedLessonId(lessonId);
  };
  
  const handleBackToLessonList = () => {
    setSelectedLessonId(null);
  };

  const handleGoBackToTypeSelector = () => {
      setEditingLesson(null);
      setIsTypeSelectorOpen(true);
  };

  const handleDeleteLesson = (lessonId) => {
    const lessonToDelete = activeModule?.lessons.find(l => l._id === lessonId);
    if (lessonToDelete) {
      setDeleteConfirmation({ isOpen: true, item: lessonToDelete, type: 'lesson' });
    }
  };

  const handleConfirmDelete = () => {
    if (!deleteConfirmation.item || !deleteConfirmation.type) return;

    if (deleteConfirmation.type === 'module') {
      setProgram(prevProgram => ({
        ...prevProgram,
        modules: prevProgram.modules.filter(m => m._id !== deleteConfirmation.item._id)
      }));
    }

    if (deleteConfirmation.type === 'lesson') {
      const newCurriculum = curriculum.map(m => {
        if (m._id === activeModuleId) {
          return { ...m, lessons: m.lessons.filter(l => l._id !== deleteConfirmation.item._id) };
        }
        return m;
      });
      setCurriculum(newCurriculum);
      if (selectedLessonId === deleteConfirmation.item._id) {
        setSelectedLessonId(null);
      }
    }

    setDeleteConfirmation({ isOpen: false, item: null, type: null });
  };
  
  const handleCancelDelete = () => {
    setDeleteConfirmation({ isOpen: false, item: null, type: null });
  };

  const handleSaveLesson = (lessonData) => {
    console.log('[CurriculumBuilder:handleSaveLesson] DEBUG: Received lesson data to save:', JSON.stringify(lessonData));
    const newModules = curriculum.map(module => {
        if (module._id === activeModuleId) {
            console.log(`[CurriculumBuilder:handleSaveLesson] DEBUG: Found active module '${module.title}'`);
            const isEditing = !!lessonData._id && module.lessons.some(l => l._id === lessonData._id);
            let newLessons;

            if (isEditing) {
                console.log(`[CurriculumBuilder:handleSaveLesson] DEBUG: Updating existing lesson '${lessonData.title}'`);
                newLessons = module.lessons.map(l => l._id === lessonData._id ? lessonData : l);
            } else {
                const newLessonWithId = { ...lessonData, _id: uuidv4() };
                console.log(`[CurriculumBuilder:handleSaveLesson] DEBUG: Creating new lesson '${newLessonWithId.title}' with temp ID ${newLessonWithId._id}`);
                newLessons = [...module.lessons, newLessonWithId];
                setSelectedLessonId(newLessonWithId._id);
            }
            return { ...module, lessons: newLessons };
        }
        return module;
    });
    console.log('[CurriculumBuilder:handleSaveLesson] DEBUG: Calling setProgram with updated modules.');
    setProgram(prevProgram => ({ ...prevProgram, modules: newModules }));
    setEditingLesson(null);
  };

  const handleEditLessonClick = (lesson, startFullscreen = false) => {
    setEditingLesson(lesson);
    setStartEditorFullscreen(startFullscreen);
  };

 const handleDragOver = (event) => {
    const { active, over } = event;
    setOverId(over ? over.id : null);
    if (!over || active.id === over.id) return;

    const isActiveALesson = active.data.current?.type === 'lesson';
    if (!isActiveALesson) return;

    const sourceModuleId = active.data.current.moduleId;
    
    const isOverAModule = over.data.current?.type === 'module';
    const isOverALesson = over.data.current?.type === 'lesson';

    if (isOverAModule || isOverALesson) {
      const targetModuleId = isOverAModule ? over.id : over.data.current.moduleId;
      if (sourceModuleId !== targetModuleId) {
        setActiveModuleId(targetModuleId);
      }
    }
  };

const handleDragStart = (event) => {
    const { active } = event;
    const type = active.data.current?.type;

    if (type === 'module') {
        const module = curriculum.find(m => m._id === active.id);
        if (module) setDraggedItem({ type: 'module', item: module });
    } else if (type === 'lesson') {
        const moduleId = active.data.current.moduleId;
        setDraggedLessonSourceModule(moduleId);
        const module = curriculum.find(m => m._id === moduleId);
        const lesson = module?.lessons.find(l => l._id === active.id);
        if (lesson) setDraggedItem({ type: 'lesson', item: lesson });
    }
  };
  
const handleDragEnd = (event) => {
    setOverId(null);
    setDraggedItem(null);
    const sourceModuleIdFromState = draggedLessonSourceModule;
    setDraggedLessonSourceModule(null);

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const isModuleDrag = active.data.current?.type === 'module';
    if (isModuleDrag) {
      if (over.data.current?.type === 'module') {
        const oldIndex = curriculum.findIndex(m => m._id === active.id);
        const newIndex = curriculum.findIndex(m => m._id === over.id);
        setCurriculum(arrayMove(curriculum, oldIndex, newIndex));
      }
      return;
    }

    const isLessonDrag = active.data.current?.type === 'lesson' || sourceModuleIdFromState;
    if (isLessonDrag) {
      const sourceModuleId = active.data.current.moduleId || sourceModuleIdFromState;

      const overData = over.data.current;
      
      const targetModuleId = overData?.type === 'lesson' 
        ? overData.moduleId 
        : overData?.type === 'module' ? over.id : null;

      if (!targetModuleId) return;

      if (sourceModuleId === targetModuleId) {
        const module = curriculum.find(m => m._id === sourceModuleId);
        if (!module) return;
        const oldIndex = module.lessons.findIndex(l => l._id === active.id);
        const newIndex = module.lessons.findIndex(l => l._id === over.id);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reorderedLessons = arrayMove(module.lessons, oldIndex, newIndex);
          setCurriculum(curriculum.map(m => 
            m._id === sourceModuleId ? { ...m, lessons: reorderedLessons } : m
          ));
        }
      } else {
        const sourceModule = curriculum.find(m => m._id === sourceModuleId);
        const targetModule = curriculum.find(m => m._id === targetModuleId);
        const lesson = sourceModule?.lessons.find(l => l._id === active.id);
        if (!sourceModule || !targetModule || !lesson) return;
        
        const newSourceLessons = sourceModule.lessons.filter(l => l._id !== active.id);
        
        const overIsLesson = overData?.type === 'lesson';
        const targetLessonIndex = overIsLesson
          ? targetModule.lessons.findIndex(l => l._id === over.id)
          : targetModule.lessons.length;
          
        const newTargetLessons = [
          ...targetModule.lessons.slice(0, targetLessonIndex),
          lesson,
          ...targetModule.lessons.slice(targetLessonIndex)
        ];

        setCurriculum(curriculum.map(m => {
          if (m._id === sourceModuleId) return { ...m, lessons: newSourceLessons };
          if (m._id === targetModuleId) return { ...m, lessons: newTargetLessons };
          return m;
        }));
      }
    }
  };

    const handleDragCancel = () => {
    setDraggedItem(null);
    setDraggedLessonSourceModule(null);
    setOverId(null);
  };

return (
    <>
       <div className="grid h-full grid-cols-1 gap-6 lg:grid-cols-[minmax(320px,_1.2fr)_2fr]">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="flex h-full flex-col gap-4 overflow-hidden rounded-lg border bg-card p-5">
            <div className="flex flex-shrink-0 items-center justify-between">
                <h3 className="text-lg font-semibold">{t('modules')}</h3>
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <Input
                value={newModuleTitle}
                onChange={(e) => setNewModuleTitle(e.target.value)}
                onKeyDown={handleNewModuleKeyDown}
                placeholder={t('new_module_title_placeholder')}
              />
              <Button size="icon" variant="outline" onClick={handleAddModule} disabled={!newModuleTitle.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="-mx-2 flex flex-grow flex-col gap-2 overflow-y-auto px-2">
              <SortableContext items={curriculum.map(m => ({...m, id: m._id}))} strategy={verticalListSortingStrategy}>
                {curriculum.map(module => (
                  <ModuleItem
                    key={module._id}
                    module={module}
                    isActive={activeModuleId === module._id}
                    onClick={setActiveModuleId}
                    onDelete={handleDeleteModule}
                    onUpdate={handleUpdateModule}
                  />
                ))}
             </SortableContext>
            </div>
          </div>

          <div className={cn(
            "flex h-full flex-col gap-4 overflow-hidden rounded-lg border bg-card p-5 transition-all duration-200",
            isLessonDropZone && "border-indigo-400 bg-primary/20 dark:border-indigo-500 dark:bg-primary/20"
          )}>
            {selectedLesson ? (
              <LessonPreview
                  lesson={selectedLesson}
                  onBack={() => setSelectedLessonId(null)}
                  onEdit={handleEditLessonClick}
                  onUpdateLesson={handleSaveLesson}
              />
            ) : (
              <>
                <div className="flex flex-shrink-0 items-center justify-between">
                    <h3 className="truncate pr-4 text-lg font-semibold">{activeModule ? activeModule.title : t('lessons')}</h3>
                    <Button size="sm" variant="outline" onClick={handleAddLessonClick} disabled={!activeModuleId}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        {t('add_lesson')}
                    </Button>
                </div>
                
                <div className="-mx-2 flex flex-grow flex-col gap-2 overflow-y-auto px-2">
                  {activeModuleId && activeModule ? (
                    <SortableContext items={activeLessons.map(l => ({...l, id: l._id}))} strategy={verticalListSortingStrategy}>
                      {activeLessons.map(lesson => (
                        <LessonItem 
                            key={lesson._id} 
                            lesson={lesson}
                            moduleId={activeModuleId}
                            onSelect={() => handleSelectLesson(lesson._id)}
                            onEdit={() => handleEditLessonClick(lesson)}
                            onDelete={() => handleDeleteLesson(lesson._id)}
                            overId={overId}
                        />
                      ))}
                    </SortableContext>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/50 p-8 text-center text-muted-foreground">
                        <BookOpen className="mb-4 h-14 w-14 text-slate-400 dark:text-slate-500" />
                        <h4 className="mb-1 text-lg font-semibold text-card-foreground">{t('select_module_prompt_title')}</h4>
                        <p className="text-sm">{t('select_module_prompt_text')}</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
      {draggedItem && (
          <DragOverlay dropAnimation={null}>
            {draggedItem?.type === 'module' && (
              <ModuleItem module={draggedItem.item} isDragging />
            )}
            {draggedItem?.type === 'lesson' && (
              <LessonItem lesson={draggedItem.item} isDragging />
            )}
          </DragOverlay>
        )}
        </DndContext>
      </div>
      
      <LessonTypeSelector 
        isOpen={isTypeSelectorOpen}
        setIsOpen={setIsTypeSelectorOpen}
        onSelect={handleLessonTypeSelect}
      />

      {editingLesson && (
        <LessonEditor
            isOpen={!!editingLesson}
            setIsOpen={() => setEditingLesson(null)}
            lessonData={editingLesson}
            onSave={handleSaveLesson}
            startInFullscreen={startEditorFullscreen}
        />
      )}

      <AlertDialog open={deleteConfirmation.isOpen} onOpenChange={(isOpen) => !isOpen && handleCancelDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirmation.type === 'module'
                ? t('delete_module_title', 'Delete Module?')
                : t('delete_lesson_title', 'Delete Lesson?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete_confirmation_message', {
                type: deleteConfirmation.type === 'module' ? t('common:module') : t('common:lesson'),
                title: deleteConfirmation.item?.title || ''
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} variant="delete">
              {t('common:delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CurriculumBuilder;