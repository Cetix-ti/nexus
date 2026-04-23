import { BugDetail } from "@/components/bugs/bug-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BugDetail bugId={id} />;
}
