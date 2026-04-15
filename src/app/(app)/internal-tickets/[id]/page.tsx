// Route dédiée aux tickets internes : réutilise intégralement la page
// détail existante, mais sous une URL `/internal-tickets/[id]` pour que :
//   - la sidebar reste sur « Tickets internes » (match du pathname)
//   - les partages de lien et le breadcrumb soient cohérents
//   - on évite de dupliquer ~1500 lignes de logique UI
//
// La page détail elle-même (src/app/(app)/tickets/[id]/page.tsx) détecte
// le pathname et ajuste son "Retour" et son breadcrumb en conséquence.
export { default } from "@/app/(app)/tickets/[id]/page";
