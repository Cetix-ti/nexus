// Seed des templates email par défaut. Idempotent : skip si la row
// existe déjà (l'admin peut les avoir personnalisés). Pour forcer un
// reset, passer --force en CLI.
//
// Run :
//   npx tsx scripts/seed-email-templates.ts          (skip existants)
//   npx tsx scripts/seed-email-templates.ts --force  (overwrite tous)

import prisma from "../src/lib/prisma";
import { EVENT_VARIABLES } from "../src/lib/email/variable-catalog";

interface TemplateSeed {
  eventKey: string;
  name: string;
  subject: string;
  body: string;
}

// ----------------------------------------------------------------------------
// Helpers de mise en page (HTML inline-styled, compatible Outlook)
// ----------------------------------------------------------------------------
function block(html: string): string {
  return `<div style="margin:0 0 18px;">${html}</div>`;
}
function quote(html: string, accent = "#2563EB"): string {
  return `<div style="border-left:3px solid ${accent};background:#F8FAFC;border-radius:0 8px 8px 0;padding:12px 16px;margin:0 0 18px;font-size:14px;color:#334155;line-height:1.6;">${html}</div>`;
}
function metaRow(label: string, value: string): string {
  return `<tr><td style="padding:6px 0;font-size:13px;color:#64748B;width:40%;">${label}</td><td style="padding:6px 0;font-size:13px;color:#0F172A;font-weight:500;">${value}</td></tr>`;
}
function metaTable(rows: { label: string; value: string }[]): string {
  return `<table style="width:100%;border-collapse:collapse;margin:0 0 18px;">${rows.map((r) => metaRow(r.label, r.value)).join("")}</table>`;
}
function priorityChip(): string {
  return `<span style="display:inline-block;background:#FEE2E2;color:#991B1B;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600;margin-left:8px;">{{ticket_priority_label}}</span>`;
}

// ----------------------------------------------------------------------------
// Templates par event — contenu riche, variables cataloguées
// ----------------------------------------------------------------------------
const SEEDS: TemplateSeed[] = [
  {
    eventKey: "ticket_assigned",
    name: "Ticket assigné",
    subject: "[{{org_name}}] {{ticket_priority_emoji}} {{ticket_display_number}} — {{ticket_subject}}",
    body: [
      block(`<p style="margin:0 0 6px;font-size:13px;color:#64748B;">Vous êtes maintenant responsable de ce ticket :</p><p style="margin:0;font-size:18px;font-weight:600;color:#0F172A;">{{ticket_subject}}${priorityChip()}</p>`),
      metaTable([
        { label: "Numéro", value: "{{ticket_display_number}}" },
        { label: "Client", value: "{{org_name}}" },
        { label: "Demandeur", value: "{{requester_name}}" },
        { label: "Statut", value: "{{ticket_status_label}}" },
        { label: "Échéance SLA", value: "{{ticket_sla_deadline}}" },
        { label: "Créé le", value: "{{ticket_created_at}}" },
      ]),
      block(`<p style="margin:0 0 8px;font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.6px;">Description</p>${quote("{{ticket_description_excerpt}}")}`),
    ].join(""),
  },
  {
    eventKey: "ticket_unassigned_pool",
    name: "Nouveau ticket non assigné (pool agents)",
    subject: "[{{org_name}}] {{ticket_priority_emoji}} Nouveau ticket à prendre — {{ticket_subject}}",
    body: [
      block(`<p style="margin:0 0 6px;font-size:13px;color:#64748B;">Un nouveau ticket attend un agent :</p><p style="margin:0;font-size:18px;font-weight:600;color:#0F172A;">{{ticket_subject}}${priorityChip()}</p>`),
      metaTable([
        { label: "Numéro", value: "{{ticket_display_number}}" },
        { label: "Client", value: "{{org_name}}" },
        { label: "Demandeur", value: "{{requester_name}}" },
        { label: "Échéance SLA", value: "{{ticket_sla_deadline}}" },
      ]),
      block(`<p style="margin:0 0 8px;font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.6px;">Description</p>${quote("{{ticket_description_excerpt}}")}`),
    ].join(""),
  },
  {
    eventKey: "ticket_collaborator_added",
    name: "Ajouté comme collaborateur",
    subject: "[{{org_name}}] Vous collaborez sur {{ticket_display_number}}",
    body: [
      block(`<p style="margin:0;font-size:14px;color:#0F172A;line-height:1.6;"><strong>{{actor_name}}</strong> vous a ajouté comme collaborateur sur :</p><p style="margin:8px 0 0;font-size:16px;font-weight:600;color:#0F172A;">{{ticket_subject}}</p>`),
      metaTable([
        { label: "Numéro", value: "{{ticket_display_number}}" },
        { label: "Client", value: "{{org_name}}" },
        { label: "Assigné", value: "{{assignee_name}}" },
        { label: "Statut", value: "{{ticket_status_label}}" },
      ]),
    ].join(""),
  },
  {
    eventKey: "ticket_status_change",
    name: "Changement de statut",
    subject: "[{{org_name}}] {{ticket_display_number}} : {{previous_status_label}} → {{ticket_status_label}}",
    body: [
      block(`<p style="margin:0;font-size:14px;color:#0F172A;"><strong>{{actor_name}}</strong> a changé le statut du ticket.</p>`),
      metaTable([
        { label: "Numéro", value: "{{ticket_display_number}}" },
        { label: "Sujet", value: "{{ticket_subject}}" },
        { label: "Client", value: "{{org_name}}" },
        { label: "Ancien statut", value: "{{previous_status_label}}" },
        { label: "Nouveau statut", value: "{{ticket_status_label}}" },
      ]),
    ].join(""),
  },
  {
    eventKey: "ticket_resolved",
    name: "Ticket résolu",
    subject: "✓ [{{org_name}}] {{ticket_display_number}} résolu — {{ticket_subject}}",
    body: [
      block(`<p style="margin:0;font-size:14px;color:#0F172A;"><strong>{{actor_name}}</strong> a marqué ce ticket comme résolu.</p>`),
      metaTable([
        { label: "Numéro", value: "{{ticket_display_number}}" },
        { label: "Sujet", value: "{{ticket_subject}}" },
        { label: "Client", value: "{{org_name}}" },
        { label: "Demandeur", value: "{{requester_name}}" },
      ]),
    ].join(""),
  },
  {
    eventKey: "ticket_comment",
    name: "Nouveau commentaire",
    subject: "[{{org_name}}] {{ticket_display_number}} — {{actor_name}} a commenté",
    body: [
      block(`<p style="margin:0 0 4px;font-size:13px;color:#64748B;">{{actor_name}} a ajouté un commentaire sur :</p><p style="margin:0;font-size:16px;font-weight:600;color:#0F172A;">{{ticket_subject}}</p>`),
      quote("{{comment_excerpt}}"),
      metaTable([
        { label: "Numéro", value: "{{ticket_display_number}}" },
        { label: "Client", value: "{{org_name}}" },
        { label: "Statut", value: "{{ticket_status_label}}" },
      ]),
    ].join(""),
  },
  {
    eventKey: "ticket_mention",
    name: "Mention dans un commentaire",
    subject: "[{{org_name}}] @mention sur {{ticket_display_number}}",
    body: [
      block(`<p style="margin:0;font-size:14px;color:#0F172A;"><strong>{{actor_name}}</strong> vous a mentionné dans un commentaire.</p>`),
      quote("{{comment_excerpt}}", "#9D174D"),
      metaTable([
        { label: "Ticket", value: "{{ticket_display_number}} — {{ticket_subject}}" },
        { label: "Client", value: "{{org_name}}" },
      ]),
    ].join(""),
  },
  {
    eventKey: "ticket_reminder",
    name: "Rappel de ticket",
    subject: "Rappel — {{ticket_display_number}} — {{ticket_subject}}",
    body: [
      block(`<p style="margin:0;font-size:14px;color:#0F172A;">Rappel programmé sur ce ticket :</p>`),
      quote("{{reminder_message}}", "#B45309"),
      metaTable([
        { label: "Numéro", value: "{{ticket_display_number}}" },
        { label: "Sujet", value: "{{ticket_subject}}" },
        { label: "Client", value: "{{org_name}}" },
        { label: "Statut", value: "{{ticket_status_label}}" },
      ]),
    ].join(""),
  },
  {
    eventKey: "ticket_approval_decided",
    name: "Décision d'approbation",
    subject: "[{{org_name}}] Ticket {{ticket_display_number}} — {{approval_decision_label}}",
    body: [
      block(`<p style="margin:0;font-size:14px;color:#0F172A;"><strong>{{actor_name}}</strong> a <strong>{{approval_decision_label}}</strong> ce ticket.</p>`),
      quote("{{approval_note}}"),
      metaTable([
        { label: "Numéro", value: "{{ticket_display_number}}" },
        { label: "Sujet", value: "{{ticket_subject}}" },
        { label: "Client", value: "{{org_name}}" },
      ]),
    ].join(""),
  },
  {
    eventKey: "project_assigned",
    name: "Projet assigné",
    subject: "[{{org_name}}] Projet — {{project_name}}",
    body: [
      block(`<p style="margin:0;font-size:14px;color:#0F172A;">Vous êtes maintenant responsable du projet <strong>{{project_name}}</strong> chez <strong>{{org_name}}</strong>.</p>`),
    ].join(""),
  },
  {
    eventKey: "backup_failed",
    name: "Sauvegarde en échec",
    subject: "[{{org_name}}] ⚠ Sauvegarde en échec — {{backup_job_name}}",
    body: [
      block(`<p style="margin:0;font-size:14px;color:#0F172A;">Le job de sauvegarde <strong>{{backup_job_name}}</strong> de <strong>{{org_name}}</strong> est en échec.</p>`),
      quote("{{backup_failure_reason}}", "#991B1B"),
    ].join(""),
  },
  {
    eventKey: "monitoring_alert",
    name: "Alerte monitoring",
    subject: "[{{org_name}}] {{alert_severity}} — {{alert_title}}",
    body: [
      block(`<p style="margin:0 0 4px;font-size:13px;color:#64748B;">Source : <strong>{{alert_source}}</strong> · Sévérité : <strong>{{alert_severity}}</strong></p><p style="margin:0;font-size:16px;font-weight:600;color:#0F172A;">{{alert_title}}</p>`),
      quote("{{alert_message}}", "#991B1B"),
    ].join(""),
  },
  {
    eventKey: "meeting_invite",
    name: "Invitation à une rencontre",
    subject: "Invitation — {{meeting_title}} — {{meeting_starts_at}}",
    body: [
      block(`<p style="margin:0 0 4px;font-size:13px;color:#64748B;">Vous êtes invité à :</p><p style="margin:0;font-size:18px;font-weight:600;color:#0F172A;">{{meeting_title}}</p>`),
      metaTable([
        { label: "Quand", value: "{{meeting_starts_at}}" },
        { label: "Où", value: "{{meeting_location}}" },
        { label: "Client", value: "{{org_name}}" },
      ]),
    ].join(""),
  },
  {
    eventKey: "meeting_reminder",
    name: "Rappel de rencontre",
    subject: "Rappel — {{meeting_title}} dans {{meeting_minutes_until}} min",
    body: [
      block(`<p style="margin:0;font-size:14px;color:#0F172A;">Votre rencontre <strong>{{meeting_title}}</strong> commence dans <strong>{{meeting_minutes_until}} minutes</strong> ({{meeting_starts_at}}).</p>`),
    ].join(""),
  },
  {
    eventKey: "renewal_reminder",
    name: "Renouvellement à venir",
    subject: "[{{org_name}}] Renouvellement — {{renewal_label}} dans {{renewal_days_left}} j",
    body: [
      block(`<p style="margin:0 0 4px;font-size:13px;color:#64748B;">Type : <strong>{{renewal_type}}</strong></p><p style="margin:0;font-size:18px;font-weight:600;color:#0F172A;">{{renewal_label}}</p>`),
      metaTable([
        { label: "Client", value: "{{org_name}}" },
        { label: "Échéance", value: "{{renewal_due_at}}" },
        { label: "Jours restants", value: "{{renewal_days_left}}" },
        { label: "Montant prévu", value: "{{renewal_amount}}" },
      ]),
    ].join(""),
  },
  {
    eventKey: "weekly_digest",
    name: "Résumé hebdomadaire",
    subject: "[Nexus] Votre semaine — {{week_range}}",
    body: [
      block(`<p style="margin:0;font-size:14px;color:#0F172A;">Bonjour <strong>{{agent_name}}</strong>,</p><p style="margin:8px 0 0;font-size:13px;color:#64748B;">Voici un récapitulatif de la période <strong>{{week_range}}</strong>.</p>`),
      metaTable([
        { label: "Tickets traités", value: "{{tickets_created}}" },
        { label: "Tickets résolus", value: "{{tickets_resolved}}" },
        { label: "Tickets en retard", value: "{{tickets_overdue}}" },
        { label: "Heures saisies", value: "{{hours_logged}} h" },
        { label: "Renouvellements (14 j)", value: "{{upcoming_renewals}}" },
        { label: "Visites sur place (7 j)", value: "{{upcoming_visits}}" },
      ]),
    ].join(""),
  },
  {
    eventKey: "bug_reported",
    name: "Bug signalé (admin)",
    subject: "[Bug {{bug_severity}}] {{bug_title}}",
    body: [
      block(`<p style="margin:0 0 4px;font-size:13px;color:#64748B;">Signalé par <strong>{{reporter_name}}</strong></p><p style="margin:0;font-size:18px;font-weight:600;color:#0F172A;">{{bug_title}}</p>`),
      metaTable([
        { label: "Sévérité", value: "{{bug_severity}}" },
        { label: "Auteur", value: "{{reporter_name}}" },
      ]),
    ].join(""),
  },
  {
    eventKey: "bug_reported_ack",
    name: "Bug enregistré (auteur)",
    subject: "Votre bug est enregistré — {{bug_title}}",
    body: [
      block(`<p style="margin:0;font-size:14px;color:#0F172A;">Merci <strong>{{reporter_name}}</strong>, votre signalement a bien été reçu.</p><p style="margin:8px 0 0;font-size:13px;color:#64748B;">Vous serez notifié quand le bug sera traité.</p>`),
      quote("{{bug_title}}"),
    ].join(""),
  },
  {
    eventKey: "ticket_creation_confirm",
    name: "Confirmation création ticket (client)",
    subject: "Votre demande {{ticket_display_number}} est enregistrée",
    body: [
      block(`<p style="margin:0;font-size:14px;color:#0F172A;">Bonjour <strong>{{requester_name}}</strong>,</p><p style="margin:8px 0 0;font-size:14px;color:#0F172A;">Nous avons bien reçu votre demande. Notre équipe va l'analyser et vous reviendra rapidement.</p>`),
      metaTable([
        { label: "Numéro", value: "{{ticket_display_number}}" },
        { label: "Sujet", value: "{{ticket_subject}}" },
        { label: "Reçue le", value: "{{ticket_created_at}}" },
      ]),
    ].join(""),
  },
  {
    eventKey: "ticket_taken_over",
    name: "Ticket pris en charge (client)",
    subject: "Votre demande {{ticket_display_number}} est prise en charge",
    body: [
      block(`<p style="margin:0;font-size:14px;color:#0F172A;">Bonjour <strong>{{requester_name}}</strong>,</p><p style="margin:8px 0 0;font-size:14px;color:#0F172A;">Votre demande est maintenant prise en charge par <strong>{{assignee_name}}</strong>.</p>`),
      metaTable([
        { label: "Numéro", value: "{{ticket_display_number}}" },
        { label: "Sujet", value: "{{ticket_subject}}" },
      ]),
    ].join(""),
  },
  {
    eventKey: "ticket_reply",
    name: "Réponse au ticket (client)",
    subject: "Réponse — {{ticket_display_number}} — {{ticket_subject}}",
    body: [
      block(`<p style="margin:0;font-size:14px;color:#0F172A;">Bonjour <strong>{{requester_name}}</strong>,</p><p style="margin:8px 0 0;font-size:13px;color:#64748B;">Nouvelle réponse de <strong>{{actor_name}}</strong> :</p>`),
      quote("{{reply_excerpt}}"),
    ].join(""),
  },
];

async function main() {
  const force = process.argv.includes("--force");
  const knownEvents = new Set(EVENT_VARIABLES.map((e) => e.eventKey));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const seed of SEEDS) {
    const audience = EVENT_VARIABLES.find((e) => e.eventKey === seed.eventKey)?.audience ?? "agent";
    const variables = EVENT_VARIABLES.find((e) => e.eventKey === seed.eventKey)?.variables.map((v) => v.key) ?? [];

    const existing = await prisma.emailTemplate.findUnique({ where: { eventKey: seed.eventKey } });
    if (existing && !force) {
      skipped++;
      continue;
    }
    if (existing) {
      await prisma.emailTemplate.update({
        where: { eventKey: seed.eventKey },
        data: { name: seed.name, subject: seed.subject, body: seed.body, audience, variables, enabled: true },
      });
      updated++;
    } else {
      await prisma.emailTemplate.create({
        data: { eventKey: seed.eventKey, name: seed.name, subject: seed.subject, body: seed.body, audience, variables, enabled: true, locale: "fr-CA" },
      });
      created++;
    }

    if (!knownEvents.has(seed.eventKey)) {
      console.warn(`[seed] ⚠ ${seed.eventKey} — pas dans EVENT_VARIABLES (variables non documentées)`);
    }
  }

  console.log(`[seed] ${created} créés, ${updated} mis à jour, ${skipped} sautés (existaient déjà — utiliser --force pour overwrite)`);

  // Liste les events catalogués qui n'ont pas de seed (gap visible)
  const seededKeys = new Set(SEEDS.map((s) => s.eventKey));
  const missingSeeds = EVENT_VARIABLES.filter((e) => !seededKeys.has(e.eventKey)).map((e) => e.eventKey);
  if (missingSeeds.length > 0) {
    console.warn(`[seed] ⚠ ${missingSeeds.length} events catalogués sans template seedé:`, missingSeeds.join(", "));
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
