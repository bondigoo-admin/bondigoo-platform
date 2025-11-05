import React, { useMemo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { kpiDefinitions } from './widgets/widgetDefinitions';
import { DropdownMenuLabel, DropdownMenuContent } from '../../ui/dropdown-menu.tsx';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import SortableKpiItem from './widgets/SortableKpiItem';

const KpiGridSettings = ({ settings, onSettingsChange }) => {
  const { t } = useTranslation('coach_dashboard');
  
  // Initialize local state for all KPIs, respecting saved order and visibility
  const [kpiConfig, setKpiConfig] = useState(() => {
    const savedConfig = settings?.kpiConfig || [];
    const savedKeys = new Set(savedConfig.map(k => k.key));
    const newKpis = kpiDefinitions
      .filter(def => !savedKeys.has(def.key))
      .map(def => ({ key: def.key, enabled: true }));
    return [...savedConfig, ...newKpis];
  });
  
  // Memoize the keys for dnd-kit
  const kpiKeys = useMemo(() => kpiConfig.map(k => k.key), [kpiConfig]);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = kpiKeys.indexOf(active.id);
      const newIndex = kpiKeys.indexOf(over.id);
      const newOrder = arrayMove(kpiConfig, oldIndex, newIndex);
      setKpiConfig(newOrder);
      onSettingsChange({ ...settings, kpiConfig: newOrder });
    }
  };

  const handleToggle = (key, enabled) => {
    const newConfig = kpiConfig.map(kpi => 
      kpi.key === key ? { ...kpi, enabled } : kpi
    );
    setKpiConfig(newConfig);
    onSettingsChange({ ...settings, kpiConfig: newConfig });
  };

  return (
    <div onSelect={(e) => e.preventDefault()}>
      <DropdownMenuLabel className="px-3">{t('kpis.settingsTitle', 'Visible Metrics')}</DropdownMenuLabel>
      <div className="p-1">
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={kpiKeys} strategy={verticalListSortingStrategy}>
            {kpiConfig.map((kpi) => (
              <SortableKpiItem
                key={kpi.key}
                id={kpi.key}
                name={t(kpiDefinitions.find(def => def.key === kpi.key)?.titleKey)}
                enabled={kpi.enabled}
                onToggle={handleToggle}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
};

export default KpiGridSettings;