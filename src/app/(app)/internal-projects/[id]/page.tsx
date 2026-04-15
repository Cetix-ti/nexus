// Route dédiée aux projets internes : réutilise la page détail existante
// (src/app/(app)/projects/[id]/page.tsx) pour que la sidebar reste sur
// « Projets internes » et que le breadcrumb reste cohérent.
export { default } from "@/app/(app)/projects/[id]/page";
