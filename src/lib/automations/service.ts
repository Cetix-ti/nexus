import prisma from "@/lib/prisma";

export async function listRules() {
  return prisma.automationRule.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createRule(input: any) {
  return prisma.automationRule.create({
    data: {
      name: input.name,
      description: input.description,
      trigger: input.trigger,
      conditions: input.conditions || {},
      actions: input.actions || {},
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateRule(id: string, patch: any) {
  return prisma.automationRule.update({ where: { id }, data: patch });
}

export async function deleteRule(id: string) {
  return prisma.automationRule.delete({ where: { id } });
}
