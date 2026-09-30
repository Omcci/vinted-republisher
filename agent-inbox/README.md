# Agent inbox

Drop republisher logs here so the coding agent can self-iterate without chat round-trips.

## How

1. Reload the Chrome extension (`2.2.0+`)
2. Run a draft republication
3. On the overlay: **Copier logs** (downloads `latest.log`)
   or in the popup: **Outils développeur → Préparer logs agent**
4. Move/save the file as:

```
agent-inbox/latest.log
```

## Destructive finish (optional)

1. In the popup, enable **Autoriser suppression + publication**
2. Create the draft as usual
3. After validation + save, the overlay shows a red button:
   **Confirmer : supprimer originale + publier**
4. Click it once — only then is the original deleted and the new listing published

Without the toggle, the flow stops after a saved draft (safe mode).

## Restore from downloaded backup (v2.2.3+)

In the popup:

1. Section **Restaurer un backup**
2. Drag & drop `vinted-backup-….json` (JPEG extras optional if JSON already has photos)
3. Or click **Utiliser le dernier backup local**

On the overlay: **Importer backup**

Restore always runs in **safe mode** (no auto delete).
