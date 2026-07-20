export class ContractError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(`ContractError(${code}): ${message}`);
    this.name = 'ContractError';
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class UserRejectedError extends Error {
  constructor() {
    super('User rejected the transaction');
    this.name = 'UserRejectedError';
  }
}
