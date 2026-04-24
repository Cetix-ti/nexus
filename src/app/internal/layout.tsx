// Layout minimal pour les pages de rendu internes (ex: rapports PDF).
// Pas de sidebar, pas de providers applicatifs : Puppeteer ouvre directement
// ces pages et n'a besoin que du HTML/CSS. Le root layout fournit déjà
// <html> et les polices.

export const dynamic = "force-dynamic";

export default function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
