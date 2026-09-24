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
  home: { title: string; subtitle: string };
  map: { title: string; placeholder: string };
  list: { title: string; placeholder: string };
  event: { title: string; placeholder: string; notFound: string };
  about: { title: string; description: string };
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
    };
  }
}
