use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("Invalid escrow state")]
    InvalidState,
    #[msg("Unauthorized action")]
    Unauthorized,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Escrow already finalized")]
    AlreadyFinalized,
    #[msg("Invalid amount - must be within allowed range")]
    InvalidAmount,
    #[msg("Buyer and seller must be different accounts")]
    InvalidParties,
    #[msg("Not the buyer of this escrow")]
    NotBuyer,
    #[msg("Not the seller of this escrow")]
    NotSeller,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Arbiter is not authorized or has been deactivated")]
    UnauthorizedArbiter,
}