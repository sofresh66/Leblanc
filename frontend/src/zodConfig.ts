import { z } from 'zod';

// Zod lit ce réglage à la construction des schémas : ce module est importé en
// premier par main.tsx. Sans JIT, Zod ne sonde plus `new Function`, que la CSP
// bloque (violation `eval` sur chaque page) ; la validation reste identique.
z.config({ jitless: true });
