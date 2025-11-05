import React, { useMemo } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '../../ui/sheet.jsx';
import { Button } from '../../ui/button.tsx';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useTranslation } from 'react-i18next';
import SortableWidgetItem from './SortableWidgetItem';

const DashboardCustomizationSheet = ({ isOpen, setIsOpen, config, setConfig, onReset, isSaving, widgetRegistry }) => {
  const { t } = useTranslation(['coach_dashboard', 'common']);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = config.findIndex((item) => item.key === active.id);
      const newIndex = config.findIndex((item) => item.key === over.id);
      setConfig(arrayMove(config, oldIndex, newIndex));
    }
  };

  const handleToggle = (key, enabled) => {
    const newConfig = config.map((item) =>
      item.key === key ? { ...item, enabled } : item
    );
    setConfig(newConfig);
  };

  const handleSettingsChange = (key, newSettings) => {
    const newConfig = config.map((item) =>
      item.key === key ? { ...item, settings: newSettings } : item
    );
    setConfig(newConfig);
  };

  const handleSizeChange = (key, newSize) => {
    const newConfig = config.map((item) =>
      item.key === key ? { ...item, size: newSize } : item
    );
    setConfig(newConfig);
  };

  const handleInteractOutside = (event) => {
    const target = event.target;
    if (target.closest('[data-radix-popper-content-wrapper]')) {
      event.preventDefault();
    }
  };

  const allWidgetKeys = Object.keys(widgetRegistry);
  const configMap = useMemo(() => new Map(config.map(item => [item.key, item])), [config]);

  const combinedConfigForDisplay = useMemo(() => {
    const displayedKeys = new Set();

    const sortedFromConfig = config.map(item => {
      displayedKeys.add(item.key);
      return item;
    });

    const remainingWidgets = allWidgetKeys
      .filter(key => !displayedKeys.has(key))
      .map(key => ({
        key,
        enabled: false,
        settings: widgetRegistry[key].defaultSettings || {},
      }));

    return [...sortedFromConfig, ...remainingWidgets];
  }, [config, allWidgetKeys, widgetRegistry]);

  const sortableItemKeys = useMemo(() => combinedConfigForDisplay.map(c => c.key), [combinedConfigForDisplay]);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent
        className="flex flex-col sm:max-w-md"
        onInteractOutside={handleInteractOutside}
      >
        <SheetHeader>
          <SheetTitle>{t('customization.title', 'Customize Dashboard')}</SheetTitle>
          <SheetDescription>{t('customization.description', 'Drag to reorder and toggle widget visibility.')}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto pr-4 -mr-4 py-4">
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sortableItemKeys} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {combinedConfigForDisplay.map((item) => {
                   const widgetDef = widgetRegistry[item.key];
                   if (!widgetDef) return null;
                   
                   const currentItemState = configMap.get(item.key) || item;

                   return (
                     <SortableWidgetItem
                       key={item.key}
                       id={item.key}
                       name={t(widgetDef.nameKey, widgetDef.defaultName)}
                       enabled={currentItemState.enabled}
                       onToggle={handleToggle}
                       settings={currentItemState.settings}
                       onSettingsChange={(newSettings) => handleSettingsChange(item.key, newSettings)}
                       SettingsComponent={widgetDef.settingsComponent}
                       size={currentItemState.size || widgetDef.defaultSize}
                       availableSizes={widgetDef.availableSizes}
                       onSizeChange={handleSizeChange}
                     />
                   );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
        <SheetFooter className="mt-auto pt-4 border-t gap-2 sm:justify-start">
          <Button variant="outline" onClick={onReset} disabled={isSaving}>
            {t('customization.reset', 'Reset to Default')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default DashboardCustomizationSheet;