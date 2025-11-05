import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { adminKpiDefinitions } from '../../dashboard/adminKpiConstants';
import { DropdownMenuLabel } from '../../../ui/dropdown-menu.tsx';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import SortableKpiItem from '../../../dashboard/overview/widgets/SortableKpiItem';

const AdminKpiSettings = ({ settings, onSettingsChange }) => {
  const { t } = useTranslation(['admin']);
  
  const [kpiConfig, setKpiConfig] = useState(() => {
    const savedConfig = settings?.kpis || [];
    const savedKeys = new Set(savedConfig.map(k => k.key));
    const newKpis = adminKpiDefinitions
      .filter(def => !savedKeys.has(def.key))
      .map(def => ({ key: def.key, enabled: true }));
    return [...savedConfig, ...newKpis];
  });
  
  const kpiKeys = useMemo(() => kpiConfig.map(k => k.key), [kpiConfig]);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = kpiKeys.indexOf(active.id);
      const newIndex = kpiKeys.indexOf(over.id);
      const newOrder = arrayMove(kpiConfig, oldIndex, newIndex);
      setKpiConfig(newOrder);
      onSettingsChange({ ...settings, kpis: newOrder });
    }
  };

  const handleToggle = (key, enabled) => {
    const newConfig = kpiConfig.map(kpi => 
      kpi.key === key ? { ...kpi, enabled } : kpi
    );
    setKpiConfig(newConfig);
    onSettingsChange({ ...settings, kpis: newConfig });
  };

  return (
    <div onSelect={(e) => e.preventDefault()}>
      <DropdownMenuLabel className="px-3">{t('kpis.settingsTitle', 'Visible Metrics')}</DropdownMenuLabel>
      <div className="p-1">
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={kpiKeys} strategy={verticalListSortingStrategy}>
            {kpiConfig.map((kpi) => {
                const kpiDef = adminKpiDefinitions.find(def => def.key === kpi.key);
                if (!kpiDef) return null;
                return (
                    <SortableKpiItem
                        key={kpi.key}
                        id={kpi.key}
                        name={t(kpiDef.titleKey)}
                        enabled={kpi.enabled}
                        onToggle={handleToggle}
                    />
                )
            })}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
};

export default AdminKpiSettings;