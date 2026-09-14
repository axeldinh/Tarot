export type EngineErrorCode =
  | 'wrong-phase'
  | 'wrong-player'
  | 'bid-too-low'
  | 'illegal-call'
  | 'illegal-ecart'
  | 'illegal-card'
  | 'illegal-poignee'
  | 'poignee-too-late'
  | 'poignee-already-announced'
  | 'invalid-deal'
  | 'chelem-already-announced'
  | 'unknown-action';

/** Every rejected action throws this, so callers can branch on `code`. */
export class EngineError extends Error {
  readonly code: EngineErrorCode;
  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}
