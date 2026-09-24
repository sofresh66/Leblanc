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
  home: string;
  map: string;
  list: string;
  about: string;
  language: string;
}

export interface ErrorsResource {
  generic: string;
  notFound: {
    title: string;
    description: string;
  };
}

export interface SeoResource {
  home: { title: string; description: string };
  map: { title: string; description: string };
  list: { title: string; description: string };
  event: { title: string; description: string };
  about: { title: string; description: string };
  notFound: { title: string; description: string };
}

export interface PagesResource {
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
  map: { title: string; subtitle?: string; placeholder: string };
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
    freeOnly: string;
    paidOnly: string;
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
