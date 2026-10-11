import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge debe conocer las escalas propias del tema para resolver conflictos de clases.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['meta', 'denso', 'cuerpo', 'seccion', 'pagina'] }],
      rounded: [{ rounded: ['chip', 'control', 'panel'] }],
    },
  },
});

export function cn(...clases: ClassValue[]) {
  return twMerge(clsx(clases));
}
