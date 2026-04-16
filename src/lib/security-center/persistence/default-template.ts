// ============================================================================
// DEFAULT HTML TEMPLATE for persistence_tool alerts.
//
// Stocké en DB (SecurityNotificationTemplate) pour être éditable depuis
// Paramètres. Ce fichier sert de valeur par défaut au premier seed. Basé
// sur le design créé dans le workflow n8n "Build Alert".
//
// Placeholders disponibles (substitution simple {{name}}) :
//   {{hostname}} {{clientCode}} {{clientName}} {{ipAddress}}
//   {{softwareName}} {{softwareNameNormalized}} {{softwareVersion}}
//   {{severity}} {{severityLabel}} {{severityBadgeBg}} {{severityBadgeText}} {{severityAccent}}
//   {{detectionTime}} {{ruleId}} {{ruleLevel}} {{module}} {{rawSubject}} {{rawDescription}}
//   {{whitelistAllowed}} {{whitelistLevel}} {{whitelistNotes}}
//   {{appUrl}} {{alertUrl}}
// ============================================================================

export const DEFAULT_PERSISTENCE_SUBJECT =
  "⛔ Cetix [{{hostname}}] : Installation de {{softwareNameNormalized}}";

export const DEFAULT_PERSISTENCE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{rawSubject}}</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:Arial,Helvetica,sans-serif; color:#111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f3f4f6; margin:0; padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px; background-color:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 8px 30px rgba(0,0,0,0.08);">

          <tr>
            <td style="padding:28px 32px 18px 32px; border-bottom:1px solid #e5e7eb; background:linear-gradient(135deg,#ffffff 0%,#f9fafb 100%);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td valign="middle" style="padding-bottom:14px;">
                    <img src="https://cetix.ca/wp-content/uploads/static-files/ctx-logo-n8n-175px.png" alt="Cetix" width="175" style="display:block; border:0; outline:none; text-decoration:none;">
                  </td>
                </tr>
                <tr>
                  <td valign="middle">
                    <div style="font-size:24px; line-height:32px; font-weight:700; color:#111827; margin:0 0 10px 0;">
                      Alerte de sécurité — Logiciel de persistance
                    </div>
                    <div style="font-size:14px; line-height:22px; color:#4b5563; margin:0;">
                      Une installation de logiciel de prise en main à distance ou de persistance a été détectée.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 8px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td valign="top" style="padding-right:12px;">
                    <span style="display:inline-block; padding:8px 14px; border-radius:999px; background:{{severityBadgeBg}}; color:{{severityBadgeText}}; font-size:13px; font-weight:700;">
                      Priorité {{severityLabel}}
                    </span>
                  </td>
                  <td valign="top" align="right">
                    <span style="display:inline-block; padding:8px 14px; border-radius:999px; background:#f3f4f6; color:#111827; font-size:13px; font-weight:700;">
                      Rule {{ruleId}}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:12px 32px 8px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb; border-left:6px solid {{severityAccent}}; border-radius:14px; overflow:hidden;">
                <tr>
                  <td style="padding:22px 22px 18px 22px;">
                    <div style="font-size:22px; line-height:30px; font-weight:700; color:#111827; margin:0 0 8px 0;">
                      {{softwareName}}
                    </div>
                    <div style="font-size:14px; line-height:22px; color:#4b5563; margin:0 0 18px 0;">
                      Installation détectée par {{module}}
                    </div>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td valign="top" width="50%" style="padding:0 10px 10px 0;">
                          <div style="font-size:12px; color:#6b7280; text-transform:uppercase;">Poste</div>
                          <div style="font-size:16px; color:#111827; font-weight:700; margin-top:4px;">{{hostname}}</div>
                        </td>
                        <td valign="top" width="50%" style="padding:0 0 10px 10px;">
                          <div style="font-size:12px; color:#6b7280; text-transform:uppercase;">Client</div>
                          <div style="font-size:16px; color:#111827; font-weight:700; margin-top:4px;">{{clientName}}</div>
                        </td>
                      </tr>
                      <tr>
                        <td valign="top" width="50%" style="padding:10px 10px 10px 0;">
                          <div style="font-size:12px; color:#6b7280; text-transform:uppercase;">Adresse IP</div>
                          <div style="font-size:15px; color:#111827; margin-top:4px;">{{ipAddress}}</div>
                        </td>
                        <td valign="top" width="50%" style="padding:10px 0 10px 10px;">
                          <div style="font-size:12px; color:#6b7280; text-transform:uppercase;">Heure de détection</div>
                          <div style="font-size:15px; color:#111827; margin-top:4px;">{{detectionTime}}</div>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" valign="top" style="padding:10px 0 0 0;">
                          <div style="font-size:12px; color:#6b7280; text-transform:uppercase;">Description</div>
                          <div style="font-size:15px; color:#111827; margin-top:4px; word-break:break-word;">{{rawDescription}}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px 8px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb; border-radius:14px;">
                <tr>
                  <td style="padding:20px 22px;">
                    <div style="font-size:18px; line-height:26px; font-weight:700; color:#111827; margin:0 0 14px 0;">
                      Résumé whitelist
                    </div>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="50%" valign="top" style="padding:0 10px 10px 0;">
                          <div style="font-size:12px; color:#6b7280; text-transform:uppercase;">Autorisé</div>
                          <div style="font-size:15px; color:#111827; margin-top:4px;">{{whitelistAllowed}}</div>
                        </td>
                        <td width="50%" valign="top" style="padding:0 0 10px 10px;">
                          <div style="font-size:12px; color:#6b7280; text-transform:uppercase;">Niveau de match</div>
                          <div style="font-size:15px; color:#111827; margin-top:4px;">{{whitelistLevel}}</div>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" valign="top" style="padding:10px 0 0 0;">
                          <div style="font-size:12px; color:#6b7280; text-transform:uppercase;">Notes</div>
                          <div style="font-size:15px; color:#111827; margin-top:4px; word-break:break-word;">{{whitelistNotes}}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px 16px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb; border-radius:14px;">
                <tr>
                  <td style="padding:20px 22px;">
                    <div style="font-size:18px; line-height:26px; font-weight:700; color:#111827; margin:0 0 14px 0;">
                      Résumé technique
                    </div>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="50%" valign="top" style="padding:0 10px 10px 0;">
                          <div style="font-size:12px; color:#6b7280; text-transform:uppercase;">Nom normalisé</div>
                          <div style="font-size:15px; color:#111827; margin-top:4px;">{{softwareNameNormalized}}</div>
                        </td>
                        <td width="50%" valign="top" style="padding:0 0 10px 10px;">
                          <div style="font-size:12px; color:#6b7280; text-transform:uppercase;">Version</div>
                          <div style="font-size:15px; color:#111827; margin-top:4px;">{{softwareVersion}}</div>
                        </td>
                      </tr>
                      <tr>
                        <td width="50%" valign="top" style="padding:10px 10px 10px 0;">
                          <div style="font-size:12px; color:#6b7280; text-transform:uppercase;">Module</div>
                          <div style="font-size:15px; color:#111827; margin-top:4px;">{{module}}</div>
                        </td>
                        <td width="50%" valign="top" style="padding:10px 0 10px 10px;">
                          <div style="font-size:12px; color:#6b7280; text-transform:uppercase;">Niveau Wazuh</div>
                          <div style="font-size:15px; color:#111827; margin-top:4px;">{{ruleLevel}}</div>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" valign="top" style="padding:10px 0 0 0;">
                          <div style="font-size:12px; color:#6b7280; text-transform:uppercase;">Sujet original</div>
                          <div style="font-size:15px; color:#111827; margin-top:4px; word-break:break-word;">{{rawSubject}}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 32px 28px 32px;" align="center">
              <a href="{{alertUrl}}" style="display:inline-block; padding:12px 26px; background:{{severityAccent}}; color:#ffffff; border-radius:10px; text-decoration:none; font-weight:700; font-size:14px;">
                Ouvrir dans Nexus →
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 32px; background:#111827; color:#d1d5db; font-size:12px; line-height:20px;">
              Cetix · Notification automatisée de sécurité
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export const DEFAULT_PERSISTENCE_TEXT = `Alerte de sécurité — Logiciel de persistance

Installation détectée sur un poste surveillé.

Poste            : {{hostname}}
Client           : {{clientName}}
Adresse IP       : {{ipAddress}}
Logiciel         : {{softwareName}}
Nom normalisé    : {{softwareNameNormalized}}
Version          : {{softwareVersion}}
Règle            : {{ruleId}} (niveau {{ruleLevel}})
Whitelist        : {{whitelistAllowed}} (niveau {{whitelistLevel}})
Notes            : {{whitelistNotes}}
Heure détection  : {{detectionTime}}

Ouvrir dans Nexus : {{alertUrl}}
`;

export const DEFAULT_PERSISTENCE_RECIPIENTS = ["alertes-securite@cetix.ca"];
