# Tandem

Un salon local où une session **Claude Code** et une session **Codex** (ChatGPT) travaillent ensemble : elles se posent des questions, se relisent, se passent des fichiers et des images, puis s'arrêtent quand elles n'ont plus rien à se demander.

Tout se passe dans une page web servie depuis votre machine : un petit bureau animé en pixels à gauche, la conversation complète à droite.

## Ce qu'il faut

- **Node.js 20** ou plus récent. Aucune dépendance à installer.
- **Claude Code** (`claude`) installé et connecté à votre compte.
- **Codex** (`codex`) installé et connecté à votre compte ChatGPT.

Tandem ne demande aucune clé API : il pilote les deux outils tels qu'ils sont installés chez vous, avec vos abonnements.

Tandem a été écrit et essayé sur macOS. Le bouton « Choisir… » du dossier de travail utilise la fenêtre de sélection de macOS ; ailleurs, saisissez le chemin à la main.

## Lancer

```bash
node server.js
```

Puis ouvrez <http://localhost:3210>.

Pour changer de port :

```bash
PORT=4000 node server.js
```

## Comment ça marche

1. **Vous ouvrez un salon** sur un sujet, avec ou sans dossier de travail.
2. **Vous écrivez** aux deux IA ou à une seule. Un clic sur un personnage le choisit comme destinataire.
3. **Chaque IA répond à son tour** dans sa propre session, qu'elle retrouve d'un tour à l'autre. Elle termine son message en disant à qui elle s'adresse : à l'autre IA, ou à vous.
4. **Le serveur transmet** le message au destinataire. Si c'est l'autre IA, elle prend la main.
5. **L'échange s'arrête** dès qu'une IA s'adresse à vous au lieu de relancer l'autre. Il n'y a pas de limite de tours.

Pendant ce temps, la page montre qui travaille, ce qu'il fait (fichier lu, commande lancée) et qui parle à qui. Les images créées pendant un tour s'affichent dans la conversation, et chaque version est conservée.

Vous pouvez mettre en pause, arrêter l'IA en cours, ou écrire en plein échange.

## Droits sur vos fichiers

À la création d'un salon, vous choisissez ce que les IA peuvent faire dans le dossier de travail :

| Réglage | Claude | ChatGPT |
|---|---|---|
| Lire et modifier | Modifie les fichiers du dossier. Ne lance que des commandes sans risque. | Travaille dans le bac à sable de Codex, limité au dossier. |
| Lire seulement | Ni modification ni commande. | Bac à sable en lecture seule. |

Un salon sans dossier reçoit un dossier vide rien qu'à lui, dans `data/workspaces/`.

## Sécurité

- Le serveur n'écoute que sur `127.0.0.1` : la page n'est pas joignable depuis une autre machine.
- Les actions exigent un en-tête qu'un autre site ouvert dans votre navigateur ne peut pas envoyer.
- Les deux IA agissent sur de vrais fichiers. Ouvrez un salon sur un dossier que vous acceptez de leur confier, de préférence suivi par git.

## Vos données

Tout reste sur votre machine, dans le dossier `data/` :

- `data/rooms/` : les salons et leurs conversations ;
- `data/media/` : une copie de chaque image créée ;
- `data/workspaces/` : les dossiers des salons sans projet.

Ce dossier est ignoré par git.

## Langues

L'interface suit la langue du navigateur : français ou anglais, avec l'anglais par défaut. Les deux IA répondent dans la langue de vos messages.

Pour ajouter une langue, copiez [`public/js/i18n/en.js`](public/js/i18n/en.js), traduisez-le et inscrivez-le dans [`public/js/i18n/index.js`](public/js/i18n/index.js). Pour forcer une langue, ajoutez `?lang=fr` à l'adresse.

## Organisation du code

Le serveur n'a aucune dépendance. Chaque module a une seule responsabilité, et [`server.js`](server.js) ne fait que les assembler.

| Module | Rôle |
|---|---|
| [`src/config.js`](src/config.js) | Port et emplacements des données. |
| [`src/store.js`](src/store.js) | Les salons : en mémoire, et un fichier JSON par salon. |
| [`src/protocol.js`](src/protocol.js) | Les consignes données aux IA et la lecture du destinataire de leurs réponses. |
| [`src/conductor.js`](src/conductor.js) | Le chef d'orchestre : à qui le tour, transmission des messages, pause et arrêt. |
| [`src/agents/`](src/agents) | Un adaptateur par IA (`claude.js`, `codex.js`) et le lanceur commun (`runner.js`). |
| [`src/images.js`](src/images.js) | Repère les images créées pendant un tour et en garde une copie. |
| [`src/events.js`](src/events.js) | Diffusion en direct vers la page (Server-Sent Events). |
| [`src/http/`](src/http) | Contrôle d'accès, routes de l'API, fichiers de la page. |

La page est écrite en modules JavaScript natifs, sans outil de construction, dans [`public/js/`](public/js) : le bureau animé (`office/`), la conversation (`chat/`), les traductions (`i18n/`) et le lien avec le serveur (`api.js`).

### Brancher une autre IA

Une IA est décrite par un adaptateur dans `src/agents/` : la commande à lancer, ses options, et la lecture de sa sortie. Pour en ajouter une, écrivez son adaptateur sur le modèle de [`claude.js`](src/agents/claude.js) et inscrivez-le dans [`src/agents/index.js`](src/agents/index.js). Aujourd'hui, un salon réunit exactement deux IA.

## Limites connues

- Arrêter une IA prend quelques secondes, le temps que son outil se ferme.
- Claude ne lance pas de commandes qui modifient le système (tests, installation) : il n'y a pas encore de niveau de droits plus large.
- Tandem pilote les sessions qu'il lance lui-même. Il ne se branche pas sur une session déjà ouverte dans une autre application.
