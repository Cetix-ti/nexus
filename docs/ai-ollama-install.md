# Installation Ollama sur le serveur Nexus (GPU P6000)

Ces commandes doivent être exécutées en sudo sur le serveur. Elles
n'ont pas été automatisées par le build pour laisser le contrôle manuel
sur l'installation d'un service système.

## 1. Prérequis — drivers NVIDIA & CUDA

Déjà installés (driver 535, CUDA 12.2). Vérifier avant de continuer :

```bash
nvidia-smi
```

Doit afficher la Quadro P6000 avec 24 GB de VRAM.

## 2. Installation Ollama

```bash
# Installation via script officiel (crée le user `ollama`, le service
# systemd `ollama.service` et configure le port 11434 par défaut).
curl -fsSL https://ollama.com/install.sh | sudo sh

# Vérifier que le service est actif et écoute localhost uniquement
# (on NE veut PAS exposer Ollama sur le réseau — il doit rester
# accessible UNIQUEMENT depuis Nexus sur le même serveur).
sudo systemctl status ollama
ss -tlnp | grep 11434
```

Le bind doit être `127.0.0.1:11434`. Si jamais c'est `0.0.0.0`, ajouter
dans `/etc/systemd/system/ollama.service.d/override.conf` :

```ini
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
```

Puis `sudo systemctl daemon-reload && sudo systemctl restart ollama`.

## 3. Télécharger les modèles

```bash
# Modèle chat principal — Llama 3.1 8B quantisé (Q4_K_M, ~4.7 GB VRAM)
sudo -u ollama ollama pull llama3.1:8b

# Optionnel — version plus grande si on a de la marge (Llama 3.1 70B
# dépasse 24 GB en Q4, donc on ne l'active PAS avec la P6000).
# Alternative plus légère pour classification ultra-rapide :
sudo -u ollama ollama pull qwen2.5:7b-instruct-q4_K_M

# Modèle d'embeddings (pour future Phase 2 — RAG vectoriel)
sudo -u ollama ollama pull nomic-embed-text
```

## 4. Vérification

```bash
# Chat de test
curl -s http://localhost:11434/api/chat -d '{
  "model": "llama3.1:8b",
  "messages": [{"role":"user","content":"Réponds en 5 mots: ça marche?"}],
  "stream": false
}' | jq .message.content

# Embedding de test
curl -s http://localhost:11434/api/embeddings -d '{
  "model": "nomic-embed-text",
  "prompt": "ticket imprimante hors ligne"
}' | jq '.embedding | length'
# Doit retourner 768 (dimension du modèle nomic-embed-text).
```

## 5. Configuration Nexus

Ajouter au `.env` de Nexus (ou laisser les défauts) :

```bash
# Défauts utilisés si non définis :
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b
```

Puis redémarrer Nexus :

```bash
sudo systemctl restart nexus
```

## 6. Santé & monitoring

L'orchestrateur Nexus (`src/lib/ai/orchestrator/`) cache l'availability
d'Ollama pendant 30 secondes. En cas de crash, Nexus bascule
automatiquement sur OpenAI pour les policies qui l'autorisent, et bloque
proprement les policies `regulated`.

Vérifier ponctuellement la charge GPU :

```bash
watch -n 2 nvidia-smi
```

Un appel Llama 3.1 8B Q4 utilise ~5 GB VRAM et dure 2-8 secondes selon
la longueur du prompt.

## 7. Mise à jour des modèles

```bash
sudo -u ollama ollama pull llama3.1:8b
sudo systemctl restart ollama
```

Ollama utilise le même tag par défaut — pas de rolling version.

## 8. Résidence des données

Ollama ne fait AUCUN appel externe après l'installation. Les prompts,
réponses, et poids du modèle restent sur le serveur. C'est la garantie
de résidence complète pour les tâches `sensitivity=regulated` et la
police par défaut des clients opt-out du cloud.
