import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      // Aucune reprise automatique : le cold start Neon peut durer 30 s,
      // la relance est explicite via le bouton « Réessayer » (ErrorState).
      retry: 0,
      refetchOnWindowFocus: false,
    },
  },
});
