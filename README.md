# River Club — GitHub Pages + Supabase

Version statique du jeu, avec solo IA et multijoueur en ligne de 2 à 6 humains. Toutes les variantes et HORSE sont disponibles. L’hôte choisit la variante avant de créer le salon. Les joueurs rejoignent avant le départ. Le bouton Start game est réservé à l’hôte. Les mains suivantes sont distribuées par l’hôte. Le multijoueur n’utilise pas Undo et ne comporte pas d’IA.

## Installation (une fois)

1. Créez un projet Supabase. Dans **Authentication → Providers / Sign In**, activez les connexions anonymes (**Anonymous Sign-Ins**).
2. Dans **SQL Editor**, exécutez `supabase/migrations/202611030001_rooms.sql`.
3. Installez le CLI Supabase selon https://supabase.com/docs/guides/cli puis, depuis ce dossier :

   ```sh
   supabase login
   supabase link --project-ref VOTRE_REFERENCE_PROJET
   supabase functions deploy poker
   ```

   `supabase/config.toml` désactive la vérification JWT à la passerelle ; la fonction contrôle elle-même chaque session avec `auth.getUser`. Les secrets serveur SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis par Supabase. Ne publiez jamais la clé service_role.
4. Dans `config.js`, renseignez `supabaseUrl` et `supabaseAnonKey` (clé publique publishable ou ancienne clé anon, **jamais service_role**).
5. Déposez le contenu de ce dossier dans votre dépôt GitHub. Dans **Settings → Pages**, choisissez **Deploy from a branch → main → / (root)**. Les liens et fichiers utilisent des chemins relatifs, compatibles avec `https://utilisateur.github.io/depot/`.

## Jouer

Cliquez **Multiplayer**, entrez un pseudo et créez une table. Copiez son lien d’invitation. Les invités ouvrent ce lien, entrent leur pseudo et cliquent Rejoindre. L’hôte clique Start game quand tous sont présents. Chaque navigateur conserve sa session anonyme et peut rejoindre à nouveau le même salon après rechargement. Ne videz pas le stockage du navigateur pour conserver votre siège.

L’état partagé est actualisé toutes les trois secondes quand l’onglet est visible. Les actions sont validées côté serveur et les écritures concurrentes utilisent un numéro de version : une action en conflit doit être rejouée après actualisation. Seules les cartes autorisées sont envoyées à chaque participant. Les cartes couchées restent cachées à l’abattage.

## Limites de cette version

Le salon est fermé aux nouveaux joueurs après le démarrage. Un joueur absent conserve son siège et le jeu attend son retour si c’est son tour ; il n’y a pas encore de délai automatique, de remplacement par IA, ni de transfert de l’hôte. Le bouton Retour solo quitte l’écran multijoueur, pas le siège serveur. Créez un nouveau salon pour changer les participants. Les interfaces multijoueur utilisent des libellés anglais/français ; le jeu et ses règles gardent les sept langues existantes.

Aucun abonnement n’est engagé par ce code. Le polling consomme des invocations Edge Function : surveillez les quotas du forfait Supabase, surtout si plusieurs tables jouent longtemps. Les salons sont conservés dans poker_rooms. Supprimez les anciens salons depuis le tableau de bord Supabase si besoin. Pour une ouverture publique importante, configurez les protections anti-abus de Supabase Auth et les quotas.

## Architecture

- `index.html`, CSS et scripts : GitHub Pages, aucune compilation.
- `config.js` : configuration publique uniquement.
- `supabase/functions/poker` : moteur autoritaire et API authentifiée.
- `supabase/migrations` : table privée, RLS activée, aucun accès direct pour les navigateurs.

Le code est préparé et vérifié localement, mais le multijoueur ne peut fonctionner avant le déploiement de la fonction et la configuration de votre projet Supabase.

## Vérification locale

Avec Node.js 24 ou plus récent, `node tests/online.cjs` exécute les contrôles du serveur avec une base et une authentification simulées (salons, adhésion, hôte, tours, cartes privées, versions concurrentes). Ce contrôle ne remplace pas un essai entre deux navigateurs avec le projet Supabase déployé.

## État de l’implémentation

Le site est installé à la racine du dépôt. Le solo est disponible immédiatement, en français par défaut. Pour le lancer localement :

```sh
python3 -m http.server 4173 --bind 0.0.0.0
```

Le client Supabase officiel 2.99.1 est inclus dans `vendor/` (licence MIT, projet supabase/supabase-js). Aucun CDN ni téléchargement de police n’est nécessaire pour jouer.

Pour connecter le multijoueur, renseignez `config.js` avec l’URL du projet et sa clé publique, ou ouvrez **Multiplayer → Connexion Supabase**. Cette seconde option conserve les paramètres publics dans ce navigateur uniquement. Les autres joueurs devront aussi configurer leur navigateur si `config.js` reste vide. Les clés secrètes et service_role sont refusées par ce formulaire.

L’activation des connexions anonymes, la migration SQL et le déploiement de la fonction `poker` restent requis sur le véritable projet Supabase, selon les étapes ci-dessus. Aucune instance distante n’est créée automatiquement. Les tests avec base simulée vérifient aussi une main complète et la distribution suivante pour les six variantes, mais ne prouvent pas un déploiement distant.

### Validation avant publication

1. Exécuter `node tests/online.cjs` avec Node 24+.
2. Démarrer le serveur statique et terminer une main solo.
3. Une fois Supabase configuré, ouvrir deux navigateurs ou profils distincts, créer puis rejoindre un salon avec son code.
4. Distribuer en tant qu’hôte, vérifier que les cartes privées de l’adversaire sont masquées, jouer jusqu’au résultat, puis distribuer la main suivante.
5. Recharger un navigateur : rejoindre le même salon avec la session conservée doit retrouver le même siège.

Le multijoueur conserve les jetons sur le serveur. Le solo reste local. Il s’agit de jetons fictifs, sans paiement.
