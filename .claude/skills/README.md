# Skills installés

Skills officiels Anthropic copiés depuis `github.com/anthropics/skills`.
Auto-découverts par Claude Code à l'ouverture du projet — invocables
via slash command (`/<nom>`) ou auto-suggérés selon le contexte.

## Liste

| Skill | Quand l'utiliser |
|---|---|
| `frontend-design` | Créer/styler des composants UI Nexus avec une identité visuelle marquée. |
| `theme-factory` | Appliquer un thème (couleurs + typo) à un livrable (slides, doc, HTML). 10 thèmes pré-faits + génération à la volée. |
| `docx` | Créer/éditer/lire un document Word — propositions, rapports, lettres. |
| `xlsx` | Créer/éditer un tableur — exports financiers, listes de saisies de temps. |
| `pptx` | Créer/éditer un deck — présentations exécutives, revues client. |
| `pdf` | Manipuler un PDF — fusion, split, extraction, OCR, formulaires. |
| `doc-coauthoring` | Workflow guidé pour rédiger une doc structurée (proposal, spec). |
| `internal-comms` | Status reports, updates leadership, newsletters internes. |
| `brand-guidelines` | Identité visuelle Anthropic (à adapter pour Cetix au besoin). |
| `webapp-testing` | Scripts Playwright pour tester l'UI Nexus localement. |
| `skill-creator` | Créer/améliorer un Skill custom propre à Nexus. |

## Mise à jour

```bash
cd /tmp && rm -rf anthropic-skills
git clone --depth=1 https://github.com/anthropics/skills.git anthropic-skills
# puis recopier le sous-dossier voulu dans .claude/skills/
```

## Licences

- Apache 2.0 : `frontend-design`, `theme-factory`, `brand-guidelines`,
  `webapp-testing`, `internal-comms`, `doc-coauthoring`, `skill-creator`.
- Propriétaire (régi par les Commercial Terms Anthropic) :
  `docx`, `xlsx`, `pptx`, `pdf`. Utilisation autorisée uniquement
  via les services Anthropic (Claude Code, Claude API, Claude.ai).
