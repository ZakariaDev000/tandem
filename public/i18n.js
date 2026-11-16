// Textes de l'interface. La langue suit celle du navigateur ; l'anglais sert de repli.
// Pour ajouter une langue : copier le bloc « en », le traduire, et c'est tout.
// On peut forcer une langue avec ?lang=fr dans l'adresse.
(function () {
  const dictionaries = {
    en: {
      'rooms.label': 'Rooms',
      'room.new': '+ New room',
      'room.delete': 'Delete this room',
      'room.noFolder': 'Just a discussion, no folder',
      'room.readOnly': 'read only',
      'room.defaultTitle': 'Room of {date}',
      'office.label': 'Office',
      'office.hint': 'Click a character to write to them.',
      'office.you': 'You',
      'office.thinking': 'thinking…',
      'chat.label': 'Conversation',
      'chat.empty': 'Write your request below. Claude and ChatGPT split the work and tell you when they are done.',
      'control.pause': 'Pause',
      'control.resume': 'Resume',
      'control.stop': 'Stop',
      'status.stopping': 'Stopping…',
      'status.working': '{name} is working…',
      'status.paused': 'Paused',
      'status.done': 'Exchange finished',
      'status.waiting': 'Waiting',
      'status.ready': 'Ready',
      'target.label': 'Recipient',
      'target.both': 'Both',
      'input.placeholder': 'Explain what you want them to do together',
      'input.label': 'Message',
      'input.send': 'Send',
      'to.both': 'to both',
      'to.you': 'to you',
      'to.name': 'to {name}',
      'actions.one': '1 action',
      'actions.many': '{n} actions',
      'action.read': 'Reads {target}',
      'action.edit': 'Edits {target}',
      'action.editFiles': 'Edits files',
      'action.run': 'Runs: {target}',
      'action.search': 'Searches for {target}',
      'action.web': 'Searches the web: {target}',
      'action.open': 'Opens {target}',
      'action.tool': 'Uses {target}',
      'system.stopped': 'You stopped {name}.',
      'system.failed': '{name} could not reply. {detail}',
      'image.open': 'Open {name} at full size',
      'delete.confirm': 'Delete the room “{title}” and its conversation?',
      'delete.keepFolder': 'The working folder and its files are left untouched.',
      'empty.title': 'Open your first room',
      'empty.body': 'A room brings Claude and ChatGPT together around one topic. They talk, work, and stop when they have nothing left to ask each other.',
      'empty.create': 'Create a room',
      'dialog.title': 'New room',
      'dialog.topic': 'Topic',
      'dialog.topicExample': 'Homepage redesign',
      'dialog.folder': 'Working folder',
      'dialog.folderNone': 'None: just a discussion',
      'dialog.pick': 'Choose…',
      'dialog.pickPrompt': 'Working folder for the room',
      'dialog.access': 'Access to this folder',
      'dialog.accessWrite': 'Read and edit files',
      'dialog.accessRead': 'Read only',
      'dialog.cancel': 'Cancel',
      'dialog.create': 'Create room',
      'error.generic': 'The request failed.',
      'error.folder_relative': 'Give the full path of the folder.',
      'error.folder_missing': 'This folder does not exist.',
      'error.empty_message': 'The message is empty.',
      'error.room_not_found': 'This room no longer exists.',
    },
    fr: {
      'rooms.label': 'Salons',
      'room.new': '+ Nouveau salon',
      'room.delete': 'Supprimer ce salon',
      'room.noFolder': 'Simple discussion, sans dossier',
      'room.readOnly': 'lecture seule',
      'room.defaultTitle': 'Salon du {date}',
      'office.label': 'Bureau',
      'office.hint': 'Clique sur un personnage pour lui écrire.',
      'office.you': 'Toi',
      'office.thinking': 'réfléchit…',
      'chat.label': 'Conversation',
      'chat.empty': 'Écris ta demande ci-dessous. Claude et ChatGPT se répartissent le travail et te préviennent quand ils ont fini.',
      'control.pause': 'Pause',
      'control.resume': 'Reprendre',
      'control.stop': 'Arrêter',
      'status.stopping': 'Arrêt en cours…',
      'status.working': '{name} travaille…',
      'status.paused': 'En pause',
      'status.done': 'Échange terminé',
      'status.waiting': 'En attente',
      'status.ready': 'Prêt',
      'target.label': 'Destinataire',
      'target.both': 'Aux deux',
      'input.placeholder': "Explique ce que tu veux qu'ils fassent ensemble",
      'input.label': 'Message',
      'input.send': 'Envoyer',
      'to.both': 'aux deux',
      'to.you': 'à toi',
      'to.name': 'à {name}',
      'actions.one': '1 action',
      'actions.many': '{n} actions',
      'action.read': 'Lit {target}',
      'action.edit': 'Modifie {target}',
      'action.editFiles': 'Modifie des fichiers',
      'action.run': 'Lance : {target}',
      'action.search': 'Cherche {target}',
      'action.web': 'Cherche sur le web : {target}',
      'action.open': 'Ouvre {target}',
      'action.tool': 'Utilise {target}',
      'system.stopped': 'Tu as arrêté {name}.',
      'system.failed': "{name} n'a pas pu répondre. {detail}",
      'image.open': 'Ouvrir {name} en grand',
      'delete.confirm': 'Supprimer le salon « {title} » et sa conversation ?',
      'delete.keepFolder': 'Le dossier de travail et ses fichiers ne sont pas touchés.',
      'empty.title': 'Ouvre ton premier salon',
      'empty.body': "Un salon réunit Claude et ChatGPT autour d'un sujet. Ils se parlent, travaillent, et s'arrêtent quand ils n'ont plus rien à se demander.",
      'empty.create': 'Créer un salon',
      'dialog.title': 'Nouveau salon',
      'dialog.topic': 'Sujet',
      'dialog.topicExample': "Refonte de la page d'accueil",
      'dialog.folder': 'Dossier de travail',
      'dialog.folderNone': 'Aucun : simple discussion',
      'dialog.pick': 'Choisir…',
      'dialog.pickPrompt': 'Dossier de travail du salon',
      'dialog.access': 'Droits sur ce dossier',
      'dialog.accessWrite': 'Lire et modifier les fichiers',
      'dialog.accessRead': 'Lire seulement',
      'dialog.cancel': 'Annuler',
      'dialog.create': 'Créer le salon',
      'error.generic': 'La demande a échoué.',
      'error.folder_relative': 'Donne le chemin complet du dossier.',
      'error.folder_missing': "Ce dossier n'existe pas.",
      'error.empty_message': 'Le message est vide.',
      'error.room_not_found': "Ce salon n'existe plus.",
    },
  };

  const supported = Object.keys(dictionaries);

  function pickLanguage() {
    const forced = new URLSearchParams(location.search).get('lang');
    const wanted = [forced].concat(navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]);
    for (const code of wanted) {
      const short = String(code || '').toLowerCase().split('-')[0];
      if (supported.includes(short)) return short;
    }
    return 'en';
  }

  const lang = pickLanguage();

  /** Renvoie le texte d'une clé, en remplaçant les {variables}. */
  function t(key, vars) {
    let text = dictionaries[lang][key];
    if (text === undefined) text = dictionaries.en[key];
    if (text === undefined) return key;
    return vars ? text.replace(/\{(\w+)\}/g, (_, name) => (vars[name] === undefined ? '' : String(vars[name]))) : text;
  }

  /** Remplit les textes fixes de la page : data-i18n, et data-i18n-<attribut>. */
  function apply(root) {
    root = root || document;
    for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const attr of ['placeholder', 'title', 'aria-label']) {
      for (const el of root.querySelectorAll(`[data-i18n-${attr}]`)) el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`)));
    }
    document.documentElement.lang = lang;
  }

  window.i18n = { lang, t, apply, supported };
})();
