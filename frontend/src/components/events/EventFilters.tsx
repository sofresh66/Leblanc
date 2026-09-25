import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import {
  CATEGORIES,
  SEARCH_RADIUS_METERS,
  type EventCategory,
  type EventListParamsInput,
} from '@leblanc/shared';
import { resolveMaxDistanceMeters } from '../../hooks/useEvents';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '../../i18n/languages';

const FilterFormSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  category: z.string().optional(),
  priceType: z.enum(['all', 'free', 'paid']),
  maxDistanceKm: z.number().min(1).max(20),
});

export type FilterFormValues = {
  from?: string | undefined;
  to?: string | undefined;
  category?: string | undefined;
  priceType: 'all' | 'free' | 'paid';
  maxDistanceKm: number;
};

export interface EventFiltersProps {
  onFiltersChange?: ((filters: Omit<EventListParamsInput, 'cursor'>) => void) | undefined;
  className?: string | undefined;
}

export const EventFilters: React.FC<EventFiltersProps> = ({
  onFiltersChange,
  className = '',
}) => {
  const { t, i18n } = useTranslation(['filters', 'events', 'common']);
  const currentLang = (isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE) as SupportedLanguage;
  const [searchParams, setSearchParams] = useSearchParams();
  const [isOpenMobile, setIsOpenMobile] = useState(false);

  // Parse values from URL searchParams
  const getInitialValues = (): FilterFormValues => {
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';
    const category = searchParams.get('category') || '';
    const isFreeParam = searchParams.get('isFree');
    const priceType: 'all' | 'free' | 'paid' =
      isFreeParam === 'true' ? 'free' : isFreeParam === 'false' ? 'paid' : 'all';
    // L'URL porte la distance en mètres (`maxDistance`) ; l'ancien paramètre en kilomètres
    // (`maxDistanceKm`) reste accepté, et le curseur affiche des kilomètres (1 à 20 km).
    const maxDistanceMeters = resolveMaxDistanceMeters(searchParams);
    const maxDistanceKm =
      maxDistanceMeters !== undefined
        ? Math.min(20, Math.max(1, Math.round(maxDistanceMeters / 1000)))
        : 20;

    return {
      from,
      to,
      category,
      priceType,
      maxDistanceKm,
    };
  };

  const { register, handleSubmit, reset, control, watch } = useForm<FilterFormValues>({
    resolver: zodResolver(FilterFormSchema),
    defaultValues: getInitialValues(),
  });

  const watchedDistance = watch('maxDistanceKm', 20);

  // Emit filter params to parent
  const applyFilters = (data: FilterFormValues) => {
    const newParams = new URLSearchParams(searchParams);

    if (data.from) {
      newParams.set('from', data.from);
    } else {
      newParams.delete('from');
    }

    if (data.to) {
      newParams.set('to', data.to);
    } else {
      newParams.delete('to');
    }

    if (data.category && data.category !== 'all') {
      newParams.set('category', data.category);
    } else {
      newParams.delete('category');
    }

    if (data.priceType === 'free') {
      newParams.set('isFree', 'true');
    } else if (data.priceType === 'paid') {
      newParams.set('isFree', 'false');
    } else {
      newParams.delete('isFree');
    }

    const maxDistanceMeters = data.maxDistanceKm * 1000;
    if (maxDistanceMeters < SEARCH_RADIUS_METERS) {
      newParams.set('maxDistance', String(maxDistanceMeters));
    } else {
      newParams.delete('maxDistance');
    }
    // L'ancien paramètre en kilomètres n'est plus écrit (rétrocompatibilité en lecture seule).
    newParams.delete('maxDistanceKm');

    // `replace: true` évite d'empiler une entrée d'historique à chaque application de filtres.
    setSearchParams(newParams, { replace: true });

    if (onFiltersChange) {
      const output: Omit<EventListParamsInput, 'cursor'> = {
        lang: currentLang,
        ...(data.from ? { from: data.from } : {}),
        ...(data.to ? { to: data.to } : {}),
        ...(data.category && data.category !== 'all' ? { categories: [data.category as EventCategory] } : {}),
        ...(data.priceType === 'free'
          ? { isFree: true }
          : data.priceType === 'paid'
            ? { isFree: false }
            : {}),
        ...(data.maxDistanceKm * 1000 < SEARCH_RADIUS_METERS
          ? { maxDistance: data.maxDistanceKm * 1000 }
          : {}),
      };
      onFiltersChange(output);
    }
  };

  const handleReset = () => {
    const defaultVals: FilterFormValues = {
      from: '',
      to: '',
      category: '',
      priceType: 'all',
      maxDistanceKm: 20,
    };
    reset(defaultVals);
    applyFilters(defaultVals);
  };

  // Sync when searchParams change externally (e.g. back button)
  useEffect(() => {
    reset(getInitialValues());
  }, [searchParams, reset]);

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6 ${className}`}>
      {/* Mobile Header Toggle */}
      <div className="flex items-center justify-between lg:hidden mb-2">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <svg className="w-5 h-5 text-brenne-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          {t('title', { ns: 'filters' })}
        </h2>
        <button
          type="button"
          onClick={() => setIsOpenMobile(!isOpenMobile)}
          className="text-sm font-semibold text-brenne-700 hover:text-brenne-900 py-1 px-2.5 rounded-lg bg-brenne-50"
          aria-expanded={isOpenMobile}
        >
          {isOpenMobile ? t('actions.close', { ns: 'common' }) : t('title', { ns: 'filters' })}
        </button>
      </div>

      <form
        onSubmit={handleSubmit(applyFilters)}
        className={`${isOpenMobile ? 'block' : 'hidden'} lg:block space-y-5`}
      >
        <div className="hidden lg:flex items-center justify-between pb-3 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-brenne-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {t('title', { ns: 'filters' })}
          </h2>
        </div>

        {/* Dates Range */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
            {t('dates.label', { ns: 'filters' })}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <span className="block text-[11px] text-gray-500 mb-1">{t('dates.from', { ns: 'filters' })}</span>
              <input
                type="date"
                {...register('from')}
                className="w-full text-sm rounded-lg border-gray-300 shadow-sm focus:border-brenne-500 focus:ring-brenne-500 py-1.5 px-2.5"
              />
            </div>
            <div>
              <span className="block text-[11px] text-gray-500 mb-1">{t('dates.to', { ns: 'filters' })}</span>
              <input
                type="date"
                {...register('to')}
                className="w-full text-sm rounded-lg border-gray-300 shadow-sm focus:border-brenne-500 focus:ring-brenne-500 py-1.5 px-2.5"
              />
            </div>
          </div>
        </div>

        {/* Categories */}
        <div>
          <label htmlFor="category-select" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
            {t('categories.label', { ns: 'filters' })}
          </label>
          <select
            id="category-select"
            {...register('category')}
            className="w-full text-sm rounded-lg border-gray-300 shadow-sm focus:border-brenne-500 focus:ring-brenne-500 py-2 px-2.5 bg-white"
          >
            <option value="">{t('categories.all', { ns: 'filters' })}</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {t(`categories.${cat}`, { ns: 'events' })}
              </option>
            ))}
          </select>
        </div>

        {/* Price filter */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
            {t('price.label', { ns: 'filters' })}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'all', label: t('price.all', { ns: 'filters' }) },
              { id: 'free', label: t('price.freeOnly', { ns: 'filters' }) },
              { id: 'paid', label: t('price.paidOnly', { ns: 'filters' }) },
            ].map((option) => (
              <label
                key={option.id}
                className="flex items-center justify-center p-2 text-xs font-medium rounded-lg border cursor-pointer transition-colors text-center has-[:checked]:bg-brenne-50 has-[:checked]:border-brenne-500 has-[:checked]:text-brenne-900 border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                <input
                  type="radio"
                  value={option.id}
                  {...register('priceType')}
                  className="sr-only"
                />
                <span className="truncate">{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Distance Slider */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label htmlFor="distance-range" className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              {t('distance.label', { ns: 'filters' })}
            </label>
            <span className="text-xs font-bold text-brenne-700">
              {t('distance.value', { distance: watchedDistance, ns: 'filters' })}
            </span>
          </div>
          <Controller
            control={control}
            name="maxDistanceKm"
            render={({ field }) => (
              <input
                id="distance-range"
                type="range"
                min="1"
                max="20"
                step="1"
                value={field.value}
                onChange={(e) => field.onChange(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brenne-700"
              />
            )}
          />
          <div className="flex justify-between text-[10px] text-gray-600 mt-1">
            <span>1 km</span>
            <span>10 km</span>
            <span>20 km</span>
          </div>
        </div>

        {/* Form Actions */}
        <div className="pt-3 border-t border-gray-100 flex items-center gap-3">
          <button
            type="submit"
            className="btn-primary flex-1 py-2 text-sm justify-center shadow-sm"
          >
            {t('actions.apply', { ns: 'filters' })}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="btn-secondary py-2 px-3 text-sm"
            title={t('actions.reset', { ns: 'filters' })}
          >
            {t('actions.reset', { ns: 'filters' })}
          </button>
        </div>
      </form>
    </div>
  );
};
