export class RoomError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'RoomError';
    this.status = status;
  }
}
