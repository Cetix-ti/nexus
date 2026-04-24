# Installation Ollama sur la VM dédiée IA (GPU P6000)

> **Note d'architecture** — Ollama tourne sur une **VM Ubuntu dédiée**
> (`192.168.203.11`) avec le passthrough PCI GPU P6000 attaché. Nexus la
> joint via `OLLAMA_URL` en HTTP sur le LAN interne. Raison : le
> passthrough PCI d'un GPU bloque les snapshots VM, donc Veeam ne pouvait
> plus backup la VM Nexus quand le GPU y était attaché. Séparer isole
> l'état précieux (Postgres Nexus = snapshotté) du compute jetable
> (VM Ollama = poids re-téléchargeables).
>
> Les commandes ci-dessous s'exécutent **sur la VM Ollama**, pas sur Nexus.

Ces commandes doivent être exécutées en sudo sur la VM IA. Elles
n'ont pas été automatisées par le build pour laisser le contrôle manuel
sur l'installation d'un service système.

## 1. Prérequis — drivers NVIDIA & CUDA

Driver 535 + CUDA 12.2 recommandés. Vérifier :

```bash
nvidia-smi
```

Doit afficher la Quadro P6000 avec 24 GB de VRAM. Si absent, vérifier
que le passthrough PCI est bien actif côté ESXi/vCenter pour la VM.

## 2. Installation Ollama

```bash
# Installation via script officiel (crée le user `ollama`, le service
# systemd `ollama.service` et configure le port 11434 par défaut).
curl -fsSL https://ollama.com/install.sh | sudo sh

sudo systemctl status ollama
```

## 3. Exposer Ollama sur l'interface LAN

Par défaut le daemon bind `127.0.0.1` — inaccessible depuis Nexus.
Créer l'override :

```bash
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf >/dev/null <<'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
EOF

sudo systemctl daemon-reload && sudo systemctl restart ollama
ss -tlnp | grep 11434   # doit afficher 0.0.0.0:11434
```

**Firewall** : Ollama n'a aucune auth native. La VM doit bloquer tout
trafic entrant 11434 sauf depuis l'IP exacte de Nexus. Exemple UFW :

```bash
sudo ufw default deny incoming
sudo ufw allow from 192.168.204.11 to any port 11434 proto tcp
sudo ufw allow ssh
sudo ufw enable
```

(Adapter `192.168.204.11` à l'IP LAN réelle de Nexus.)

## 4. Télécharger les modèles

```bash
# Modèles par défaut utilisés par Nexus (OLLAMA_MODEL / OLLAMA_MODEL_SMALL)
sudo -u ollama ollama pull gemma3:12b
sudo -u ollama ollama pull gemma3:4b

# Modèle d'embeddings (RAG Phase 2)
sudo -u ollama ollama pull nomic-embed-text
```

## 5. Vérification (depuis la VM Ollama)

```bash
curl -s http://localhost:11434/api/chat -d '{
  "model": "gemma3:12b",
  "messages": [{"role":"user","content":"Réponds en 5 mots: ça marche?"}],
  "stream": false
}' | jq .message.content

curl -s http://localhost:11434/api/embeddings -d '{
  "model": "nomic-embed-text",
  "prompt": "ticket imprimante hors ligne"
}' | jq '.embedding | length'
# Doit retourner 768.
```

Depuis la VM Nexus, valider la joignabilité :

```bash
curl -s http://192.168.203.11:11434/api/tags | jq '.models[].name'
```

## 6. Configuration Nexus

Sur Nexus (`/opt/nexus/.env`) :

```bash
OLLAMA_URL=http://192.168.203.11:11434
OLLAMA_MODEL=gemma3:12b
OLLAMA_MODEL_SMALL=gemma3:4b
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_KEEP_ALIVE=30m
```

Puis redémarrer Nexus :

```bash
sudo systemctl restart nexus
```

## 7. Santé & monitoring

L'orchestrateur Nexus (`src/lib/ai/orchestrator/`) cache l'availability
d'Ollama pendant 30 secondes. En cas de crash, Nexus bascule
automatiquement sur OpenAI pour les policies qui l'autorisent, et bloque
proprement les policies `regulated`.

Endpoint santé côté Nexus : `GET /api/v1/ai/health`.

Charge GPU sur la VM Ollama :

```bash
watch -n 2 nvidia-smi
```

Un appel gemma3:12b utilise ~9 GB VRAM.

## 8. Mise à jour des modèles

```bash
sudo -u ollama ollama pull gemma3:12b
sudo systemctl restart ollama
```

## 9. Résidence des données

Ollama ne fait AUCUN appel externe après l'installation. Les prompts,
réponses, et poids du modèle restent sur la VM. C'est la garantie
de résidence complète pour les tâches `sensitivity=regulated` et la
police par défaut des clients opt-out du cloud.
