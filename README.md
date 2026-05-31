# Family agent

Application web familiale inspiree d'un mur type FamilyWall : planning partage, rappels recurrents, messages WhatsApp/email a envoyer, couleurs par personne et liste de courses commune.

## Ouvrir l'application

Ouvrez `index.html` dans un navigateur moderne. Aucun serveur ni package n'est necessaire.

Compte demo :

- Email : `camille@demo.fr`
- Mot de passe : `demo`

## Fonctions incluses

- Connexion et creation de comptes individuels stockes dans le navigateur.
- Famille partagee par code.
- Lien d'invitation pour rejoindre le groupe famille.
- Mur familial ludique avec resume du jour, prochains rendez-vous, courses rapides et activite recente.
- Planning hebdomadaire avec proprietaire et couleur par personne.
- Creation de rendez-vous avec rappel WhatsApp, email, copie de message ou notification navigateur.
- Rappels recurrents par jour de semaine, par exemple poubelle jaune le mercredi soir et poubelle grise le lundi soir.
- Liste de courses partagee avec quantite, rayon, coche par membre et nettoyage des achats faits.
- Profil personnel, couleur du membre et export JSON des donnees.
- Mise en page responsive avec navigation basse sur telephone.

## Publication GitHub Pages

1. Creez un depot GitHub.
2. Ajoutez `index.html`, `styles.css`, `app.js` et `README.md` a la racine.
3. Dans GitHub, ouvrez `Settings > Pages`.
4. Choisissez `Deploy from a branch`, puis la branche `main` et le dossier `/root`.
5. Validez, puis ouvrez l'URL GitHub Pages fournie.

## Notes importantes

Cette version est un prototype front-end : les donnees et les comptes restent dans le navigateur de l'utilisateur. Pour une vraie application familiale synchronisee entre plusieurs telephones, il faudra ajouter un backend d'authentification et une base de donnees, par exemple Supabase, Firebase ou un serveur Node/Python.

WhatsApp ne permet pas a une page web statique d'envoyer automatiquement des messages en arriere-plan. L'application prepare le message et ouvre WhatsApp avec le texte deja rempli.

Le lien d'invitation pre-remplit le code famille pour les nouveaux comptes. Dans cette version statique, les donnees restent locales au navigateur ; une synchronisation reelle entre plusieurs personnes demande un backend partage.
