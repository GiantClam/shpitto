/** Public reservation command boundary. Implementation lives in allocate.ts so FEFO allocation
 * and its transaction cannot drift apart. */
export {
  reserveCredits,
  reserveCreditsInTransaction,
  type ReservationExecution,
  type ReservationInput,
  type ReservationResult,
} from './allocate.ts';
