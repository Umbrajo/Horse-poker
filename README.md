# River Club

Site statique de poker : solo et tutoriel avec IA, tables Supabase de six places maximum, sept langues. Jetons fictifs uniquement.

## Mettre à jour le site existant

Déployer le serveur **avant** de publier les nouveaux fichiers du site :

1. Supabase → **Edge Functions → Secrets** : ajouter `SITE_PASSWORD` avec le mot de passe choisi. Ne pas mettre ce mot de passe dans GitHub ni `config.js`. Pour le changer, modifier simplement ce secret dans Supabase. Le mot de passe précédent cesse de fonctionner dès les requêtes suivantes ; les joueurs doivent entrer le nouveau. Aucun compte nominatif n’est nécessaire : les sessions anonymes identifient les sièges en ligne, le mot de passe autorise chaque opération serveur. La vérification du mot de passe intervient avant tout appel à Auth ou à la base ; ouvrir le site en solo ne crée donc plus de session anonyme.
2. Dans la fonction `poker`, remplacer **index.ts** et **engine.js** par les fichiers de `supabase/functions/poker/`, puis déployer. Conserver **Verify JWT désactivé** : la fonction vérifie elle-même la session Supabase. Les secrets `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` restent côté serveur, fournis par Supabase.
3. Publier les fichiers statiques sur GitHub Pages après le déploiement de la fonction.

Le formulaire de mot de passe masque le site jusqu’à vérification serveur. Les fichiers statiques d’un dépôt GitHub public restent téléchargeables : cette configuration protège réellement les parties et les actions en ligne, pas la confidentialité du code ni une copie locale du solo. Protéger également les fichiers eux-mêmes nécessiterait un hébergeur avec contrôle d’accès.

Pour un nouveau projet : activer **Authentication → Anonymous Sign-Ins**, appliquer `supabase/migrations/202611030001_rooms.sql`, puis configurer l’URL et la clé **publique** dans `config.js`. Ne jamais utiliser une clé service_role dans le navigateur.

## Tables et tournois

- Le créateur choisit la variante, le format de mise, le nombre d’**Adversaires IA** (0 à 5), leur difficulté et le délai entre les mains (0 à 120 secondes), puis crée le salon. Le délai reste modifiable par l’hôte avec le bouton **Appliquer le délai entre les mains**, y compris en cours de partie ; les autres réglages sont figés à la création. Les invités voient le délai mais ne peuvent pas le modifier.
- Avec **0 IA**, la table attend au moins deux humains pour démarrer. En solo, sélectionner 0 IA affiche une invitation à passer en multijoueur et ne permet pas de démarrer une partie sans adversaire. Le nombre d’IA est exactement celui choisi. Les six places comprennent humains et IA : avec cinq IA, un seul humain peut jouer ; avec quatre IA, deux humains peuvent jouer. Les invités doivent rejoindre avant le démarrage.
- L’hôte lance la première main. Ensuite, les mains s’enchaînent automatiquement après le délai choisi (cinq secondes par défaut), jusqu’à ce qu’un seul joueur conserve des jetons. Les IA jouent côté serveur, sans recevoir les cartes cachées des adversaires pour leurs décisions.
- Les navigateurs actualisent leur présence toutes les trois secondes pendant une main, toutes les six secondes dans le salon, et toutes les trois à dix secondes pendant le délai entre les mains. Le délai de distribution est un minimum : la distribution a lieu à la prochaine actualisation reçue. En fin de tournoi, les actualisations s’arrêtent. Une absence de plus de 45 secondes entraîne l’abandon et la perte des jetons restants. Si la table avait plusieurs humains et qu’il n’en reste qu’un connecté, la partie s’arrête et ce dernier est déclaré gagnant. Une table créée avec un humain et des IA continue normalement jusqu’à la victoire finale.
- **Back to solo** quitte immédiatement la table et abandonne la partie en ligne. Pour une simple reconnexion, recharger la page et rejoindre le même code avant l’expiration du délai. La session du navigateur conserve le siège.
- La progression et les délais sont traités à la prochaine requête reçue : aucun service permanent ni tâche planifiée n’est nécessaire. Si tous les navigateurs sont fermés, aucune main n’est jouée en arrière-plan.
- Pour recommencer après la fin du tournoi, créer une nouvelle table. Il n’y a pas de transfert du rôle d’hôte dans le salon d’attente.

## Mises

**Fold**, **Check**, **Call**, **Bet** et **Raise** restent en anglais dans toutes les langues.

- **Fixed limit** : toutes les variantes, blindes 5/10 et mises 10/20.
- **No-limit** : Hold’em ; montant de Bet/Raise libre entre les bornes autorisées et le tapis.
- **Pot-limit** : Omaha ; montant de Bet/Raise limité par le pot.
- Razz, Stud, Stud Eight or Better et HORSE restent en limit fixe.

Le champ **Bet / Raise to** indique le montant total visé sur le tour de mise, pas le supplément. **Call** paie exactement la différence avec la mise en cours, ou le tapis restant s’il est inférieur. Le serveur vérifie les bornes et le tour de chaque joueur. Les pots secondaires sont gérés par le moteur.

## Développement et vérifications

Node 24+ est nécessaire pour les tests ; le site lui-même ne demande aucune compilation.

```sh
npm ci
npm test
python3 -m http.server 4173 --bind 0.0.0.0
```

Le client Supabase 2.99.1 est inclus dans `vendor/` ; aucune police ni bibliothèque externe n’est téléchargée par le navigateur.

Avec Chromium installé :

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

Les tests serveur utilisent une base et une authentification simulées. Les tests navigateur utilisent le véritable SDK Supabase avec des réponses API interceptées et un moteur serveur partagé, sans toucher au projet distant. Ils couvrent l’accès par mot de passe, un solo no-limit, les libellés des sept langues et deux navigateurs partageant une table avec une IA. Ils ne constituent pas une validation du déploiement Supabase réel.

Avant publication complète, vérifier sur le vrai projet : mauvais mot de passe refusé, bon mot de passe accepté, création et invitation, cartes privées, IA, mise personnalisée, main suivante automatique, reconnexion et victoire après départ du second humain. Surveiller les quotas Supabase : l’actualisation périodique consomme des invocations Edge Function.


## Mettre Supabase en pause et limiter les appels

Pour un projet **Free** dont le tableau de bord propose cette action : ouvrir **Project Settings → General → Pause project**, puis confirmer. Pour reprendre, utiliser **Restore project** depuis le tableau de bord. Cette opération s’applique au projet entier, pas seulement au poker : le jeu en ligne et la vérification du mot de passe sont indisponibles pendant la pause. Ne pas supprimer le projet pour l’arrêter. Si le forfait ne propose pas la pause, consulter les options du forfait ; il n’existe pas d’interrupteur dans ce site qui garantisse l’arrêt de la facturation du projet.

Les onglets arrêtent les actualisations après trois échecs consécutifs, avec des attentes croissantes avant l’arrêt. Le bouton **Reconnecter / Reconnect** permet un nouvel essai manuel après restauration. Une erreur de mot de passe réaffiche immédiatement le formulaire et arrête les actualisations. Les erreurs ne déclenchent pas de tentatives de connexion en boucle.

**Limite importante :** une requête à la fonction publique reste une invocation, même si le mot de passe est refusé. Le nouveau code refuse les mots de passe incorrects **avant** de créer un client serveur, d’appeler Auth ou d’accéder aux salons, et limite le corps des requêtes à 4 Kio ; ces mesures ne sont ni un pare-feu ni une limitation de fréquence distribuée. Le délai de réessai du navigateur peut être contourné par un bot. CORS et la clé publique Supabase ne bloquent pas les clients malveillants.

Sans infrastructure supplémentaire, utiliser un mot de passe long et aléatoire, garder les protections et limites de débit proposées par Supabase Auth, surveiller l’usage et les notifications de facturation, puis mettre le projet en pause hors utilisation. Les limites Auth concernent Auth, pas la fonction `poker`. Pour empêcher les tentatives sur le mot de passe de consommer des invocations Supabase, il faut un filtre externe (par exemple un proxy avec limitation de débit/CAPTCHA) **et** bloquer l’accès direct à l’origine ; aucune telle protection n’est configurée par cette version.
