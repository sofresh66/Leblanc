import 'react-i18next';

export interface CommonResource {
  app: {
    name: string;
    tagline: string;
  };
  actions: {
    view: string;
    close: string;
    loading: string;
    retry: string;
  };
  footer: {
    madeBy: string;
    rights: string;
    sources: string;
  };
}

export interface NavResource {
  privacy: string;
  credits: string;
  home: string;
  map: string;
  list: string;
  about: string;
  language: string;
}

export interface ErrorsResource {
  generic: string;
  network: string;
  timeout: string;
  serviceWakingUp: string;
  notFound: {
    title: string;
    description: string;
  };
}

export interface SeoResource {
  privacy: { title: string; description: string };
  credits: { title: string; description: string };
  home: { title: string; description: string };
  map: { title: string; description: string };
  list: { title: string; description: string };
  event: { title: string; description: string; dynamicTitle: string };
  about: { title: string; description: string };
  notFound: { title: string; description: string };
}

export interface PagesResource {
  legal: { title: string; publisher: string; personalProject: string; contact: string; director: string; host: string; database: string; databaseLocation: string };
  privacy: {
    title: string; description: string; creditsLink: string;
    storage: { title: string; body: string; delete: string };
    tracking: { title: string; body: string };
    services: { title: string; body: string; cloudflare: string; osm: string };
    contact: { title: string; body: string };
  };
  credits: {
    title: string; description: string;
    hero: { title: string; file: string; work: string; author: string; source: string; license: string; description: string; changes: string; original: string; publication: string };
    categories: { title: string; file: string; subject: string; source: string; description: string; license: string; subjects: { culture: string; sport: string; fete: string; association: string; autre: string } };
    footer: { title: string; note: string; eventImages: string; ccLicense: string };
  };
  home: {
    title: string;
    subtitle: string;
    topTitle: string;
    topSubtitle: string;
    weekendTitle: string;
    weekendSubtitle: string;
    categoriesTitle: string;
    recentTitle: string;
    viewAll: string;
    viewMap: string;
  };
  map: { title: string; subtitle?: string; placeholder: string; limitBanner: string };
  list: { title: string; subtitle?: string; placeholder: string };
  event: { title: string; placeholder: string; notFound: string };
  about: { title: string; description: string };
}

export interface EventsResource {
  categories: {
    culture: string;
    sport: string;
    fete: string;
    association: string;
    autre: string;
  };
  price: {
    free: string;
    from: string;
    paid: string;
  };
  distance: {
    km: string;
  };
  details: {
    directions: string;
    addToCalendar: string;
    share: string;
    linkCopied: string;
    viewWebsite: string;
    source: string;
    location: string;
    occurrencesTitle: string;
    occurrencePast: string;
    occurrenceFuture: string;
    fallbackNotice: string;
  };
  list: {
    loadMore: string;
    noMoreEvents: string;
    emptyTitle: string;
    emptyDescription: string;
    resetFilters: string;
  };
}

export interface FiltersResource {
  title: string;
  dates: {
    label: string;
    from: string;
    to: string;
  };
  categories: {
    label: string;
    all: string;
  };
  price: {
    label: string;
    all: string;
    free: string;
    paid: string;
  };
  distance: {
    label: string;
    value: string;
  };
  actions: {
    reset: string;
    apply: string;
  };
}

export interface PlacesResource {
  title: string;
  subtitle: string;
  count_one: string;
  count_other: string;
  distanceKm: string;
  card: { view: string };
  types: {
    restaurant: string;
    bar: string;
    cafe: string;
    fast_food: string;
    food_truck: string;
    other_food: string;
  };
  status: { open: string; closed: string; unknown: string };
  price: { range: string; from: string; to: string; exact: string; unknown: string };
  filters: {
    title: string;
    type: string;
    cuisine: string;
    openNow: string;
    openOnly: string;
    distance: string;
    reset: string;
    apply: string;
    show: string;
    hide: string;
    cuisineUnavailable: string;
    loadingCuisines: string;
    retry: string;
  };
  list: {
    results: string;
    loadMore: string;
    empty: string;
    emptyDescription: string;
    error: string;
    end: string;
  };
  cuisines: Record<string, string>;
  detail: {
    breadcrumb: { label: string; home: string; places: string };
    sections: { description: string; hours: string; location: string; practicalInfo: string; price: string };
    fields: { address: string; distance: string; phone: string; website: string; email: string };
    hours: {
      unknown: string;
      closedToday: string;
      closed: string;
      today: string;
      noSchedule: string;
      currentWeek: string;
      partialNotice: string;
      day: string;
      times: string;
      nextDay: string;
      sourceOsm: string;
      osmDisclaimer: string;
      sourceManual: string;
      manualDisclaimer: string;
    };
    actions: {
      getDirections: string;
      call: string;
      visitWebsite: string;
      share: string;
      openInMaps: string;
      copied: string;
      unavailable: string;
    };
    notFound: { title: string; description: string };
    sourceLine: string;
    sources: { datatourisme_places: string; openstreetmap: string; manuel: string; other: string };
    noDescription: string;
    addressUnknown: string;
    addressNotMapped: string;
    fallbackNotice: string;
    mapLoading: string;
  };
}

declare module 'react-i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: CommonResource;
      nav: NavResource;
      errors: ErrorsResource;
      seo: SeoResource;
      pages: PagesResource;
      events: EventsResource;
      filters: FiltersResource;
      places: PlacesResource;
    };
  }
}
