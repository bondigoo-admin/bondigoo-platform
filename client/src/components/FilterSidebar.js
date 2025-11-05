import React from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from '../utils/logger';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion.jsx';
import { Input } from './ui/input.tsx';
import { Slider } from './ui/slider.tsx';
import { Switch } from './ui/switch.tsx';
import { Label } from './ui/label.tsx';
import { Button } from './ui/button.tsx';
import SearchableListSelector from './SearchableListSelector';
import { Star } from 'lucide-react';

const PriceFilter = ({ value, onChange, max: maxProp = 500, step: stepProp = 10 }) => {
    const { t } = useTranslation('coachList');
    const [min, max] = value;

    const handleMinChange = (e) => {
        const newMin = e.target.value === '' ? null : parseInt(e.target.value, 10);
        onChange([newMin, max]);
    };

    const handleMaxChange = (e) => {
        const newMax = e.target.value === '' ? null : parseInt(e.target.value, 10);
        onChange([min, newMax]);
    };

    return (
        <div className="space-y-4 px-1">
            <Slider
                min={0}
                max={maxProp}
                step={stepProp}
                value={[min || 0, max || maxProp]}
                onValueChange={([newMin, newMax]) => onChange([newMin, newMax >= maxProp ? null : newMax])}
                className="my-4"
            />
            <div className="flex items-center gap-2">
                <Input type="number" variant="compact" label={t('minPrice')} value={min === null ? '' : min} onChange={handleMinChange} className="w-full" aria-label={t('minPrice')} />
                <span className="text-muted-foreground">-</span>
                <Input type="number" variant="compact" label={t('maxPrice')} value={max === null ? '' : max} onChange={handleMaxChange} className="w-full" aria-label={t('maxPrice')} />
            </div>
        </div>
    );
};

const RatingFilter = ({ value, onChange }) => {
    return (
        <div className="flex items-center justify-center space-x-1 p-2">
            {[...Array(5)].map((_, i) => (
                <button key={i} onClick={() => onChange(i + 1)} className="p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" aria-label={`${i + 1} star rating`}>
                    <Star className={`h-6 w-6 transition-colors ${i < value ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 dark:text-gray-600'}`} />
                </button>
            ))}
            {value > 0 && (
                <Button variant="ghost" size="sm" onClick={() => onChange(0)} className="ml-2 h-auto py-1 px-2 text-xs">
                    Clear
                </Button>
            )}
        </div>
    );
}

const filterComponentMap = {
    SearchableListSelector,
    PriceFilter,
    RatingFilter,
    Switch
};

const filterConfig = [
    { id: 'specialties', labelKey: 'specialties', component: 'SearchableListSelector', props: { listType: 'specialties', placeholderKey: 'selectSpecialties', multiSelect: true, isFilter: true, inputProps: { variant: 'compact' } }, changeProp: 'onUpdate' },
    { id: 'languages', labelKey: 'languages', component: 'SearchableListSelector', props: { listType: 'languages', placeholderKey: 'selectLanguages', multiSelect: true, isFilter: true, inputProps: { variant: 'compact' } }, changeProp: 'onUpdate' },
    { id: 'priceRange', labelKey: 'priceRange', component: 'PriceFilter' },
    { id: 'minRating', labelKey: 'minRating', component: 'RatingFilter' },
    { id: 'educationLevels', labelKey: 'educationLevels', component: 'SearchableListSelector', props: { listType: 'educationLevels', placeholderKey: 'selectEducationLevels', multiSelect: true, isFilter: true, inputProps: { variant: 'compact' } }, changeProp: 'onUpdate' },
    { id: 'coachingStyles', labelKey: 'coachingStyles', component: 'SearchableListSelector', props: { listType: 'coachingStyles', placeholderKey: 'selectCoachingStyles', multiSelect: true, isFilter: true, inputProps: { variant: 'compact' } }, changeProp: 'onUpdate' },
    { id: 'skills', labelKey: 'skills', component: 'SearchableListSelector', props: { listType: 'skills', placeholderKey: 'selectSkills', multiSelect: true, isFilter: true, inputProps: { variant: 'compact' } }, changeProp: 'onUpdate' },
];

const FilterSidebar = ({ filters, onFilterChange, facetData, isLoadingFacets, isSwissUser }) => {
    const { t } = useTranslation(['coachList', 'common']);

     logger.info(`[FilterSidebar] Rendering with isSwissUser=${isSwissUser}.`);

    const defaultOpenItems = Object.entries(filters)
        .filter(([, value]) => {
            if (Array.isArray(value) && value.length > 0) {
              if (JSON.stringify(value) === JSON.stringify([null, null])) return false;
              return true;
            }
            return !!value;
        })
        .map(([key]) => key);

    return (
        <div className="h-full space-y-6">
            <Accordion type="multiple" defaultValue={defaultOpenItems} className="w-full">
                {filterConfig.map(filter => {
                    const FilterComponent = filterComponentMap[filter.component];
                    const value = filters[filter.id];
                    const handleChange = (newValue) => onFilterChange(filter.id, newValue);
                    const componentProps = filter.props ? { ...filter.props } : {};

                    if (componentProps.placeholderKey) {
                        componentProps.placeholder = t(componentProps.placeholderKey);
                        delete componentProps.placeholderKey;
                    }
                    
                    if (filter.component === 'SearchableListSelector') {
                        componentProps.availableItems = facetData?.[filter.id];
                        componentProps.isLoading = isLoadingFacets;
                    }

                    const changePropName = filter.changeProp || 'onChange';
                    const changeHandlers = { [changePropName]: handleChange };

                    return (
                        <AccordionItem key={filter.id} value={filter.id}>
                            <AccordionTrigger className="text-base font-medium hover:no-underline">
                                {t(filter.labelKey)}
                            </AccordionTrigger>
                            <AccordionContent>
                                <FilterComponent 
                                    {...componentProps}
                                    value={value}
                                    selectedItems={value} // For SearchableListSelector
                                    {...changeHandlers}
                                />
                            </AccordionContent>
                        </AccordionItem>
                    );
                })}
            </Accordion>
            
            <div className="flex items-center justify-between p-4 border rounded-lg bg-background">
                <Label htmlFor="live-session-switch" className="font-semibold text-base">
                    {t('liveSessionAvailable')}
                </Label>
                <Switch
                    id="live-session-switch"
                    checked={filters.liveSessionAvailable}
                    onCheckedChange={(checked) => onFilterChange('liveSessionAvailable', checked)}
                    aria-label={t('liveSessionAvailable')}
                />
            </div>

            

            {filters.liveSessionAvailable && (
                <Accordion type="single" collapsible className="w-full" defaultValue="live-price-item">
                    <AccordionItem value="live-price-item">
                        <AccordionTrigger className="text-base font-medium hover:no-underline">
                            {t('liveSessionPrice')}
                        </AccordionTrigger>
                        <AccordionContent>
                             <PriceFilter
                                value={filters.liveSessionPriceRange || [null, null]}
                                onChange={(newValue) => onFilterChange('liveSessionPriceRange', newValue)}
                                max={50}
                                step={1}
                             />
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            )}

             {isSwissUser && (
                <div className="flex items-center justify-between p-4 border rounded-lg bg-background">
                    <Label htmlFor="insurance-recognition-switch" className="font-semibold text-base">
                        {t('insuranceRecognized')}
                    </Label>
                    <Switch
                        id="insurance-recognition-switch"
                        checked={filters.isInsuranceRecognized}
                        onCheckedChange={(checked) => onFilterChange('isInsuranceRecognized', checked)}
                        aria-label={t('insuranceRecognized')}
                    />
                </div>
            )}
        </div>
    );
};

export default React.memo(FilterSidebar);