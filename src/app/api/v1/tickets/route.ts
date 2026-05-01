import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { listTickets, createTicket, typeToDb } from "@/lib/tickets/service";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Resolve assignee=me to current user's ID
  let assigneeId = url.searchParams.get("assigneeId") || undefined;
  const assigneeParam = url.searchParams.get("assignee");
  if (assigneeParam === "me") {
    const me = await getCurrentUser();
    if (me) assigneeId = me.id;
  }

  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  // Corbeille :
  //   ?trash=only    → liste la corbeille
  //   ?trash=include → inclut les supprimés dans les résultats
  //                    (utile pour retrouver un ticket supprimé par
  //                    erreur via une recherche par sujet/numéro)
  //   par défaut     → exclut les supprimés
  const trashParam = url.searchParams.get("trash");
  const trash: "only" | "include" | undefined =
    trashParam === "only" || trashParam === "include" ? trashParam : undefined;

  const tickets = await listTickets({
    organizationId: url.searchParams.get("organizationId") || undefined,
    status: url.searchParams.get("status") || undefined,
    search: url.searchParams.get("q") || url.searchParams.get("search") || undefined,
    assigneeId,
    projectId: url.searchParams.get("projectId") || undefined,
    limit,
    // Filtres du tableau de bord — tuiles cliquables.
    unassignedOnly: url.searchParams.get("unassignedOnly") === "true",
    overdueOnly: url.searchParams.get("overdueOnly") === "true",
    openOnly: url.searchParams.get("openOnly") === "true",
    requiresOnSiteOnly: url.searchParams.get("requiresOnSiteOnly") === "true",
    pendingApprovalOnly: url.searchParams.get("pendingApprovalOnly") === "true",
    // includeMonitoring=true pour que le dashboard "Alertes monitoring"
    // puisse les récupérer. Par défaut exclus des vues tickets classiques.
    includeMonitoring: url.searchParams.get("includeMonitoring") === "true",
    // internal=true → seulement internes (admin Cetix) ; "all" → tout.
    internal:
      url.searchParams.get("internal") === "true"
        ? true
        : url.searchParams.get("internal") === "all"
        ? "all"
        : false,
    trash,
  });
  return NextResponse.json(tickets);
}

export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    // SECURITY : la création de ticket est strictement réservée aux
    // agents authentifiés (Cetix). Les contacts portail passent par
    // /api/v1/portal/tickets qui scope toujours à leur org. Sans ce
    // check, un POST anonyme tombait sur la cascade fallback et le
    // ticket atterrissait sur la PREMIÈRE org active du tenant — bug
    // observé sur TK-28697 (créé depuis le portail SADB → rattaché
    // par mégarde à « Les Blocs Normand Inc. »).
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();

    if (!body.subject) {
      return NextResponse.json({ error: "Le sujet est requis" }, { status: 400 });
    }

    // Si le ticket est rattaché à un projet, l'organisation EST CELLE
    // DU PROJET — non négociable. Cette dérivation est faite AVANT la
    // résolution depuis body.organizationId/Name pour que personne ne
    // puisse passer un mauvais id (volontairement ou par bug UI).
    let organizationId: string | undefined;
    if (body.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: String(body.projectId) },
        select: { id: true, organizationId: true },
      });
      if (!project) {
        return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
      }
      organizationId = project.organizationId;
    }

    // Sinon, résolution classique : organizationId fourni, ou lookup par name.
    if (!organizationId) {
      organizationId = body.organizationId;
    }
    if (!organizationId && body.organizationName) {
      const org = await prisma.organization.findFirst({
        where: { name: { equals: body.organizationName, mode: "insensitive" } },
        select: { id: true },
      });
      if (org) organizationId = org.id;
    }
    // Pour un ticket interne : force l'organisation interne (Cetix).
    // Sans isInternal, fallback à la première org active pour backward-compat.
    if (!organizationId) {
      if (body.isInternal) {
        const internal = await prisma.organization.findFirst({
          where: { isInternal: true },
          select: { id: true },
        });
        if (!internal) {
          return NextResponse.json(
            {
              error:
                "Aucune organisation interne configurée. Marque l'organisation Cetix comme interne dans les Paramètres.",
            },
            { status: 412 },
          );
        }
        organizationId = internal.id;
      } else {
        // SECURITY : ne plus retomber silencieusement sur "première org
        // active". Un appelant sans org explicite + sans projet doit
        // recevoir une 400 plutôt qu'un ticket rattaché au hasard.
        return NextResponse.json(
          { error: "Organisation requise (organizationId, organizationName ou projectId)" },
          { status: 400 },
        );
      }
    }
    if (!organizationId) {
      return NextResponse.json({ error: "Organisation non trouvée" }, { status: 400 });
    }

    // Auto-propagation du flag "interne" depuis l'organisation : si l'org
    // est marquée isInternal=true (ex: Cetix, ou plus tard Preventix), tout
    // ticket créé pour elle est automatiquement traité comme ticket interne,
    // même si l'appelant n'a pas passé body.isInternal=true.
    const orgRow = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { isInternal: true },
    });
    const effectiveIsInternal = !!body.isInternal || !!orgRow?.isInternal;

    // Resolve requester by name if provided
    let requesterId = body.requesterId;
    if (!requesterId && body.requesterName && organizationId) {
      const parts = body.requesterName.split(" ");
      const contact = await prisma.contact.findFirst({
        where: {
          organizationId,
          OR: [
            { firstName: { contains: parts[0] ?? "", mode: "insensitive" } },
            { email: { contains: body.requesterName, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      if (contact) requesterId = contact.id;
    }

    // Resolve assignee by name if provided
    let assigneeId = body.assigneeId;
    if (!assigneeId && body.assigneeName && body.assigneeName !== "unassigned") {
      const parts = body.assigneeName.split(" ");
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { firstName: { contains: parts[0] ?? "", mode: "insensitive" } },
            { lastName: { contains: parts[parts.length - 1] ?? "", mode: "insensitive" } },
          ],
          isActive: true,
        },
        select: { id: true },
      });
      if (user) assigneeId = user.id;
    }

    // Creator = utilisateur authentifié. Garanti non-null par le check
    // d'auth en haut de la fonction. Plus de fallback "premier admin"
    // pour ne plus laisser un POST anonyme se rattacher à un user au
    // hasard (cf. bug TK-28697).
    const creatorId: string = me.id;

    // Resolve category by name (accept both `category` and `categoryName`)
    let categoryId = body.categoryId ?? null;
    const categoryName = body.category || body.categoryName;
    if (!categoryId && categoryName) {
      const cat = await prisma.category.findFirst({
        where: { name: { equals: categoryName, mode: "insensitive" } },
        select: { id: true },
      });
      if (cat) categoryId = cat.id;
    }

    // Resolve queue by name (accept both `queue` and `queueName`)
    let queueId = body.queueId ?? null;
    const queueName = body.queue || body.queueName;
    if (!queueId && queueName) {
      const q = await prisma.queue.findFirst({
        where: { name: { equals: queueName, mode: "insensitive" } },
        select: { id: true },
      });
      if (q) queueId = q.id;
    }

    const created = await createTicket({
      subject: body.subject,
      description: body.description ?? "",
      // Passe le HTML riche si fourni (provient d'AdvancedRichEditor ou
      // d'une ingestion email qui a déjà préservé le HTML). Sinon null
      // pour que le rendu retombe sur `description` (plain text).
      descriptionHtml: body.descriptionHtml ?? null,
      organizationId,
      requesterId,
      assigneeId,
      creatorId,
      type: body.type ?? "incident",
      priority: body.priority ?? "medium",
      urgency: body.urgency,
      impact: body.impact,
      source: body.source,
      categoryId,
      queueId,
      isInternal: effectiveIsInternal,
      meetingId: body.meetingId ?? null,
      projectId: body.projectId ?? null,
    });

    // Handle approval workflow if requested
    if (body.requireApproval && Array.isArray(body.approvers) && body.approvers.length > 0) {
      const approvalData = body.approvers
        .map((a: any, i: number) => ({
          ticketId: created.id,
          approverId: a.contactId || a.id || "",
          approverName: a.name || a.contactName || "",
          approverEmail: (a.email || a.contactEmail || "").trim().toLowerCase(),
          role: i === 0 ? "primary" : "secondary",
        }))
        // Filtre les approbateurs sans email — on ne peut pas les
        // notifier, donc inutile de créer une ligne "orpheline" qui
        // bloque le ticket en PENDING sans jamais pouvoir être
        // résolue côté client.
        .filter((a: { approverEmail: string }) => !!a.approverEmail);

      if (approvalData.length > 0) {
        await prisma.$transaction([
          prisma.ticketApproval.createMany({ data: approvalData }),
          prisma.ticket.update({
            where: { id: created.id },
            data: {
              requiresApproval: true,
              approvalStatus: "PENDING",
            },
          }),
        ]);

        // Envoi des courriels de demande d'approbation — fire-and-forget.
        // Chaque approbateur reçoit un lien vers le portail client pour
        // prendre sa décision. Si SMTP n'est pas configuré, sendEmail()
        // renvoie simplement false — on log et on continue ; la relance
        // manuelle (bouton « Relancer ») depuis la fiche ticket est
        // toujours disponible.
        import("@/lib/approvers/notifications")
          .then(({ notifyApprovalRequest }) =>
            notifyApprovalRequest(created.id).catch((e) =>
              console.warn("[approvals] initial notify failed:", e),
            ),
          )
          .catch(() => {});
      }
    }

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur de création" },
      { status: 500 },
    );
  }
}
