import prisma from "@/lib/prisma";

export async function listTemplates() {
  return prisma.recurringTicketTemplate.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createTemplate(input: any) {
  return prisma.recurringTicketTemplate.create({ data: input });
}

export async function updateTemplate(id: string, patch: any) {
  return prisma.recurringTicketTemplate.update({ where: { id }, data: patch });
}

export async function deleteTemplate(id: string) {
  return prisma.recurringTicketTemplate.delete({ where: { id } });
}
