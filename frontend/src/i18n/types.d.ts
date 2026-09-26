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
    };
  }
}
