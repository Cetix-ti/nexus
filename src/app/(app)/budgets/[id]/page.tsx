import { BudgetDetail } from "@/components/budgets/budget-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BudgetDetail budgetId={id} />;
}
