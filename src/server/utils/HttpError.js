// An Error that also carries an HTTP status code.
// Controllers "throw new HttpError(404, 'Task not found')" and the error handler
// turns it into the JSON response { error: { message, details } } with that status.

export class HttpError extends Error {
  /**
   * @param {number} status   HTTP status code (400, 401, 403, 404, 409, ...)
   * @param {string} message  A friendly message the UI can show to the user
   * @param {any} [details]   Optional extra information (e.g. which field is wrong)
   */
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}
