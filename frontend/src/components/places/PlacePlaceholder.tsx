import type { PlaceType } from '@leblanc/shared';

const styles: Record<PlaceType, { background: string; ink: string }> = {
  restaurant: { background: '#f5f0e6', ink: '#68583e' },
  bar: { background: '#e8f0e0', ink: '#446342' },
  cafe: { background: '#f0ebe0', ink: '#705b44' },
  fast_food: { background: '#faf0e0', ink: '#a65b2a' },
  food_truck: { background: '#e8f0f5', ink: '#3d6477' },
  other_food: { background: '#f0f0f0', ink: '#626262' },
};

export function PlacePlaceholder({ type, city, className = '' }: {
  type: PlaceType;
  city?: string | null;
  className?: string;
}) {
  const style = styles[type];
  return (
    <div aria-hidden="true" className={`flex h-full w-full flex-col items-center justify-center gap-3 ${className}`}
      style={{ backgroundColor: style.background, color: style.ink }}>
      <span className="absolute left-5 top-5 h-16 w-16 rounded-full border border-current opacity-10" />
      <span className="absolute bottom-5 right-5 h-24 w-24 rounded-full border border-current opacity-10" />
      <svg className="h-16 w-16 opacity-70" viewBox="0 0 64 64" fill="none" stroke="currentColor"
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {type === 'restaurant' && <>
          <path d="M11 10v17c0 6 4 10 9 10v17M20 10v44M29 10v17c0 6-4 10-9 10" />
          <path d="M47 54V10c-8 6-11 16-11 28h11" />
        </>}
        {type === 'bar' && <>
          <path d="M13 12h38l-5 18c-2 7-7 11-14 11S20 37 18 30l-5-18Z" />
          <path d="M32 41v11M22 54h20M16 22h32" />
        </>}
        {type === 'cafe' && <>
          <path d="M12 22h34v17c0 8-6 13-17 13S12 47 12 39V22Z" />
          <path d="M46 26h5c5 0 7 3 7 7s-3 7-9 7h-3M20 10c-3 4 3 5 0 9M30 10c-3 4 3 5 0 9M40 10c-3 4 3 5 0 9" />
        </>}
        {type === 'fast_food' && <>
          <path d="M11 29c1-11 9-18 21-18s20 7 21 18H11ZM10 35h44M12 44h40M15 50h34" />
          <path d="M17 29h30M21 23h1M31 20h1M41 23h1" />
        </>}
        {type === 'food_truck' && <>
          <path d="M7 17h32v29H7V17ZM39 27h10l8 9v10H39V27Z" />
          <path d="M13 26h19M13 33h19M11 46h46" />
          <circle cx="18" cy="49" r="5" /><circle cx="48" cy="49" r="5" />
        </>}
        {type === 'other_food' && <>
          <path d="M13 10v17c0 6 4 10 9 10v17M22 10v44M31 10v17c0 6-4 10-9 10" />
          <path d="M45 10v44M45 10c-7 0-10 5-10 13s3 12 10 12" />
        </>}
      </svg>
      {city && <span className="max-w-[80%] text-center text-xs font-semibold uppercase tracking-[0.16em] opacity-75">{city}</span>}
    </div>
  );
}
