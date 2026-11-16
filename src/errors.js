/** Erreur destinée à la page : un code stable qu'elle traduit, et un message de repli en anglais. */
class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Levée quand la personne arrête une IA en plein tour : ce n'est pas une panne. */
class StoppedError extends Error {
  constructor() {
    super('stopped');
  }
}

module.exports = { AppError, StoppedError };
