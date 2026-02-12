use anchor_lang::prelude::*;

mod constants;
mod errors;
mod events;
mod instructions;
mod state;

pub use constants::*;
pub use errors::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("9X6QbCnVwTg1EjQDNt9KrT7rvJqPRVAUWfYCkNRZW9VY");

#[program]
pub mod escrow {
    use super::*;

    pub fn create_escrow(ctx: Context<CreateEscrow>, amount: u64) -> Result<()> {
        instructions::create_escrow::handler(ctx, amount)
    }

    pub fn release_funds(ctx: Context<ReleaseFunds>) -> Result<()> {
        instructions::release_funds::handler(ctx)
    }
}
