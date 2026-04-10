import prisma from "@/lib/prisma";

function flatten(b: any) {
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    icon: b.icon,
    color: b.color,
    groupBy: (b.groupBy as string).toLowerCase(),
    shareScope: (b.shareScope as string).toLowerCase(),
    sharedWithGroupIds: b.sharedWithGroupIds,
    sharedWithGroupNames: b.sharedWithGroupNames,
    filterOrgIds: b.filterOrgIds,
    filterTechIds: b.filterTechIds,
    filterCategories: b.filterCategories,
    filterTags: b.filterTags,
    filterPriorities: b.filterPriorities,
    filterTicketTypes: b.filterTicketTypes,
    isPinned: b.isPinned,
    customColumns: (b.columns || [])
      .sort((a: any, z: any) => a.sortOrder - z.sortOrder)
      .map((c: any) => ({
        id: c.id,
        label: c.label,
        value: c.value,
        color: c.color,
        order: c.sortOrder,
        visible: c.visible,
      })),
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

export async function listBoards() {
  const rows = await prisma.kanbanBoard.findMany({
    include: { columns: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(flatten);
}

export async function createBoard(input: any) {
  const board = await prisma.kanbanBoard.create({
    data: {
      name: input.name,
      description: input.description,
      icon: input.icon || "📋",
      color: input.color || "#3B82F6",
      groupBy: (input.groupBy || "STATUS").toUpperCase(),
      shareScope: (input.shareScope || "PRIVATE").toUpperCase(),
      sharedWithGroupIds: input.sharedWithGroupIds || [],
      sharedWithGroupNames: input.sharedWithGroupNames || [],
      filterOrgIds: input.filterOrgIds || [],
      filterTechIds: input.filterTechIds || [],
      filterCategories: input.filterCategories || [],
      filterTags: input.filterTags || [],
      filterPriorities: input.filterPriorities || [],
      filterTicketTypes: input.filterTicketTypes || [],
      isPinned: input.isPinned || false,
      columns: {
        create: (input.customColumns || []).map((c: any, i: number) => ({
          label: c.label,
          value: c.value,
          color: c.color,
          sortOrder: c.order ?? i,
          visible: c.visible ?? true,
        })),
      },
    },
    include: { columns: true },
  });
  return flatten(board);
}

export async function updateBoard(id: string, patch: any) {
  const data: any = {};
  for (const k of [
    "name",
    "description",
    "icon",
    "color",
    "isPinned",
    "sharedWithGroupIds",
    "sharedWithGroupNames",
    "filterOrgIds",
    "filterTechIds",
    "filterCategories",
    "filterTags",
    "filterPriorities",
    "filterTicketTypes",
  ]) {
    if (patch[k] !== undefined) data[k] = patch[k];
  }
  if (patch.groupBy) data.groupBy = patch.groupBy.toUpperCase();
  if (patch.shareScope) data.shareScope = patch.shareScope.toUpperCase();

  // Replace columns if provided
  if (patch.customColumns) {
    await prisma.kanbanBoardColumn.deleteMany({ where: { boardId: id } });
    data.columns = {
      create: patch.customColumns.map((c: any, i: number) => ({
        label: c.label,
        value: c.value,
        color: c.color,
        sortOrder: c.order ?? i,
        visible: c.visible ?? true,
      })),
    };
  }

  const board = await prisma.kanbanBoard.update({
    where: { id },
    data,
    include: { columns: true },
  });
  return flatten(board);
}

export async function deleteBoard(id: string) {
  await prisma.kanbanBoard.delete({ where: { id } });
}
