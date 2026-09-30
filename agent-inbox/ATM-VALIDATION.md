# ATM validation status (9226526096)

## Already validated (agent-inbox/latest.log @ 2026-07-16T12:09)

- Photos anti-détection: 5/5
- Fill matrice OK: catégorie, marque ATM (brandId=506679), état, matière, couleur, taille (sizeId=3)
- Mode was still the old safe stop (pre-finish code)

## Full backup safety (v2.2.1+)

Local storage now keeps **metadata + original photo binaries + modified photo binaries**.
Delete is blocked if recoverable photos are missing. On failure, overlay offers download / restore.


## Live destructive run (needs you)

1. Reload extension 2.2.0
2. Enable **Autoriser suppression + publication**
3. Republish ATM
4. Expect: Validation OK → Brouillon sauvegardé → bouton rouge
5. Click confirm once
6. Drop overlay logs as `agent-inbox/latest.log`
