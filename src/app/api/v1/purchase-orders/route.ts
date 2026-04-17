import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-utils";

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  const orders = await prisma.purchaseOrder.findMany({
    where,
    include: {
      requestedBy: { select: { id: true, firstName: true, lastName: true } },
      organization: { select: { id: true, name: true } },
      items: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json(orders.map((o) => ({
    id: o.id,
    poNumber: o.poNumber,
    title: o.title,
    status: o.status,
    vendorName: o.vendorName,
    vendorContact: o.vendorContact,
    organizationName: o.organization?.name ?? null,
    organizationId: o.organizationId,
    requestedByName: `${o.requestedBy.firstName} ${o.requestedBy.lastName}`,
    requestedById: o.requestedById,
    subtotal: o.subtotal,
    taxAmount: o.taxAmount,
    totalAmount: o.totalAmount,
    currency: o.currency,
    notes: o.notes,
    expectedDate: o.expectedDate?.toISOString() ?? null,
    receivedDate: o.receivedDate?.toISOString() ?? null,
    submittedAt: o.submittedAt?.toISOString() ?? null,
    approvedAt: o.approvedAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
    itemCount: o.items.length,
    receivedCount: o.items.filter((i) => i.receivedQty >= i.quantity).length,
    items: o.items.map((i) => ({
      id: i.id,
      description: i.description,
      partNumber: i.partNumber,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      totalPrice: i.totalPrice,
      receivedQty: i.receivedQty,
    })),
  })));
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.title || !body.vendorName) {
    return NextResponse.json({ error: "Titre et fournisseur requis" }, { status: 400 });
  }

  // Auto-generate PO number
  const count = await prisma.purchaseOrder.count();
  const poNumber = `PO-${String(count + 1).padStart(5, "0")}`;

  const items = (body.items || []).map((i: any) => ({
    description: i.description,
    partNumber: i.partNumber,
    quantity: i.quantity || 1,
    unitPrice: i.unitPrice || 0,
    totalPrice: (i.quantity || 1) * (i.unitPrice || 0),
  }));

  const subtotal = items.reduce((s: number, i: any) => s + i.totalPrice, 0);
  const taxRate = body.taxRate ?? 0.14975; // TPS+TVQ
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;

  const order = await prisma.purchaseOrder.create({
    data: {
      poNumber,
      title: body.title,
      status: "SUBMITTED",
      vendorName: body.vendorName,
      vendorContact: body.vendorContact,
      organizationId: body.organizationId,
      requestedById: me.id,
      subtotal,
      taxAmount,
      totalAmount: Math.round((subtotal + taxAmount) * 100) / 100,
      currency: body.currency || "CAD",
      notes: body.notes,
      expectedDate: body.expectedDate ? new Date(body.expectedDate) : undefined,
      ticketId: body.ticketId,
      submittedAt: new Date(),
      items: { create: items },
    },
    include: { items: true },
  });

  // Notifie tous les users avec le tag "purchasing" qu'un bon de commande
  // a été soumis. Fire-and-forget (non bloquant).
  prisma.user.findMany({
    where: { capabilities: { has: "purchasing" }, isActive: true },
    select: { id: true },
  })
    .then(async (recipients) => {
      if (recipients.length === 0) return;
      const { notifyUsers } = await import("@/lib/notifications/notify");
      const poTitle = order.title ?? poNumber;
      const poBody = `${body.vendorName} · ${order.totalAmount?.toFixed(2)} ${order.currency} · Soumis par ${me.firstName} ${me.lastName}`;
      await notifyUsers(
        recipients.map((r) => r.id),
        "purchase_order_submitted",
        {
          title: `Nouvelle demande d'achat : ${poTitle}`,
          body: poBody,
          link: "/finances?tab=purchase_orders",
          emailSubject: `[${poNumber}] Demande d'achat : ${poTitle}`,
          email: {
            title: `Demande d'achat : ${poTitle}`,
            intro: `Une nouvelle demande d'achat a été soumise.`,
            metadata: [
              { label: "Bon de commande", value: poNumber },
              { label: "Titre", value: poTitle },
              { label: "Fournisseur", value: body.vendorName },
              { label: "Montant", value: `${order.totalAmount?.toFixed(2)} ${order.currency}` },
              { label: "Soumis par", value: `${me.firstName} ${me.lastName}` },
            ],
            ctaLabel: "Voir le bon de commande",
          },
        },
      );
    })
    .catch(() => {});

  return NextResponse.json(order, { status: 201 });
}
