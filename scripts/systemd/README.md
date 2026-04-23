# Timers systemd — Bug Reports

Installation sur le serveur primaire (CTX-NEXUS) :

```bash
# Copier les fichiers (sudo)
sudo cp /opt/nexus/scripts/systemd/nexus-bugfix.* /etc/systemd/system/
sudo cp /opt/nexus/scripts/systemd/nexus-bug-digest.* /etc/systemd/system/

# Créer les logs (owned par cetix pour append)
sudo touch /var/log/nexus-bugfix.log /var/log/nexus-bug-digest.log
sudo chown cetix:cetix /var/log/nexus-bugfix.log /var/log/nexus-bug-digest.log

# Enable + start
sudo systemctl daemon-reload
sudo systemctl enable --now nexus-bugfix.timer
sudo systemctl enable --now nexus-bug-digest.timer

# Vérif
systemctl list-timers | grep nexus
```

## Déclenchement manuel (test)

```bash
# Lancer un run auto-fix immédiat (traite jusqu'à 3 bugs approuvés)
sudo systemctl start nexus-bugfix.service

# Envoyer le digest tout de suite
sudo systemctl start nexus-bug-digest.service

# Ou directement via tsx
cd /opt/nexus && npx tsx src/workers/bugfix-worker.ts --max=1
cd /opt/nexus && npx tsx src/workers/bug-digest-worker.ts --force
```

## Variables ENV

Dans `/opt/nexus/.env` :

- `BUG_REPORTS_NOTIFY_EMAIL` — destinataire des emails (défaut : `informatique@cetix.ca`)
- `CLAUDE_CMD` — chemin vers binaire `claude` (défaut : `/home/cetix/.local/bin/claude`)
- `GH_CMD` — chemin vers binaire `gh` (défaut : `gh`)
- `ANTHROPIC_API_KEY` — requis pour Claude Code CLI
