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

}